// Vision Analysis API — Claude Vision analyzes field sprites and assigns pixel semantics
// POST: accepts fieldId, renders field to PNG, sends to Claude Vision for analysis

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { getFieldSnapshot } from '../store'
import { fieldToPng } from '@/lib/sprite-loader'
import { GRID_SIZE } from '@/app/engine/types'
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
      if (snapshot.shape.type === 'rect') {
        if (x >= t.x && x < t.x + snapshot.shape.w && y >= t.y && y < t.y + snapshot.shape.h) cells.push(y * GRID + x)
      } else if (snapshot.shape.type === 'polygon') {
        const dx = x - t.x, dy = y - t.y
        if (dx * dx + dy * dy <= snapshot.shape.radius * snapshot.shape.radius) cells.push(y * GRID + x)
      }
    }
  }
  return cells
}

export const dynamic = 'force-dynamic'
export const maxDuration = 30

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
    const { fieldId } = body

    if (!fieldId) {
      return NextResponse.json({ error: 'fieldId required' }, { status: 400 })
    }

    const snapshot = getFieldSnapshot(fieldId)
    if (!snapshot) {
      return NextResponse.json({ error: 'Field not found' }, { status: 404 })
    }

    const cells = snapshotToCells(snapshot)
    if (cells.length === 0) {
      return NextResponse.json({ error: 'Field has no cells (empty shape)' }, { status: 400 })
    }

    // Reconstruct color data from the snapshot's shape.
    const colorData = new Float32Array(GRID_SIZE * GRID_SIZE * 4)
    for (const idx of cells) {
      const base = idx * 4
      colorData[base] = snapshot.color[0]
      colorData[base + 1] = snapshot.color[1]
      colorData[base + 2] = snapshot.color[2]
      colorData[base + 3] = snapshot.color[3]
    }

    const pngBuffer = await fieldToPng(cells, colorData, GRID_SIZE)
    const base64Image = pngBuffer.toString('base64')

    // Call Claude Vision
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
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
              text: `You are analyzing a pixel sprite from a game engine grid. The sprite is rendered from field "${snapshot.name}" which has ${cells.length} pixels.

Analyze this sprite image and respond with a JSON object (no markdown formatting, just raw JSON):

{
  "description": "What does this sprite depict? (1-2 sentences)",
  "regions": ["list of distinct visual regions/materials visible"],
  "semantics": {
    "r": "suggested meaning for Red state channel based on sprite content",
    "g": "suggested meaning for Green state channel",
    "b": "suggested meaning for Blue state channel",
    "a": "suggested meaning for Alpha state channel",
    "description": "overall semantic model explanation"
  },
  "tags": ["sprite type tags like 'character', 'terrain', 'item', etc."],
  "symmetry": "none | horizontal | vertical | both",
  "complexity": "simple | moderate | complex"
}

Base your channel semantics on the sprite content. For example:
- A character sprite: R=health, G=energy, B=armor, A=alive
- A terrain tile: R=height, G=moisture, B=temperature, A=hardness
- A fire effect: R=heat, G=fuel, B=spread_rate, A=intensity`,
            },
          ],
        },
      ],
    })

    // Parse the response
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No text response from Claude' }, { status: 500 })
    }

    let analysis
    try {
      // Strip any markdown code fences if present
      let rawText = textBlock.text.trim()
      if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      }
      analysis = JSON.parse(rawText)
    } catch {
      // Return raw text if not parseable as JSON
      return NextResponse.json({
        fieldId,
        fieldName: snapshot.name,
        rawAnalysis: textBlock.text,
        parseError: true,
      })
    }

    // Build set_semantics command if semantics were returned
    let semanticsApplied = false
    if (analysis.semantics) {
      const semanticsCommand = {
        type: 'set_semantics',
        fieldId,
        semantics: analysis.semantics,
      }

      // Push the semantics command through agent route
      const agentUrl = new URL('/api/engine/agent', req.url)
      await fetch(agentUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.get('authorization') || '',
          'Origin': req.headers.get('origin') || new URL(req.url).origin,
        },
        body: JSON.stringify(semanticsCommand),
      })
      semanticsApplied = true
    }

    return NextResponse.json({
      fieldId,
      fieldName: snapshot.name,
      cellCount: cells.length,
      analysis,
      semanticsApplied,
    })
  } catch (err) {
    console.error('Vision analysis error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Vision analysis failed' },
      { status: 500 },
    )
  }
}
