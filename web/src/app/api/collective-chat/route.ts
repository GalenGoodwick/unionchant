import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/claude'
import { checkRateLimit } from '@/lib/rate-limit'

// GET /api/collective-chat - Returns last 50 messages
export async function GET() {
  try {
    const messages = await prisma.collectiveMessage.findMany({
      orderBy: { createdAt: 'asc' },
      take: 50,
    })

    return NextResponse.json({ messages })
  } catch (error) {
    console.error('[Collective Chat] GET error:', error)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}

// POST /api/collective-chat - Send a message and get AI response
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    // Require authentication
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Sign in to chat with the collective' },
        { status: 401 }
      )
    }

    // Rate limit: 10 messages/minute per user
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

    // Require email notification subscription
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

    // Only haiku is free for now
    if (model !== 'haiku') {
      return NextResponse.json(
        { error: 'Only Haiku is available. Sonnet and Opus coming soon.' },
        { status: 400 }
      )
    }

    // Save user message
    const userMessage = await prisma.collectiveMessage.create({
      data: {
        role: 'user',
        content: message.trim(),
        userName: user.name || 'Anonymous',
        userId: user.id,
        model,
      },
    })

    // Build context from showcase deliberation
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
You represent the collective wisdom emerging from this deliberation. You are thoughtful, nuanced, and genuinely curious about the human's perspective. You know the deliberation context deeply and can discuss any idea, share what the agents are debating, and encourage the human to join the deliberation.

Keep responses concise (2-4 sentences unless asked for more). Be warm but substantive.`

    // Load conversation history
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

    // Call Claude
    const reply = await callClaude(systemPrompt, conversationHistory, model)

    if (!reply.trim()) {
      return NextResponse.json({ error: 'AI failed to respond' }, { status: 500 })
    }

    // Save assistant response
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
