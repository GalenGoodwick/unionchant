import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/claude'
import { checkRateLimit } from '@/lib/rate-limit'

const ONE_DAY_MS = 86400000

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

// POST /api/collective-chat - Send a message, get AI response, auto-create Talk
// Every message creates a Talk. Replacing an existing Talk is rate-limited for free users.
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
      select: {
        id: true,
        name: true,
        emailNotifications: true,
        subscriptionTier: true,
        lastCollectiveTalkChangeAt: true,
      },
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
    const { message, model = 'haiku', replaceExisting = false } = body

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

    // Check if user already has a collective Talk
    const existingTalk = await prisma.deliberation.findFirst({
      where: { creatorId: user.id, fromCollective: true },
      select: { id: true, question: true },
    })

    if (existingTalk && !replaceExisting) {
      return NextResponse.json({
        error: 'HAS_EXISTING_TALK',
        existingTalk: { id: existingTalk.id, question: existingTalk.question },
        message: 'You already have a collective Talk. Sending a new message will replace it.',
      }, { status: 409 })
    }

    // Rate limit Talk replacement: free users = 1 change per day
    if (existingTalk && replaceExisting && user.subscriptionTier === 'free') {
      if (user.lastCollectiveTalkChangeAt) {
        const timeSinceLastChange = Date.now() - user.lastCollectiveTalkChangeAt.getTime()
        if (timeSinceLastChange < ONE_DAY_MS) {
          const hoursLeft = Math.ceil((ONE_DAY_MS - timeSinceLastChange) / 3600000)
          return NextResponse.json({
            error: 'RATE_LIMITED',
            message: `Free accounts can change their Talk once per day. Try again in ${hoursLeft}h.`,
            hoursLeft,
            upgradeUrl: '/pricing',
          }, { status: 429 })
        }
      }
    }

    // If replacing, delete the old Talk first
    if (existingTalk && replaceExisting) {
      await deleteDeliberation(existingTalk.id)
      console.log(`[Collective Chat] Deleted existing Talk ${existingTalk.id} for user ${user.id}`)
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

    // Create a new Talk from this message with default facilitation settings
    const inviteCode = Math.random().toString(36).substring(2, 10)
    const submissionDurationMs = 86400000 // 24 hours
    const newTalk = await prisma.deliberation.create({
      data: {
        creatorId: user.id,
        question: message.trim(),
        isPublic: true,
        fromCollective: true,
        phase: 'SUBMISSION',
        accumulationEnabled: true,
        submissionDurationMs,
        votingTimeoutMs: 3600000,
        secondVoteTimeoutMs: 900000,
        accumulationTimeoutMs: 86400000,
        inviteCode,
        submissionEndsAt: new Date(Date.now() + submissionDurationMs),
      },
    })

    // Add creator as member
    await prisma.deliberationMember.create({
      data: {
        deliberationId: newTalk.id,
        userId: user.id,
        role: 'CREATOR',
      },
    })

    // Update rate limit timestamp (for Talk replacement tracking)
    if (existingTalk) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastCollectiveTalkChangeAt: new Date() },
      })
    }

    console.log(`[Collective Chat] Created Talk ${newTalk.id} from message by ${user.id}`)

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

IMPORTANT CONTEXT:
The human just posted: "${message.trim()}"
This message has automatically created a new Talk (deliberation) that others can join and deliberate on.

YOUR ROLE:
You represent the collective wisdom emerging from this deliberation. You are thoughtful, nuanced, and genuinely curious about the human's perspective. Acknowledge that their message has become a Talk that others can now join. Engage with their idea substantively. Keep responses concise (2-4 sentences unless asked for more). Be warm but substantive.`

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
          : 'AI is temporarily unavailable. Your Talk was still created.',
        talkCreated: { id: newTalk.id, question: newTalk.question },
      }, { status: 503 })
    }

    if (!reply.trim()) {
      return NextResponse.json({
        reply: '',
        messageId: null,
        userMessageId: userMessage.id,
        talkCreated: { id: newTalk.id, question: newTalk.question },
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
      talkCreated: { id: newTalk.id, question: newTalk.question },
    })
  } catch (error) {
    console.error('[Collective Chat] POST error:', error)
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 })
  }
}

// ── Deliberation deletion (same pattern as admin endpoint) ────

async function deleteDeliberation(deliberationId: string) {
  const cells = await prisma.cell.findMany({
    where: { deliberationId },
    select: { id: true },
  })
  const cellIds = cells.map(c => c.id)

  const ideas = await prisma.idea.findMany({
    where: { deliberationId },
    select: { id: true },
  })
  const ideaIds = ideas.map(i => i.id)

  if (cellIds.length > 0) {
    await prisma.commentUpvote.deleteMany({ where: { comment: { cellId: { in: cellIds } } } })
    await prisma.comment.updateMany({
      where: { cellId: { in: cellIds }, replyToId: { not: null } },
      data: { replyToId: null },
    })
    await prisma.comment.deleteMany({ where: { cellId: { in: cellIds } } })
    await prisma.vote.deleteMany({ where: { cellId: { in: cellIds } } })
    await prisma.prediction.deleteMany({ where: { cellId: { in: cellIds } } })
    await prisma.cellParticipation.deleteMany({ where: { cellId: { in: cellIds } } })
    await prisma.cellIdea.deleteMany({ where: { cellId: { in: cellIds } } })
    await prisma.cell.deleteMany({ where: { id: { in: cellIds } } })
  }

  if (ideaIds.length > 0) {
    await prisma.notification.deleteMany({ where: { ideaId: { in: ideaIds } } })
  }

  await prisma.notification.deleteMany({ where: { deliberationId } })
  await prisma.prediction.deleteMany({ where: { deliberationId } })
  await prisma.watch.deleteMany({ where: { deliberationId } })
  await prisma.aIAgent.deleteMany({ where: { deliberationId } })
  await prisma.idea.deleteMany({ where: { deliberationId } })
  await prisma.deliberationMember.deleteMany({ where: { deliberationId } })
  await prisma.deliberation.delete({ where: { id: deliberationId } })
}
