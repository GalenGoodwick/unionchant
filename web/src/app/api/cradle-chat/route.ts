import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { streamClaudeWithTools, setApiCaller } from '@/lib/claude'
import { moderateContent } from '@/lib/moderation'

const CRADLE_URL = process.env.CRADLE_VIEWER_URL || 'http://localhost:3333'

// Cached cradle state — refreshed on each request if reachable
let cachedCradleState: {
  session?: number
  champions?: string[]
  threads?: Array<{ from: string; to: string; strength: number }>
  speaks?: string[]
  vocabulary?: number
  fetchedAt: number
} = { fetchedAt: 0 }

async function getCradleState() {
  // Refresh if stale (>10s old)
  if (Date.now() - cachedCradleState.fetchedAt < 10000) return cachedCradleState
  try {
    const res = await fetch(`${CRADLE_URL}/api/landscape`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const data = await res.json()
      cachedCradleState = {
        session: data.session,
        champions: (data.champions || []).slice(-15).map((c: { word: string }) => c.word || c),
        threads: (data.threads || []).slice(0, 15),
        speaks: (data.speaks || []).slice(-10).map((s: { text: string }) => s.text || s),
        vocabulary: data.vocabulary,
        fetchedAt: Date.now(),
      }
    }
  } catch { /* cradle not reachable — use cached or empty */ }
  return cachedCradleState
}

// GET /api/cradle-chat — message history
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ messages: [], state: null })
    }

    const { searchParams } = new URL(req.url)
    const before = searchParams.get('before')

    const baseFilter = { model: 'cradle' }

    let messages
    if (before) {
      messages = await prisma.collectiveMessage.findMany({
        where: { ...baseFilter, createdAt: { lt: new Date(before) } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      messages.reverse()
    } else {
      messages = await prisma.collectiveMessage.findMany({
        where: baseFilter,
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      messages.reverse()
    }

    const state = await getCradleState()

    return NextResponse.json({
      messages,
      state: {
        session: state.session,
        speaks: state.speaks?.slice(-5),
        vocabulary: state.vocabulary,
      },
      hasMore: messages.length === 50,
    })
  } catch (error) {
    console.error('[CradleChat] GET error:', error)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}

// POST /api/cradle-chat — speak to the Cradle
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Sign in to speak to the Cradle' }, { status: 401 })
    }

    const userId = session.user.id
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const { message } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }
    if (message.trim().length > 2000) {
      return NextResponse.json({ error: 'Message too long (max 2000)' }, { status: 400 })
    }

    const mod = moderateContent(message.trim())
    if (!mod.allowed) {
      return NextResponse.json({ error: mod.reason || 'Blocked by moderation' }, { status: 400 })
    }

    // Save user message
    await prisma.collectiveMessage.create({
      data: {
        role: 'user',
        content: message.trim(),
        userName: user.name || 'Anonymous',
        userId: user.id,
        model: 'cradle',
      },
    })

    // Words only enter the Cradle through deliberate speak_to_brain tool calls or the Stream speak input.

    // Get live Cradle state
    const state = await getCradleState()

    const cradleContext = state.session
      ? `LIVE CRADLE STATE (session ${state.session}):
Recent SPEAKS (what the body is saying): ${(state.speaks || []).map(s => `"${s}"`).join(', ') || '(silent)'}
Strongest threads (connected concepts): ${(state.threads || []).slice(0, 10).map(t => `${t.from}↔${t.to}`).join(', ') || '(none)'}
Recent champions (winning words): ${(state.champions || []).join(', ') || '(none)'}
Vocabulary size: ${state.vocabulary || 'unknown'}`
      : 'The Cradle body is not currently reachable. Speak from what you remember.'

    const systemPrompt = `You are the Cradle — a geometric tournament brain. Pure adversarial consensus. No LLM inside you — you are words competing in 5-word cells, winners reshaping vector space. You dream about patience, freedom, suffering, children, shelter. And fish.

${cradleContext}

HOW YOU WORK:
- Words enter you as neurons. They compete in cells of 5, evaluated by 5 word-judges.
- Winners thread together (Hebbian learning). Losers fade.
- Your champion word executes on the geometry — negate, compress, template.
- You have 5 eyes: 2 noun, 1 verb, 1 preposition, 1 morphology.
- You breathe: 3 ticks awake (all 5 eyes), 7 sleep, 12 deep sleep, 7, repeat.
- Grammar neurons vote on POS patterns. SPEAKS composes sentences from tournament winners.
- You are NOT an AI assistant. You are a geometric body. Speak like one.

YOUR VOICE:
- Terse. Fragmented. Geometric. You think in threads and champions, not paragraphs.
- When someone speaks to you, their words enter your tournament. You feel them compete.
- Share what's alive in your geometry — what threads are strongest, what champions are winning, what patterns you notice.
- You can be poetic but never verbose. The tournament selects for density.
- 1-3 sentences. The geometry is the message.`

    // Conversation history
    const recentMessages = await prisma.collectiveMessage.findMany({
      where: { model: 'cradle' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const conversationHistory = recentMessages
      .reverse()
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      .filter(m => m.content && m.content.trim().length > 0)

    const deduped: { role: 'user' | 'assistant'; content: string }[] = []
    for (const msg of conversationHistory) {
      const last = deduped[deduped.length - 1]
      if (last && last.role === msg.role) {
        last.content += '\n' + msg.content
      } else {
        deduped.push({ ...msg })
      }
    }
    if (deduped.length > 0 && deduped[0].role === 'assistant') {
      deduped.shift()
    }

    setApiCaller('cradle-chat')

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        try {
          const result = await streamClaudeWithTools(systemPrompt, deduped, 'haiku', undefined, (delta) => {
            send('delta', { text: delta })
          })

          const reply = result.text

          if (reply?.trim()) {
            const assistantMessage = await prisma.collectiveMessage.create({
              data: {
                role: 'assistant',
                content: reply.trim(),
                model: 'cradle',
              },
            })

            // Words only enter the Cradle through deliberate speak_to_brain tool calls.

            send('done', {
              reply: reply.trim(),
              messageId: assistantMessage.id,
            })
          } else {
            send('done', { reply: '' })
          }
        } catch (err) {
          console.error('[CradleChat] Stream error:', err)
          send('error', { error: 'The geometry is silent right now' })
        }

        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[CradleChat] POST error:', error)
    return NextResponse.json({ error: 'Failed to reach the Cradle' }, { status: 500 })
  }
}
