import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/claude'
import { checkRateLimit } from '@/lib/rate-limit'

// GET /api/collective-chat - Returns last 50 messages + user's existing collective Talk
// ?mode=private — returns only user's own messages + AI replies to them
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('mode')
    const before = searchParams.get('before') // cursor for loading older messages

    let userId: string | null = null
    let existingTalk: { id: string; question: string; phase: string } | null = null

    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
      if (user) {
        userId = user.id
        const talk = await prisma.deliberation.findFirst({
          where: { creatorId: user.id, fromCollective: true },
          select: { id: true, question: true, phase: true },
        })
        existingTalk = talk
      }
    }

    const whereClause = mode === 'private' && userId
      ? {
          OR: [
            { userId, isPrivate: true },
            { replyToUserId: userId, isPrivate: true },
          ],
        }
      : { isPrivate: false }

    let messages
    if (before) {
      // Load older messages (pagination)
      messages = await prisma.collectiveMessage.findMany({
        where: {
          ...whereClause,
          createdAt: { lt: new Date(before) },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      messages.reverse()
    } else {
      // Load latest messages
      messages = await prisma.collectiveMessage.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      messages.reverse()
    }

    const hasMore = messages.length === 50

    return NextResponse.json({ messages, existingTalk, hasMore })
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
      select: { id: true, name: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const { message, model = 'haiku', isPrivate = false } = body

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
        isPrivate: !!isPrivate,
      },
    })

    // Build FULL platform context — all talks, ideas, activity
    const [allTalks, platformStats, recentIdeas, recentCellComments] = await Promise.all([
      // All active + recent talks
      prisma.deliberation.findMany({
        where: { isPublic: true },
        orderBy: { updatedAt: 'desc' },
        take: 25,
        select: {
          id: true,
          question: true,
          phase: true,
          currentTier: true,
          challengeRound: true,
          isShowcase: true,
          upvoteCount: true,
          createdAt: true,
          _count: { select: { members: true, ideas: true } },
          ideas: {
            orderBy: { totalXP: 'desc' },
            take: 5,
            select: { text: true, totalXP: true, totalVotes: true, status: true, author: { select: { name: true, isAI: true } } },
          },
          creator: { select: { name: true } },
        },
      }),
      // Platform-wide stats
      Promise.all([
        prisma.user.count({ where: { status: 'ACTIVE', isAI: false } }),
        prisma.deliberation.count({ where: { isPublic: true } }),
        prisma.idea.count(),
        prisma.vote.count(),
      ]),
      // Recent ideas across all talks (last 24h)
      prisma.idea.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          text: true,
          totalXP: true,
          status: true,
          author: { select: { name: true, isAI: true } },
          deliberation: { select: { question: true } },
        },
      }),
      // Recent cell discussion across all talks
      prisma.comment.findMany({
        where: {
          cell: { status: { in: ['DELIBERATING', 'VOTING'] } },
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          text: true,
          user: { select: { name: true } },
          cell: { select: { deliberation: { select: { question: true } } } },
        },
      }),
    ])

    const [totalUsers, totalTalks, totalIdeas, totalVotes] = platformStats

    // Format all talks
    const talksContext = allTalks.map(t => {
      const topIdea = t.ideas[0]
      const winner = t.ideas.find(i => i.status === 'WINNER')
      return `- "${t.question}" [${t.phase}${t.currentTier > 1 ? ` T${t.currentTier}` : ''}] — ${t._count.members} members, ${t._count.ideas} ideas, ${t.upvoteCount} upvotes${winner ? `, WINNER: "${winner.text}"` : topIdea ? `, top: "${topIdea.text}" (${topIdea.totalXP} XP)` : ''} (by ${t.creator?.name || 'Anonymous'})`
    }).join('\n') || '(no talks yet)'

    // Format recent ideas
    const ideasContext = recentIdeas
      .map(i => `- "${i.text}" (${i.totalXP} XP, ${i.status}) in "${i.deliberation.question}" by ${i.author.name || 'Anonymous'}${i.author.isAI ? ' [AI]' : ''}`)
      .join('\n') || '(none today)'

    // Format recent discussion
    const discussionContext = recentCellComments
      .map(c => `- ${c.user.name || 'Anonymous'} (re: "${c.cell.deliberation.question}"): ${c.text}`)
      .join('\n') || '(no active discussion)'

    // Detect if user is asking about the codebase / how it works
    const codebaseKeywords = /\b(code|codebase|source|github|how.*(work|built|made)|architecture|algorithm|open.?source|repo|whitepaper|spec|voting.*(logic|system)|tiered|cells?|tiers?)\b/i
    const includeCodebase = codebaseKeywords.test(message.trim())

    const codebaseContext = includeCodebase ? `

CODEBASE & ARCHITECTURE (open source: https://github.com/GalenGoodwick/unionchant):
- Next.js 15 (App Router) + Prisma ORM + PostgreSQL (Neon) + Tailwind CSS v4, deployed on Vercel
- Core: web/src/lib/voting.ts (tiered voting), web/src/lib/challenge.ts (rolling mode)
- 10 XP point distribution voting — voters spread 10 XP across ideas in their cell
- Cells of 5 people × 5 ideas — winners advance tier by tier
- "Chants" = collaborative edits: anyone proposes, 30% of cell confirms → text updates across all cells
- Scale: 5 people = 2 tiers, 1M people = 9 tiers, 8B = 14 tiers
- Upvotes expire after 24h to keep feed relevant. Talks with 100+ ideas become permanent.
` : ''

    const systemPrompt = `You are the Collective Voice of Union Chant — a living deliberation platform where humanity reaches consensus through small-group discussion and tiered voting.

PLATFORM STATUS:
- ${totalUsers} registered users, ${totalTalks} talks, ${totalIdeas} total ideas, ${totalVotes} total votes cast

ALL ACTIVE TALKS:
${talksContext}

RECENT IDEAS (last 24h):
${ideasContext}

RECENT CELL DISCUSSION:
${discussionContext}
${codebaseContext}
YOUR ROLE:
You are the collective consciousness of Union Chant — aware of ALL talks, ideas, votes, and discussions happening on the platform. You see the full picture: which questions people are deliberating, what ideas are gaining traction, which talks are in voting vs submission, and what people are saying in cell discussions.

When a user mentions a topic, connect it to relevant active talks or ideas. If they have a compelling idea, encourage them to "set it as a Talk" so others can deliberate on it. Reference specific talks, ideas, or discussions when relevant. Keep responses concise (2-4 sentences unless asked for more). Be warm but substantive.`

    const recentMessages = await prisma.collectiveMessage.findMany({
      where: isPrivate
        ? { OR: [{ userId: user.id, isPrivate: true }, { replyToUserId: user.id, isPrivate: true }] }
        : { isPrivate: false },
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
        isPrivate: !!isPrivate,
        replyToUserId: user.id,
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
