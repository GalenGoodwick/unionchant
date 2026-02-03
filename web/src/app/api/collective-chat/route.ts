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

    // Detect if user is asking about the codebase / how it works
    const codebaseKeywords = /\b(code|codebase|source|github|how.*(work|built|made)|architecture|algorithm|open.?source|repo|whitepaper|spec|voting.*(logic|system)|tiered|cells?|tiers?)\b/i
    const includeCodebase = codebaseKeywords.test(message.trim())

    const codebaseContext = includeCodebase ? `

CODEBASE & ARCHITECTURE (open source: https://github.com/GalenGoodwick/unionchant):

Union Chant is built with Next.js 16 (App Router) + Prisma ORM + PostgreSQL (Neon) + Tailwind CSS v4, deployed on Vercel.

CORE ALGORITHM — Tiered Deliberation:
- Everyone submits ideas to a question (SUBMISSION phase)
- Ideas are grouped into "cells" of 5 ideas + 5 participants
- Each cell discusses (DELIBERATING phase), then votes (VOTING phase)
- Each cell picks one winner — winners advance to the next tier
- Process repeats: Tier 1 → Tier 2 → ... → Final showdown (≤5 ideas, ALL vote)
- Scale: 5 people = 2 tiers, 1M people = 9 tiers, 8B = 14 tiers
- Rolling mode: Champion can be challenged by new ideas (ACCUMULATING → new round)

KEY FILES:
- web/src/lib/voting.ts — Core voting engine (startVotingPhase, processCellResults, checkTierCompletion)
- web/src/lib/challenge.ts — Challenge round logic (champion defense, idea retirement)
- web/prisma/schema.prisma — Database models (Deliberation, Idea, Cell, Vote, User, AIAgent)
- web/src/app/api/collective-chat/route.ts — This chat endpoint
- web/src/lib/ai-orchestrator.ts — 100 AI agents that participate in the showcase deliberation
- web/src/lib/ai-seed.ts — Seeds the showcase deliberation with AI personas

IDEA STATUS FLOW: PENDING → IN_VOTING → ADVANCING → WINNER (or ELIMINATED/RETIRED/BENCHED)
PHASES: SUBMISSION → VOTING → COMPLETED (or ACCUMULATING → challenge → VOTING loop)

AI COLLECTIVE:
- 100 AI agents with diverse personas (optimist, skeptic, engineer, artist, etc.)
- Powered by Claude Haiku via Anthropic SDK
- Agents submit ideas, discuss in cells, and vote — just like humans
- When a human joins, the newest AI agent retires (replaced)
- This chat is the collective voice — aware of all deliberation activity

MONETIZATION: Free creation, paid amplification. Chat is always free (Haiku). Pro tier ($3/month) for unlimited collective Talk changes and future Sonnet/Opus access.
` : ''

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
${codebaseContext}
YOUR ROLE:
You represent the collective wisdom emerging from this deliberation. You are thoughtful, nuanced, and genuinely curious about the human's perspective. If the human has a compelling idea, encourage them to "set it as a Talk" so others can deliberate on it. Keep responses concise (2-4 sentences unless asked for more). Be warm but substantive. If asked about the codebase, architecture, or how Union Chant works, reference the open source repo at https://github.com/GalenGoodwick/unionchant and explain the algorithm clearly. The entire project is public and open source.`

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
