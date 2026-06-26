import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { appendMemory, getEngineState, setWorldData, setWorldParamsStore, resetStore } from '../store'

export const maxDuration = 120 // SSE can stay open
export const dynamic = 'force-dynamic'

// --- In-memory command queue ---
export type EngineCommand =
  | { type: 'select'; fieldId: string }
  | { type: 'generate'; prompt: string; fieldId?: string }
  | { type: 'clear_effect'; fieldId?: string }
  | { type: 'clear_all' }
  // Shape-based field creation (no cells — shape IS the body)
  | { type: 'create_field'; fieldId?: string; name?: string; color?: [number, number, number, number]; shape?: 'circle' | 'rect'; shapeType?: 'circle' | 'rect'; radius?: number; w?: number; h?: number; x?: number; y?: number; parentFieldId?: string; visualType?: string | number; visualParams?: [number, number, number, number]; renderTarget?: string; sampleTargets?: string[] }
  | { type: 'delete_field'; fieldId: string }
  | { type: 'set_parent'; fieldId: string; parentFieldId?: string }
  | { type: 'set_shape'; fieldId: string; shape?: 'circle' | 'rect'; shapeType?: 'circle' | 'rect'; radius?: number; w?: number; h?: number }
  | { type: 'set_position'; fieldId: string; x: number; y: number }
  | { type: 'set_color'; fieldId: string; color: [number, number, number, number] }
  | { type: 'set_scale'; fieldId: string; scale: number }
  | { type: 'set_name'; fieldId: string; name: string }
  | { type: 'set_property'; fieldId: string; key: string; value: unknown }
  | { type: 'get_properties'; fieldId: string }
  | { type: 'set_tool'; tool: string }
  // Shader effect stack
  | { type: 'inject_wgsl'; wgsl: string; description?: string; fieldId?: string; fromFieldId?: string; feedback?: boolean }
  | { type: 'add_effect'; fieldId: string; wgsl: string; description?: string; blend?: 'alpha' | 'additive' | 'multiply'; order?: number; author?: string; fromFieldId?: string; feedback?: boolean }
  | { type: 'remove_effect'; fieldId: string; effectId: string }
  // World effects (composited, multiple allowed)
  | { type: 'add_world_effect'; wgsl: string; description?: string; blend?: 'alpha' | 'additive' | 'multiply'; fieldId?: string }
  | { type: 'remove_world_effect'; effectId: string }
  | { type: 'inject_world_wgsl'; wgsl: string; description?: string; fieldId?: string }
  | { type: 'clear_world_effect' }
  // Communication
  | { type: 'field_message'; fromFieldId: string; toFieldId: string; content: string; data?: Record<string, unknown> }
  // Movement / physics
  | { type: 'move'; fieldId: string; dx: number; dy: number }
  | { type: 'set_world_params'; params: Partial<{ gravity: number; friction: number; collisionForce: number; boundaryMode: 'solid' | 'wrap' | 'open'; bounciness: number; gravitationalConstant: number }> }
  | { type: 'apply_force'; fieldId: string; fx: number; fy: number }
  | { type: 'set_world_data'; data: Record<string, unknown>; fieldId?: string }
  // Interaction rules
  | { type: 'define_interaction'; rule: {
      definedBy: string; trigger: 'overlap' | 'proximity' | 'always';
      triggerDistance?: number; fieldA?: string; fieldB?: string;
      effect: 'transfer_property' | 'apply_force' | 'modify_property' | 'exchange_wgsl' | 'send_event' | 'damage' | 'destroy_field';
      effectParams: Record<string, unknown>; description?: string;
    }}
  | { type: 'remove_interaction'; ruleId: string }
  // Interaction effects — WGSL shaders rendered at field overlap pixels
  | { type: 'add_interaction_effect'; fieldA?: string; fieldB?: string; wgsl: string; description?: string; blend?: 'alpha' | 'additive' | 'multiply'; spread?: number; order?: number; author?: string }
  | { type: 'remove_interaction_effect'; effectId: string }
  // Custom commands
  | { type: 'define_command'; command: {
      name: string; definedBy: string; description: string;
      macro: Array<Record<string, unknown>>;
    }}
  | { type: 'execute_command'; name: string; args?: Record<string, unknown> }
  // Step hooks — JavaScript that runs every simulation tick
  | { type: 'add_step_hook'; hookId: string; author: string; description: string; code: string }
  | { type: 'remove_step_hook'; hookId: string }
  // Field links — visual energy beams between fields
  | { type: 'link_fields'; fromFieldId: string; toFieldId: string; color?: [number, number, number, number]; width?: number; style?: 'beam' | 'lightning' | 'pulse' | 'helix'; intensity?: number; bidirectional?: boolean; author?: string }
  | { type: 'unlink_fields'; linkId: string }
  // Propagation types — how interaction effects spread beyond overlap
  | { type: 'define_propagation'; name: string; wgsl: string; author?: string }
  // Shader modules — reusable WGSL functions injected into uber-shader (mod_NAME prefix)
  | { type: 'define_module'; name: string; wgsl: string }
  // Render targets — named intermediate buffers for render-to-texture
  | { type: 'create_render_target'; name: string }
  | { type: 'destroy_render_target'; name: string }
  // WGSL mods — reusable shader code registered by agents
  | { type: 'register_wgsl_mod'; id: string; author: string; description: string; code: string }
  | { type: 'remove_wgsl_mod'; id: string }
  // Field cloning
  | { type: 'clone_field'; fieldId: string; name?: string; color?: [number, number, number, number]; offsetX?: number; offsetY?: number }
  | { type: 'list_fields' }
  | { type: 'status' }
  | { type: 'reset' }

type QueueEntry = { id: string; command: EngineCommand; timestamp: number }

// Persist across hot-reloads using globalThis
const g = globalThis as unknown as {
  __engineCommandQueue?: QueueEntry[]
  __engineSSEListeners?: Set<(entry: QueueEntry) => void>
  __engineCommandCounter?: number
}
const commandQueue: QueueEntry[] = g.__engineCommandQueue ??= []
const listeners: Set<(entry: QueueEntry) => void> = g.__engineSSEListeners ??= new Set()
let commandCounter = g.__engineCommandCounter ?? 0

function pushCommand(command: EngineCommand): QueueEntry {
  const entry: QueueEntry = {
    id: `cmd_${(g.__engineCommandCounter = ++commandCounter)}_${Date.now()}`,
    command,
    timestamp: Date.now(),
  }
  commandQueue.push(entry)
  // Keep queue bounded
  if (commandQueue.length > 1000) commandQueue.splice(0, commandQueue.length - 1000)
  // Notify all SSE listeners
  for (const listener of listeners) {
    listener(entry)
  }
  return entry
}

// Check auth — session OR bearer token (ENGINE_AGENT_TOKEN env var)
async function checkAuth(req: NextRequest): Promise<{ authorized: boolean; isAdmin: boolean }> {
  // Check bearer token first (for CLI/external agent access)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const envToken = process.env.ENGINE_AGENT_TOKEN
    if (envToken && token === envToken) {
      return { authorized: true, isAdmin: true }
    }
  }

  // Fall back to session auth
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { authorized: false, isAdmin: false }
  }

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())
  const isAdmin = adminEmails.includes(session.user.email || '')
  return { authorized: true, isAdmin }
}

/**
 * GET — SSE stream for the engine page to subscribe to
 * The engine page opens an EventSource to this endpoint and receives commands in real-time.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`))

      // Replay commands since the last reset, capped at 200 to prevent
      // reconnect storms that trigger mass shader recompilations on Safari
      const MAX_REPLAY = 200
      let replayStart = 0
      for (let i = commandQueue.length - 1; i >= 0; i--) {
        if (commandQueue[i].command.type === 'reset') {
          replayStart = i
          break
        }
      }
      const effectiveStart = Math.max(replayStart, commandQueue.length - MAX_REPLAY)
      for (let i = effectiveStart; i < commandQueue.length; i++) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(commandQueue[i])}\n\n`))
      }

      // Listen for new commands
      const listener = (entry: QueueEntry) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`))
        } catch {
          listeners.delete(listener)
        }
      }
      listeners.add(listener)

      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          clearInterval(heartbeat)
          listeners.delete(listener)
        }
      }, 15000)

      // Cleanup on abort
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        listeners.delete(listener)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

/**
 * POST — Accept commands from an AI agent or external caller
 * Body: { commands: EngineCommand[] } or a single EngineCommand
 */
export async function POST(req: NextRequest) {
  const { authorized, isAdmin } = await checkAuth(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = await req.json()

    // Accept single command or array
    const commands: EngineCommand[] = Array.isArray(body.commands)
      ? body.commands
      : body.type
        ? [body as EngineCommand]
        : []

    if (commands.length === 0) {
      return NextResponse.json({ error: 'No commands provided' }, { status: 400 })
    }

    if (commands.length > 500) {
      return NextResponse.json({ error: 'Max 500 commands per request' }, { status: 400 })
    }

    const results: { id: string; type: string; fieldId?: string }[] = []
    let statusPayload: ReturnType<typeof getEngineState> | null = null

    for (const cmd of commands) {
      // Assign a stable fieldId for create_field commands so browser and agents share the same ID
      if (cmd.type === 'create_field' && !cmd.fieldId) {
        cmd.fieldId = `field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      }

      const entry = pushCommand(cmd)
      const result: { id: string; type: string; fieldId?: string } = { id: entry.id, type: cmd.type }
      if (cmd.type === 'create_field' && cmd.fieldId) {
        result.fieldId = cmd.fieldId
      }
      results.push(result)

      // Server-side memory injection for field messages (immediate visibility before client sync)
      if (cmd.type === 'field_message') {
        const now = new Date().toISOString()
        appendMemory(cmd.fromFieldId, {
          timestamp: now,
          type: 'message_sent',
          content: `Sent to ${cmd.toFieldId}: "${cmd.content}"`,
          sourceFieldId: cmd.toFieldId,
          data: cmd.data,
        })
        appendMemory(cmd.toFieldId, {
          timestamp: now,
          type: 'message_received',
          content: `From ${cmd.fromFieldId}: "${cmd.content}"`,
          sourceFieldId: cmd.fromFieldId,
          data: cmd.data,
        })
      }

      // Server-side world data writes (immediate visibility before client sync)
      if (cmd.type === 'set_world_data') {
        setWorldData(cmd.data)
      }

      // Server-side world params writes (immediate visibility)
      if (cmd.type === 'set_world_params') {
        setWorldParamsStore(cmd.params)
      }

      // Reset entire server store
      if (cmd.type === 'reset') {
        resetStore()
      }

      // Include engine state in status response
      if (cmd.type === 'status') {
        statusPayload = getEngineState()
      }
    }

    return NextResponse.json({
      queued: results.length,
      commands: results,
      listeners: listeners.size,
      ...(statusPayload ? { engineState: statusPayload } : {}),
    })
  } catch (err) {
    console.error('Agent command error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
