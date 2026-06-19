import { NextRequest, NextResponse } from 'next/server'
import { getFieldSnapshot, getEngineState } from '../store'

export const maxDuration = 30

// Auth: ENGINE_AGENT_TOKEN
function authorize(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const envToken = process.env.ENGINE_AGENT_TOKEN || process.env.ANTHROPIC_API_KEY
  return !!envToken && token === envToken
}

// Relay commands to the agent SSE queue
async function pushToAgent(command: Record<string, unknown>, req: NextRequest): Promise<unknown> {
  const baseUrl = req.nextUrl.origin
  const token = process.env.ENGINE_AGENT_TOKEN || process.env.ANTHROPIC_API_KEY || ''

  const res = await fetch(`${baseUrl}/api/engine/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(command),
  })

  return res.json()
}

/**
 * GET /api/engine/bridge
 * Returns field state from the server-side store.
 * Optional ?fieldId=xxx for a single field.
 */
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fieldId = req.nextUrl.searchParams.get('fieldId')
  if (fieldId) {
    const snap = getFieldSnapshot(fieldId)
    if (!snap) {
      return NextResponse.json({ error: 'Field not found' }, { status: 404 })
    }
    return NextResponse.json(snap)
  }

  return NextResponse.json(getEngineState())
}

/**
 * POST /api/engine/bridge
 *
 * Direct command relay — Claude Code sends commands, engine executes them live.
 * No intermediate AI calls. Just you and the engine.
 *
 * Body: single command or { commands: [...] }
 * Commands: paint, inject_glsl, clear_all, clear_effect, create_field, select, status
 */
export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()

    // Accept single command or array
    const commands: Record<string, unknown>[] = Array.isArray(body.commands)
      ? body.commands
      : body.type
        ? [body]
        : []

    if (commands.length === 0) {
      return NextResponse.json({ error: 'No commands. Send {type:"paint",...} or {commands:[...]}' }, { status: 400 })
    }

    const results: unknown[] = []
    for (const cmd of commands) {
      // Add delay between commands so the engine page can process each one
      if (results.length > 0) {
        await new Promise(r => setTimeout(r, 100))
      }
      const result = await pushToAgent(cmd, req)
      results.push(result)
    }

    return NextResponse.json({ ok: true, executed: results.length, results })
  } catch (error) {
    console.error('[Engine Bridge] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bridge failed' },
      { status: 500 }
    )
  }
}
