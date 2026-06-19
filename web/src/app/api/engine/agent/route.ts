import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { appendMemory, getEngineState, setWorldData, setWorldParamsStore } from '../store'

export const maxDuration = 120 // SSE can stay open
export const dynamic = 'force-dynamic'

// --- In-memory command queue ---
export type EngineCommand =
  | { type: 'paint'; cells: number[]; fieldId?: string }
  | { type: 'erase'; cells: number[]; fieldId?: string }
  | { type: 'select'; fieldId: string }
  | { type: 'generate'; prompt: string; fieldId?: string }
  | { type: 'clear_effect'; fieldId?: string }
  | { type: 'clear_all' }
  | { type: 'create_field'; name?: string; color?: [number, number, number, number] }
  | { type: 'set_tool'; tool: string }
  | { type: 'inject_glsl'; glsl: string; description?: string; fieldId?: string }
  | { type: 'field_message'; fromFieldId: string; toFieldId: string; content: string; data?: Record<string, unknown> }
  | { type: 'move'; fieldId: string; dx: number; dy: number }
  | { type: 'set_velocity'; fieldId: string; vx: number; vy: number; vr?: number }
  | { type: 'set_world_params'; params: Partial<{ gravity: number; friction: number; collisionForce: number; boundaryMode: 'solid' | 'wrap' | 'open'; bounciness: number }> }
  | { type: 'apply_force'; fieldId: string; fx: number; fy: number }
  | { type: 'set_property'; fieldId: string; name: string; value: number; min?: number; max?: number }
  | { type: 'set_world_data'; data: Record<string, unknown>; fieldId?: string }
  | { type: 'define_interaction'; rule: {
      definedBy: string; trigger: 'overlap' | 'proximity' | 'always';
      triggerDistance?: number; fieldA?: string; fieldB?: string;
      effect: 'transfer_property' | 'apply_force' | 'modify_property' | 'exchange_glsl' | 'send_event';
      effectParams: Record<string, unknown>; description?: string;
    }}
  | { type: 'remove_interaction'; ruleId: string }
  | { type: 'define_command'; command: {
      name: string; definedBy: string; description: string;
      macro: Array<Record<string, unknown>>;
    }}
  | { type: 'execute_command'; name: string; args?: Record<string, unknown> }
  | { type: 'status' } // request current state back

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
  if (commandQueue.length > 100) commandQueue.splice(0, commandQueue.length - 100)
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

      // Send any recent pending commands (last 5 seconds)
      const cutoff = Date.now() - 5000
      for (const entry of commandQueue) {
        if (entry.timestamp > cutoff) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`))
        }
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

    if (commands.length > 50) {
      return NextResponse.json({ error: 'Max 50 commands per request' }, { status: 400 })
    }

    const results: { id: string; type: string }[] = []
    let statusPayload: ReturnType<typeof getEngineState> | null = null

    for (const cmd of commands) {
      const entry = pushCommand(cmd)
      results.push({ id: entry.id, type: cmd.type })

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
