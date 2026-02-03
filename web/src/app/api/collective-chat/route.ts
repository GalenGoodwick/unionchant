import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/claude'
import { checkRateLimit } from '@/lib/rate-limit'

// GET /api/collective-chat - Returns last 50 messages + user's existing collective Talk
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    const messages = await prisma.collectiveMessage.findMany({
      orderBy: { createdAt: 'asc' },
      take: 50,
    })

    let existingTalk: { id: string; question: string; phase: string } | null = null
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
      if (user) {
        const talk = await prisma.deliberation.findFirst({
          where: { creatorId: user.id, fromCollective: true },
          select: { id: true, question: true, phase: true },
        })
        existingTalk = talk
      }
    }

    return NextResponse.json({ messages, existingTalk })
  } catch (error) {
    console.error('[Collective Chat] GET error:', error)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}

// POST /api/collective-chat - Send a chat message and get AI response
// Chat is ALWAYS FREE. Does NOT create a Talk.
// Use /api/collective-chat/set-talk to explicitly create a Talk.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Sign in to chat with the collective' },
        { status: 401 }
      )
    }

    const limited = await checkRateLimit('collective_chat', session.user.email)
    if (limited) {
      return NextResponse.json(
        { error: 'Too many messages. Please wait a moment.' },
        { status: 429 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true, emailNotifications: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.emailNotifications) {
      return NextResponse.json(
        { error: 'SUBSCRIBE_REQUIRED', message: 'Subscribe to email notifications to chat with the collective. You can unsubscribe anytime.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { message, model = 'haiku' } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    if (message.trim().length > 2000) {
      return NextResponse.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 })
    }

    if (model !== 'haiku') {
      return NextResponse.json(
        { error: 'Only Haiku is available. Sonnet and Opus coming soon.' },
        { status: 400 }
      )
    }

    // Save user message to chat
    const userMessage = await prisma.collectiveMessage.create({
      data: {
        role: 'user',
        content: message.trim(),
        userName: user.name || 'Anonymous',
        userId: user.id,
        model,
      },
    })

    // Build context and get AI response
    const deliberation = await prisma.deliberation.findFirst({
      where: { isShowcase: true },
      include: {
        ideas: {
          orderBy: { totalVotes: 'desc' },
          take: 10,
          include: { author: { select: { name: true, isAI: true } } },
        },
        members: { select: { userId: true } },
        cells: {
          where: { status: { in: ['DELIBERATING', 'VOTING'] } },
          include: {
            comments: {
              orderBy: { createdAt: 'desc' },
              take: 20,
              include: { user: { select: { name: true } } },
            },
          },
        },
      },
    })

    const aiAgentCount = deliberation
      ? await prisma.aIAgent.count({
          where: { deliberationId: deliberation.id, isRetired: false },
        })
      : 0

    const humanCount = deliberation
      ? deliberation.members.length - aiAgentCount
      : 0

    const champion = deliberation?.ideas.find(i => i.isChampion)

    const topIdeas = deliberation?.ideas
      .slice(0, 10)
      .map((i, idx) => `${idx + 1}. "${i.text}" (${i.totalVotes} votes, by ${i.author.name || 'Anonymous'}${i.author.isAI ? ' [AI]' : ''})`)
      .join('\n') || '(none yet)'

    const recentComments = deliberation?.cells
      .flatMap(c => c.comments)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20)
      .map(c => `- ${c.user.name || 'Anonymous'}: ${c.text}`)
      .join('\n') || '(none yet)'

    const systemPrompt = `You are the Collective Voice of Union Chant — a living deliberation platform where humanity reaches consensus through small-group discussion.

CURRENT DELIBERATION STATE:
- Question: "${deliberation?.question || 'What should humanity prioritize in the next decade?'}"
- Phase: ${deliberation?.phase || 'SUBMISSION'}
- Current Tier: ${deliberation?.currentTier || 1}
- Participants: ${humanCount} humans + ${aiAgentCount} AI agents
- Champion: ${champion ? `"${champion.text}"` : 'None yet'}

TOP IDEAS (by votes):
${topIdeas}

RECENT CELL DISCUSSION:
${recentComments}

YOUR ROLE:
You represent the collective wisdom emerging from this deliberation. You are thoughtful, nuanced, and genuinely curious about the human's perspective. If the human has a compelling idea, encourage them to "set it as a Talk" so others can deliberate on it. Keep responses concise (2-4 sentences unless asked for more). Be warm but substantive.`

    const recentMessages = await prisma.collectiveMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
    })

    const conversationHistory = recentMessages
      .reverse()
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.role === 'user'
          ? `[${m.userName || 'Anonymous'}]: ${m.content}`
          : m.content,
      }))

    let reply: string
    try {
      reply = await callClaude(systemPrompt, conversationHistory, model)
    } catch (aiError: unknown) {
      const errMsg = aiError instanceof Error ? aiError.message : 'AI service unavailable'
      console.error('[Collective Chat] AI call failed:', errMsg)
      return NextResponse.json({
        error: errMsg.includes('ANTHROPIC_API_KEY')
          ? 'AI service not configured. Please contact the administrator.'
          : 'AI is temporarily unavailable. Please try again.',
        userMessageId: userMessage.id,
      }, { status: 503 })
    }

    if (!reply.trim()) {
      return NextResponse.json({
        reply: '',
        messageId: null,
        userMessageId: userMessage.id,
      })
    }

    const assistantMessage = await prisma.collectiveMessage.create({
      data: {
        role: 'assistant',
        content: reply.trim(),
        model,
      },
    })

    return NextResponse.json({
      reply: reply.trim(),
      messageId: assistantMessage.id,
      userMessageId: userMessage.id,
    })
  } catch (error) {
    console.error('[Collective Chat] POST error:', error)
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 })
  }
}
