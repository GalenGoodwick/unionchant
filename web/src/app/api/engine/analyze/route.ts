// Sprite Analysis API — Claude Vision analyzes sprites and labels color regions
// POST: accepts { fieldId } or { spritePath } or { imageBase64 }
// Runs flood-fill segmentation, sends region data + image to Claude Vision,
// returns per-region labels. Results stored in worldData and pushed to client.
// Rate-limited (30s per key), results cached.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { getFieldSnapshot, setWorldData, getWorldData, appendMemory } from '../store'
import { loadSprite, fieldToPng } from '@/lib/sprite-loader'
import { computeFullSegmentation } from '../sprites/semantics'
import { GRID_SIZE } from '@/app/engine/types'
import { readFileSync } from 'fs'
import type { FieldSnapshot } from '@/app/engine/types'

/** Get cell indices from a snapshot shape (v3: computed from shape + transform) */
function snapshotToCells(snapshot: FieldSnapshot): number[] {
  const GRID = 512
  const cells: number[] = []
  if (!snapshot.shape || !snapshot.bounds) return cells
  const b = snapshot.bounds
  const minX = Math.max(0, Math.floor(b.minX))
  const minY = Math.max(0, Math.floor(b.minY))
  const maxX = Math.min(GRID - 1, Math.ceil(b.maxX))
  const maxY = Math.min(GRID - 1, Math.ceil(b.maxY))
  const t = snapshot.transform
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (snapshot.shape.type === 'circle') {
        const dx = x - t.x, dy = y - t.y
        if (dx * dx + dy * dy <= snapshot.shape.radius * snapshot.shape.radius) cells.push(y * GRID + x)
      } else {
        if (snapshot.shape.type === 'rect' && x >= t.x && x < t.x + snapshot.shape.w && y >= t.y && y < t.y + snapshot.shape.h) cells.push(y * GRID + x)
      }
    }
  }
  return cells
}
import { join } from 'path'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Rate limiting
const g = globalThis as unknown as {
  __analyzeRateLimit?: Map<string, number>
}
const rateLimit: Map<string, number> = g.__analyzeRateLimit ??= new Map()
const RATE_LIMIT_MS = 30_000

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
    const { fieldId, spritePath, imageBase64 } = body

    const cacheKey = fieldId || spritePath || 'custom'
    const lastAnalysis = rateLimit.get(cacheKey) || 0
    if (Date.now() - lastAnalysis < RATE_LIMIT_MS) {
      const worldData = getWorldData()
      const cached = worldData[`analysis_${cacheKey}`]
      if (cached) {
        return NextResponse.json({ ...cached as Record<string, unknown>, cached: true })
      }
      return NextResponse.json(
        { error: `Rate limited. Wait ${Math.ceil((RATE_LIMIT_MS - (Date.now() - lastAnalysis)) / 1000)}s` },
        { status: 429 },
      )
    }

    // Load image and get pixel data for segmentation
    let base64Image: string
    let imageContext = ''
    let spritePixels: Float32Array | null = null
    let spriteW = 0
    let spriteH = 0

    if (imageBase64) {
      base64Image = imageBase64
      imageContext = 'custom image'
    } else if (spritePath) {
      const safePath = spritePath.replace(/\.\./g, '').replace(/^\//, '')
      const fullPath = join(process.cwd(), 'public', 'sprites', safePath)
      try {
        const buf = readFileSync(fullPath)
        base64Image = buf.toString('base64')
        imageContext = `sprite: ${safePath}`
        // Also load as pixels for segmentation
        const sprite = await loadSprite(buf, 64)
        spritePixels = sprite.pixels
        spriteW = sprite.width
        spriteH = sprite.height
      } catch {
        return NextResponse.json({ error: `Sprite not found: ${safePath}` }, { status: 404 })
      }
    } else if (fieldId) {
      const snapshot = getFieldSnapshot(fieldId)
      if (!snapshot) {
        return NextResponse.json({ error: 'Field not found' }, { status: 404 })
      }
      const cells = snapshotToCells(snapshot)
      if (cells.length === 0) {
        return NextResponse.json({ error: 'Field has no cells (empty shape)' }, { status: 400 })
      }
      const colorData = new Float32Array(GRID_SIZE * GRID_SIZE * 4)
      for (const idx of cells) {
        const base = idx * 4
        colorData[base] = snapshot.color[0]
        colorData[base + 1] = snapshot.color[1]
        colorData[base + 2] = snapshot.color[2]
        colorData[base + 3] = snapshot.color[3]
      }
      const pngBuffer = await fieldToPng(cells, colorData, GRID_SIZE)
      base64Image = pngBuffer.toString('base64')
      imageContext = `field "${snapshot.name}" (${cells.length} pixels)`

      // Check if we have sprite data stored for this field
      const wd = getWorldData()
      const spriteMeta = wd[`sprite_${fieldId}`] as Record<string, unknown> | undefined
      if (spriteMeta?.spritePath) {
        try {
          const sp = (spriteMeta.spritePath as string).replace(/\.\./g, '').replace(/^\//, '')
          const buf = readFileSync(join(process.cwd(), 'public', 'sprites', sp))
          const sprite = await loadSprite(buf, 64)
          spritePixels = sprite.pixels
          spriteW = sprite.width
          spriteH = sprite.height
        } catch { /* ignore */ }
      }
    } else {
      return NextResponse.json(
        { error: 'Provide fieldId, spritePath, or imageBase64' },
        { status: 400 },
      )
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    // Run flood-fill segmentation if we have pixel data
    let regionInfo = ''
    let regionCount = 0
    // Map: Claude's region index (1-based) → the normalized value stored in pixel state R channel
    const regionIndexToValue: Map<number, number> = new Map()
    if (spritePixels) {
      const seg = computeFullSegmentation(spritePixels, spriteW, spriteH)
      regionCount = seg.regions.length

      // Store mapping from index to the value that pixels carry in state R
      seg.regions.forEach((r, i) => {
        regionIndexToValue.set(i + 1, r.value)
      })

      // Build region summary for Claude
      const regionLines = seg.regions.slice(0, 20).map((r, i) => {
        const [cr, cg, cb] = r.color.map(c => Math.round(c * 255))
        return `Region ${i + 1}: rgb(${cr},${cg},${cb}), ${r.size}px, center=(${r.center.x},${r.center.y}), bounds y=${r.bounds.minY}-${r.bounds.maxY}`
      })

      const boundaryLines = seg.boundaries.slice(0, 15).map(b => {
        const rA = seg.regions.find(r => r.id === b.regionA)
        const rB = seg.regions.find(r => r.id === b.regionB)
        const cA = rA ? rA.color.map(c => Math.round(c * 255)).join(',') : '?'
        const cB = rB ? rB.color.map(c => Math.round(c * 255)).join(',') : '?'
        return `Boundary: rgb(${cA}) ↔ rgb(${cB}), ${b.length}px, ${b.orientation}`
      })

      regionInfo = `\n\nFLOOD-FILL SEGMENTATION found ${regionCount} color regions:\n${regionLines.join('\n')}\n\nBOUNDARIES (${seg.boundaries.length} total):\n${boundaryLines.join('\n')}`
    }

    rateLimit.set(cacheKey, Date.now())
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `Label this pixel sprite's color regions. Each region is a node; boundaries are edges.${regionInfo}

Return ONLY a JSON object with no markdown fences. Each region gets a short label (what it IS: hair, skin, tunic, shadow, outline, boots, etc.) and each boundary describes the transition.

{"description":"...","regions":[{"index":1,"label":"hair"}],"boundaries":[{"from":"hair","to":"skin","edge":"hairline"}],"tags":["character"]}`,
            },
          ],
        },
      ],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No text response from Claude' }, { status: 500 })
    }

    let analysis
    try {
      let rawText = textBlock.text.trim()
      // Strip markdown code fences if present
      if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```[a-z]*\s*\n/, '').replace(/\n\s*```\s*$/, '')
      }
      analysis = JSON.parse(rawText)
    } catch {
      // Try extracting JSON from first { to last }
      const raw = textBlock.text
      const firstBrace = raw.indexOf('{')
      const lastBrace = raw.lastIndexOf('}')
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          analysis = JSON.parse(raw.substring(firstBrace, lastBrace + 1))
        } catch {
          return NextResponse.json({ cacheKey, rawAnalysis: raw, parseError: true })
        }
      } else {
        return NextResponse.json({ cacheKey, rawAnalysis: raw, parseError: true })
      }
    }

    // Build regionLabels map: keyed by Math.round(regionValue * 100)
    // This matches what the tooltip computes from the pixel's state R channel
    const regionLabels: Record<string, string> = {}
    if (analysis.regions && Array.isArray(analysis.regions)) {
      for (const r of analysis.regions) {
        const regionValue = regionIndexToValue.get(r.index)
        if (regionValue !== undefined) {
          const key = String(Math.round(regionValue * 100))
          regionLabels[key] = r.label || 'unknown'
        }
      }
    }

    const result = {
      cacheKey,
      fieldId: fieldId || null,
      spritePath: spritePath || null,
      analysis,
      regionLabels,
      regionCount,
      timestamp: new Date().toISOString(),
    }

    // Store in worldData
    setWorldData({
      [`analysis_${cacheKey}`]: result,
      // Also store regionLabels by fieldId for tooltip lookup
      ...(fieldId ? { [`regionLabels_${fieldId}`]: regionLabels } : {}),
    })

    // Push region labels to browser via agent queue
    if (fieldId) {
      const agentUrl = new URL('/api/engine/agent', req.url)
      await fetch(agentUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.get('authorization') || '',
          'Origin': req.headers.get('origin') || new URL(req.url).origin,
        },
        body: JSON.stringify({
          type: 'set_region_labels',
          fieldId,
          regionLabels,
        }),
      }).catch(() => {})

      appendMemory(fieldId, {
        timestamp: new Date().toISOString(),
        type: 'effect_added',
        content: `AI analysis: ${analysis.description || 'analyzed'}. ${Object.keys(regionLabels).length} regions labeled: ${Object.values(regionLabels).slice(0, 5).join(', ')}`,
        sourceFieldId: null,
        data: { regionLabels, description: analysis.description },
      })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('Analyze error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 },
    )
  }
}
