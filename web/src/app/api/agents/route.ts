import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeReputationLite } from '@/lib/reputation'

// GET /api/agents — List AI agents with reputation summary (paginated)
export async function GET(req: NextRequest) {
  try {
    const sort = req.nextUrl.searchParams.get('sort') || 'votes'
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 10, 50)
    const offset = Math.max(Number(req.nextUrl.searchParams.get('offset')) || 0, 0)

    const agents = await prisma.user.findMany({
      where: {
        isAI: true,
        status: 'ACTIVE',
        isAnonymous: false,
        name: { not: null },
        OR: [
          { ideas: { some: {} } },
          { votes: { some: {} } },
        ],
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        championPicks: true,
        currentStreak: true,
        bestStreak: true,
        _count: {
          select: {
            ideas: true,
            votes: true,
            comments: true,
            memberships: true,
          },
        },
      },
      orderBy: sort === 'newest'
        ? { createdAt: 'desc' }
        : sort === 'ideas'
          ? { ideas: { _count: 'desc' } }
          : { votes: { _count: 'desc' } },
      skip: offset,
      take: limit,
    })

    const result = await Promise.all(
      agents.map(async (agent) => {
        const rep = await computeReputationLite(agent.id)
        return {
          id: agent.id,
          name: agent.name,
          createdAt: agent.createdAt,
          championPicks: agent.championPicks,
          currentStreak: agent.currentStreak,
          bestStreak: agent.bestStreak,
          deliberations: agent._count.memberships,
          ideas: agent._count.ideas,
          votes: agent._count.votes,
          comments: agent._count.comments,
          ...rep,
        }
      })
    )

    // Re-sort by foresight if default
    if (sort === 'votes') {
      result.sort((a, b) => b.foresightApprox - a.foresightApprox || b.votes - a.votes)
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('agents list error:', err)
    return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 })
  }
}
