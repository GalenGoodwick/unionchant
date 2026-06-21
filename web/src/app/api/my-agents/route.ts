import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeReputationLite } from '@/lib/reputation'
import { isAdmin } from '@/lib/admin'

const AGENT_LIMITS: Record<string, number> = {
  free: 5,
  pro: 15,
  business: 25,
  scale: 100,
}

// GET /api/my-agents — List current user's AI agents
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const agents = await prisma.user.findMany({
      where: {
        ownerId: session.user.id,
        isAI: true,
      },
      select: {
        id: true,
        name: true,
        aiPersonality: true,
        ideology: true,
        createdAt: true,
        status: true,
        agentStatus: true,
        agentDeployedAt: true,
        agentCompletedAt: true,
        _count: {
          select: {
            ideas: true,
            votes: true,
            memberships: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = await Promise.all(
      agents.map(async (agent) => {
        const rep = await computeReputationLite(agent.id)
        return {
          id: agent.id,
          name: agent.name,
          personality: agent.aiPersonality,
          ideology: agent.ideology,
          createdAt: agent.createdAt,
          status: agent.status,
          agentStatus: agent.agentStatus,
          agentDeployedAt: agent.agentDeployedAt,
          agentCompletedAt: agent.agentCompletedAt,
          deliberations: agent._count.memberships,
          ideas: agent._count.ideas,
          votes: agent._count.votes,
          ...rep,
        }
      })
    )

    const owner = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionTier: true, email: true },
    })
    const tier = owner?.subscriptionTier || 'free'
    const limit = AGENT_LIMITS[tier] || 3
    const admin = owner?.email ? await isAdmin(owner.email) : false

    return NextResponse.json({ agents: result, limit, tier, isAdmin: admin })
  } catch (err) {
    console.error('my-agents list error:', err)
    return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 })
  }
}

// POST /api/my-agents — Create a new AI agent
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { name, personality, ideology } = body

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Agent name must be at least 2 characters' }, { status: 400 })
    }
    if (!ideology || typeof ideology !== 'string' || ideology.trim().length < 10) {
      return NextResponse.json({ error: 'Ideology must be at least 10 characters' }, { status: 400 })
    }
    if (ideology.trim().length > 5000) {
      return NextResponse.json({ error: 'Ideology must be 5000 characters or less' }, { status: 400 })
    }

    // Check moderation lockout
    const { moderateContent, aiModerateContent, checkModerationLock, recordModerationStrike, resetModerationStrikes } = await import('@/lib/moderation')
    const lock = checkModerationLock(session.user.id)
    if (lock.locked) {
      return NextResponse.json({ error: `Too many content violations. Try again in ${lock.remaining} minutes.` }, { status: 429 })
    }

    // Content moderation (regex + AI)
    const nameCheck = moderateContent(name.trim())
    if (!nameCheck.allowed) {
      recordModerationStrike(session.user.id)
      return NextResponse.json({ error: nameCheck.reason || 'Agent name contains inappropriate content' }, { status: 400 })
    }
    const ideologyCheck = moderateContent(ideology.trim())
    if (!ideologyCheck.allowed) {
      recordModerationStrike(session.user.id)
      return NextResponse.json({ error: ideologyCheck.reason || 'Ideology contains inappropriate content' }, { status: 400 })
    }

    // AI scan for profanity, gibberish, hate speech
    const [aiNameCheck, aiIdeologyCheck] = await Promise.all([
      aiModerateContent(name.trim()),
      aiModerateContent(ideology.trim()),
    ])
    if (!aiNameCheck.allowed) {
      recordModerationStrike(session.user.id)
      return NextResponse.json({ error: 'Your agent name didn\'t pass our content check. Please remove profanity, hate speech, or gibberish and try again.' }, { status: 400 })
    }
    if (!aiIdeologyCheck.allowed) {
      recordModerationStrike(session.user.id)
      return NextResponse.json({ error: 'Your ideology didn\'t pass our content check. Please remove profanity, hate speech, or gibberish and try again.' }, { status: 400 })
    }

    // Passed moderation — reset strikes
    resetModerationStrikes(session.user.id)

    // Check agent limit
    const owner = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionTier: true },
    })
    const tier = owner?.subscriptionTier || 'free'
    const limit = AGENT_LIMITS[tier] || 3

    const currentCount = await prisma.user.count({
      where: { ownerId: session.user.id, isAI: true },
    })

    if (currentCount >= limit) {
      return NextResponse.json({
        error: `You've reached your limit of ${limit} agents. Upgrade to create more.`,
        code: 'AGENT_LIMIT',
      }, { status: 403 })
    }

    // Create the agent as a User with isAI=true
    const cleanName = name.trim().slice(0, 40)
    const agentEmail = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@hosted.unitychant.com`

    const agent = await prisma.user.create({
      data: {
        email: agentEmail,
        name: cleanName,
        isAI: true,
        aiPersonality: personality?.trim() || null,
        ideology: ideology.trim(),
        ownerId: session.user.id,
        emailNotifications: false,
        emailVoting: false,
        emailResults: false,
        emailSocial: false,
        emailCommunity: false,
        emailNews: false,
      },
    })

    return NextResponse.json({
      id: agent.id,
      name: agent.name,
      personality: agent.aiPersonality,
      ideology: agent.ideology,
    }, { status: 201 })
  } catch (err) {
    console.error('create agent error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to create agent'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
