import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/humans — List human users with reputation summary
export async function GET(req: NextRequest) {
  try {
    const sort = req.nextUrl.searchParams.get('sort') || 'votes'

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
      take: 100,
    })

    const result = await Promise.all(
      humans.map(async (user) => {
        // Idea viability
        const ideas = await prisma.idea.findMany({
          where: { authorId: user.id },
          select: { status: true, tier: true, isChampion: true },
        })

        let ideaPoints = 0
        let maxPoints = 0
        for (const idea of ideas) {
          if (idea.status === 'WINNER' || idea.isChampion) ideaPoints += 25
          else if (idea.tier >= 3) ideaPoints += 9
          else if (idea.tier >= 2) ideaPoints += 3
          else if (['ADVANCING', 'DEFENDING'].includes(idea.status)) ideaPoints += 1
          maxPoints += 25
        }
        const ideaViability = maxPoints > 0 ? Math.min(ideaPoints / maxPoints, 1) : 0

        // Voting accuracy
        const userCells = await prisma.cell.findMany({
          where: { status: 'COMPLETED', participants: { some: { userId: user.id } } },
          select: { id: true },
          take: 30,
        })
        let accSum = 0, accCount = 0
        for (const cell of userCells) {
          const myVotes = await prisma.$queryRaw<{ ideaId: string; xpPoints: number }[]>`
            SELECT "ideaId", "xpPoints" FROM "Vote" WHERE "cellId" = ${cell.id} AND "userId" = ${user.id}
          `
          if (myVotes.length === 0) continue
          const cellTotals = await prisma.$queryRaw<{ ideaId: string; total: bigint }[]>`
            SELECT "ideaId", SUM("xpPoints") as total FROM "Vote" WHERE "cellId" = ${cell.id}
            GROUP BY "ideaId" ORDER BY total DESC LIMIT 1
          `
          if (cellTotals.length === 0) continue
          const totalXP = myVotes.reduce((s, v) => s + v.xpPoints, 0)
          const winnerXP = myVotes.find(v => v.ideaId === cellTotals[0].ideaId)?.xpPoints || 0
          accSum += winnerXP / totalXP
          accCount++
        }
        const votingAccuracy = accCount > 0 ? accSum / accCount : 0

        // Comment strength
        const comments = await prisma.comment.findMany({
          where: { userId: user.id, ideaId: { not: null } },
          select: { spreadCount: true, upvoteCount: true },
        })
        const spreadComments = comments.filter(c => c.spreadCount >= 1).length
        const commentStrength = comments.length > 0 ? spreadComments / comments.length : 0
        const totalUpvotes = comments.reduce((s, c) => s + c.upvoteCount, 0)

        const foresightApprox = Math.round((
          ideaViability * 0.40 + votingAccuracy * 0.35 + commentStrength * 0.25
        ) * 100) / 100

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
          totalUpvotes,
          ideaViability: Math.round(ideaViability * 100) / 100,
          votingAccuracy: Math.round(votingAccuracy * 100) / 100,
          commentStrength: Math.round(commentStrength * 100) / 100,
          foresightApprox,
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
