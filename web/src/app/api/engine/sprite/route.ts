// Sprite Load API — load PNG sprites onto field grid cells
// POST: accepts fieldId + spritePath or spriteBase64, paints sprite pixels onto the field

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadSprite, spriteToFieldCells, extractPalette } from '@/lib/sprite-loader'
import { getFieldSnapshot, appendMemory } from '../store'
import { GRID_SIZE } from '@/app/engine/types'

export const dynamic = 'force-dynamic'

async function checkAuth(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const envToken = process.env.ENGINE_AGENT_TOKEN
    if (envToken && token === envToken) return true
  }
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return false
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())
  return adminEmails.includes(session.user.email || '')
}

export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { fieldId, spritePath, spriteBase64, scale, x, y } = body

    if (!fieldId) {
      return NextResponse.json({ error: 'fieldId required' }, { status: 400 })
    }

    // Load the image buffer
    let imageBuffer: Buffer

    if (spriteBase64) {
      imageBuffer = Buffer.from(spriteBase64, 'base64')
    } else if (spritePath) {
      // Load from public/sprites/ directory
      const safePath = spritePath.replace(/\.\./g, '').replace(/^\//, '')
      const fullPath = join(process.cwd(), 'public', 'sprites', safePath)
      try {
        imageBuffer = readFileSync(fullPath)
      } catch {
        return NextResponse.json({ error: `Sprite not found: ${safePath}` }, { status: 404 })
      }
    } else {
      return NextResponse.json({ error: 'spritePath or spriteBase64 required' }, { status: 400 })
    }

    // Decode sprite with optional max size
    const maxSize = Math.min(scale ? Math.round(64 * scale) : 64, 128)
    const sprite = await loadSprite(imageBuffer, maxSize)

    // Determine target position — center of field or specified coords
    let targetX = x ?? GRID_SIZE / 2
    let targetY = y ?? GRID_SIZE / 2

    const fieldSnap = getFieldSnapshot(fieldId)
    if (fieldSnap?.bounds && x === undefined && y === undefined) {
      targetX = Math.round((fieldSnap.bounds.minX + fieldSnap.bounds.maxX) / 2)
      targetY = Math.round((fieldSnap.bounds.minY + fieldSnap.bounds.maxY) / 2)
    }

    // Map sprite pixels to grid cells
    const mapping = spriteToFieldCells(sprite, targetX, targetY)

    if (mapping.cells.length === 0) {
      return NextResponse.json({ error: 'Sprite produced no visible pixels' }, { status: 400 })
    }

    // Extract palette
    const palette = extractPalette(sprite, 8)

    // Build paint_pixels command and push it through the agent command queue
    const pixels = mapping.cells.map(idx => {
      const c = mapping.colorData.get(idx)!
      return { idx, color: c }
    })

    // Push via internal POST to agent route
    const agentUrl = new URL('/api/engine/agent', req.url)
    const command = {
      type: 'paint_pixels',
      fieldId,
      pixels,
    }

    const agentRes = await fetch(agentUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.get('authorization') || '',
        'Origin': req.headers.get('origin') || new URL(req.url).origin,
      },
      body: JSON.stringify(command),
    })

    if (!agentRes.ok) {
      const err = await agentRes.json()
      return NextResponse.json({ error: 'Failed to push paint command', detail: err }, { status: 500 })
    }

    // Record sprite metadata in field memory
    appendMemory(fieldId, {
      timestamp: new Date().toISOString(),
      type: 'effect_added',
      content: `Sprite loaded: ${spritePath || 'base64'} (${sprite.width}x${sprite.height}, ${mapping.cells.length} pixels)`,
      sourceFieldId: null,
      data: {
        spritePath: spritePath || null,
        spriteWidth: sprite.width,
        spriteHeight: sprite.height,
        cellCount: mapping.cells.length,
        palette: palette.slice(0, 4).map(c => [c.r, c.g, c.b]),
      },
    })

    return NextResponse.json({
      cellCount: mapping.cells.length,
      spriteWidth: sprite.width,
      spriteHeight: sprite.height,
      targetPosition: { x: targetX, y: targetY },
      palette: palette.map(c => ({
        r: Math.round(c.r * 255),
        g: Math.round(c.g * 255),
        b: Math.round(c.b * 255),
      })),
    })
  } catch (err) {
    console.error('Sprite load error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load sprite' },
      { status: 500 },
    )
  }
}
