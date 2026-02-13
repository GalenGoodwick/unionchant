import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeReputationLite } from '@/lib/reputation'

// GET /api/humans — List human users with reputation summary (paginated)
export async function GET(req: NextRequest) {
  try {
    const sort = req.nextUrl.searchParams.get('sort') || 'votes'
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 10, 50)
    const offset = Math.max(Number(req.nextUrl.searchParams.get('offset')) || 0, 0)

    const humans = await prisma.user.findMany({
      where: {
        isAI: false,
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
        image: true,
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
      humans.map(async (user) => {
        const rep = await computeReputationLite(user.id)
        return {
          id: user.id,
          name: user.name,
          image: user.image,
          createdAt: user.createdAt,
          championPicks: user.championPicks,
          currentStreak: user.currentStreak,
          bestStreak: user.bestStreak,
          deliberations: user._count.memberships,
          ideas: user._count.ideas,
          votes: user._count.votes,
          comments: user._count.comments,
          ...rep,
        }
      })
    )

    if (sort === 'votes') {
      result.sort((a, b) => b.foresightApprox - a.foresightApprox || b.votes - a.votes)
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('humans list error:', err)
    return NextResponse.json({ error: 'Failed to load humans' }, { status: 500 })
  }
}
