import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeReputationLite } from '@/lib/reputation'

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
        championPicks: true,
        currentStreak: true,
        bestStreak: true,
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
      select: { subscriptionTier: true },
    })
    const tier = owner?.subscriptionTier || 'free'
    const limit = AGENT_LIMITS[tier] || 3

    return NextResponse.json({ agents: result, limit, tier })
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
