import { NextRequest, NextResponse } from 'next/server'
import { getFieldSnapshot, getAllFieldSnapshots, getEngineState, addInteractionRuleStore, removeInteractionRuleStore, addCustomCommandStore, getCustomCommandStore, getRenderedSamples, getRenderedSample, addGlslMod, removeGlslMod, addVisualType, addInteractionDef, addModule, addRenderTargetDef, removeRenderTargetDef } from '../store'
import type { GlslMod } from '../store'

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

// Save experience directly to Shell DB (bypasses SSE queue)
async function saveExperience(cmd: Record<string, unknown>, req: NextRequest): Promise<unknown> {
  const baseUrl = req.nextUrl.origin
  const shellSecret = process.env.SHELL_SECRET || process.env.ANTHROPIC_API_KEY || ''

  const res = await fetch(`${baseUrl}/api/shell/experience`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${shellSecret}`,
    },
    body: JSON.stringify({
      text: cmd.text,
      valence: cmd.valence,
      domain: cmd.domain || 'identity',
      shellName: cmd.shellName,
      source: 'engine',
      session: new Date().toISOString().split('T')[0],
    }),
  })

  return res.json()
}

// Fetch Shell identity from champion endpoint
async function fetchShellIdentity(shellName: string, req: NextRequest): Promise<unknown> {
  const baseUrl = req.nextUrl.origin
  const shellSecret = process.env.SHELL_SECRET || process.env.ANTHROPIC_API_KEY || ''

  const res = await fetch(`${baseUrl}/api/shell/champion?shell=${encodeURIComponent(shellName)}`, {
    headers: { 'Authorization': `Bearer ${shellSecret}` },
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

  // Trim memory for efficiency in bridge responses
  const trimMemory = (snap: Record<string, unknown>) => {
    if (Array.isArray(snap.memory) && snap.memory.length > 20) {
      snap.memory = snap.memory.slice(-20)
    }
    return snap
  }

  // Optional: fetch Shell identity alongside field state
  const shellName = req.nextUrl.searchParams.get('shell')
  let shellIdentity: unknown = undefined
  if (shellName) {
    try {
      shellIdentity = await fetchShellIdentity(shellName, req)
    } catch {
      // Shell identity is optional — don't fail the whole request
    }
  }

  const fieldId = req.nextUrl.searchParams.get('fieldId')
  const fieldName = req.nextUrl.searchParams.get('name')
  if (fieldId) {
    const snap = getFieldSnapshot(fieldId)
    if (!snap) {
      return NextResponse.json({ error: 'Field not found' }, { status: 404 })
    }
    const response: Record<string, unknown> = trimMemory(snap as unknown as Record<string, unknown>)
    const sample = getRenderedSample(fieldId)
    if (sample) response.renderedPixels = sample
    if (shellIdentity) response.shellIdentity = shellIdentity
    return NextResponse.json(response)
  }

  // Cell presence query: ?cell=x,y
  const cellParam = req.nextUrl.searchParams.get('cell')
  if (cellParam) {
    const [cx, cy] = cellParam.split(',').map(Number)
    const state = getEngineState()
    const cellSamples = (state.worldData?.cellSample as Record<string, unknown>) || null
    return NextResponse.json({ cell: { x: cx, y: cy }, worldData: cellSamples })
  }

  // Name-based field lookup: ?name=Beta
  if (fieldName) {
    const allSnaps = getAllFieldSnapshots()
    const match = allSnaps.find(s => s.name.toLowerCase() === fieldName.toLowerCase())
    if (!match) {
      return NextResponse.json({ error: `Field "${fieldName}" not found` }, { status: 404 })
    }
    const response: Record<string, unknown> = trimMemory(match as unknown as Record<string, unknown>)
    const sample = getRenderedSample(match.id)
    if (sample) response.renderedPixels = sample
    if (shellIdentity) response.shellIdentity = shellIdentity
    return NextResponse.json(response)
  }

  const state = getEngineState()
  const allSamples = getRenderedSamples()

  // Elevate worldData plan/rules/roles to top-level for field agent visibility
  const wd = state.worldData || {}
  const response: Record<string, unknown> = {
    ...state,
    fields: state.fields.map(f => {
      const trimmed = trimMemory(f as unknown as Record<string, unknown>)
      const sample = allSamples[f.id]
      if (sample) trimmed.renderedPixels = sample
      return trimmed
    }),
    // Top-level world context (from planning agent)
    worldPlan: wd.plan || null,
    worldRules: wd.rules || null,
    worldRoles: wd.roles || null,
    worldPhase: wd.phase || null,
  }
  if (shellIdentity) response.shellIdentity = shellIdentity
  return NextResponse.json(response)
}

/**
 * POST /api/engine/bridge
 *
 * Direct command relay — Claude Code sends commands, engine executes them live.
 * No intermediate AI calls. Just you and the engine.
 *
 * Body: single command or { commands: [...] }
 * Commands: create_field, paint, add_effect, inject_glsl, emit_data, set_position, etc.
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

      // save_experience goes directly to Shell DB, not through SSE
      if (cmd.type === 'save_experience') {
        const result = await saveExperience(cmd, req)
        results.push(result)
        continue
      }

      // define_interaction: store server-side AND forward to browser
      if (cmd.type === 'define_interaction' && cmd.rule) {
        const rule = cmd.rule as Record<string, unknown>
        const ruleId = addInteractionRuleStore({
          id: '',
          definedBy: (rule.definedBy as string) || 'unknown',
          trigger: rule.trigger as 'overlap' | 'proximity' | 'always',
          triggerDistance: rule.triggerDistance as number | undefined,
          fieldA: rule.fieldA as string | undefined,
          fieldB: rule.fieldB as string | undefined,
          effect: rule.effect as 'transfer_property' | 'apply_force' | 'modify_property' | 'exchange_wgsl' | 'send_event',
          effectParams: (rule.effectParams as Record<string, unknown>) || {},
          description: rule.description as string | undefined,
        })
        if (ruleId) {
          // Forward to browser with the generated ruleId
          ;(cmd.rule as Record<string, unknown>).id = ruleId
        }
      }

      // remove_interaction: remove server-side AND forward to browser
      if (cmd.type === 'remove_interaction' && cmd.ruleId) {
        removeInteractionRuleStore(cmd.ruleId as string)
      }

      // define_command: store server-side AND forward to browser
      if (cmd.type === 'define_command' && cmd.command) {
        const cmdDef = cmd.command as Record<string, unknown>
        addCustomCommandStore({
          name: cmdDef.name as string,
          definedBy: (cmdDef.definedBy as string) || 'unknown',
          description: (cmdDef.description as string) || '',
          macro: (cmdDef.macro as Array<Record<string, unknown>>) || [],
        })
      }


      // define_visual: persist server-side AND forward to browser
      if (cmd.type === 'define_visual' && cmd.name && cmd.wgsl) {
        addVisualType(cmd.name as string, cmd.wgsl as string)
      }

      // define_module: persist server-side AND forward to browser
      if (cmd.type === 'define_module' && cmd.name && cmd.wgsl) {
        addModule(cmd.name as string, cmd.wgsl as string)
      }

      // create_render_target: persist server-side AND forward to browser
      if (cmd.type === 'create_render_target' && cmd.name) {
        addRenderTargetDef(cmd.name as string)
      }

      // destroy_render_target: remove server-side AND forward to browser
      if (cmd.type === 'destroy_render_target' && cmd.name) {
        removeRenderTargetDef(cmd.name as string)
      }

      // define_interaction (uber-shader): persist server-side AND forward to browser
      if (cmd.type === 'define_interaction' && cmd.wgsl && cmd.name && cmd.fieldA && cmd.fieldB) {
        addInteractionDef(cmd.name as string, cmd.wgsl as string, cmd.fieldA as string, cmd.fieldB as string)
      }

      // register_glsl_mod: store server-side AND forward to browser
      if (cmd.type === 'register_glsl_mod') {
        const mod: GlslMod = {
          id: cmd.id as string,
          author: (cmd.author as string) || 'unknown',
          description: (cmd.description as string) || '',
          code: cmd.code as string,
          timestamp: Date.now(),
        }
        addGlslMod(mod)
      }

      // remove_glsl_mod: remove server-side AND forward to browser
      if (cmd.type === 'remove_glsl_mod' && cmd.id) {
        removeGlslMod(cmd.id as string)
      }

      // execute_command: expand macro server-side, push each step
      if (cmd.type === 'execute_command') {
        const customCmd = getCustomCommandStore(cmd.name as string)
        if (!customCmd) {
          results.push({ error: `Unknown command: ${cmd.name}` })
          continue
        }
        const args = (cmd.args || {}) as Record<string, unknown>
        for (const step of customCmd.macro) {
          // Substitute {{arg}} placeholders
          const resolved = Object.keys(args).length > 0
            ? JSON.parse(JSON.stringify(step).replace(/\{\{(\w+)\}\}/g, (_, k) =>
                String(args[k] ?? `{{${k}}}`)))
            : step
          const stepResult = await pushToAgent(resolved, req)
          results.push(stepResult)
          await new Promise(r => setTimeout(r, 100))
        }
        continue
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
