import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/user/[id] - Get public user profile
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const session = await getServerSession(authOptions)
    let viewerId: string | null = null
    if (session?.user?.email) {
      const viewer = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
      viewerId = viewer?.id || null
    }

    const user = await prisma.user.findUnique({
      where: { id },
    })

    if (!user || user.status === 'DELETED') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get counts separately for reliability
    // Core stats (these tables always exist)
    const [ideasCount, votesCount, commentsCount, deliberationsCreatedCount, membershipsCount, xpResult] = await Promise.all([
      prisma.idea.count({ where: { authorId: id } }),
      prisma.vote.count({ where: { userId: id } }),
      prisma.comment.count({ where: { userId: id } }),
      prisma.deliberation.count({ where: { creatorId: id } }),
      prisma.deliberationMember.count({ where: { userId: id } }),
      prisma.$queryRaw<{ total: bigint | null }[]>`
        SELECT COALESCE(SUM("xpPoints"), 0) + (SELECT COUNT(*) * 5 FROM "Idea" WHERE "authorId" = ${id}) as total
        FROM "Vote" WHERE "userId" = ${id}
      `,
    ])
    const totalXP = Number(xpResult[0]?.total || 0)

    // Enhanced stats - wrapped in try/catch so profile still loads if any query fails
    let followersCount = 0
    let followingCount = 0
    let isFollowingRecord: any = null
    let ideasWonCount = 0
    let upPollinateStats: any = { _max: { reachTier: null }, _sum: { upvoteCount: null } }
    let commentUpvoteTotal = 0
    let deliberationsVotedIn: any[] = []
    let highestTierIdea: any = { _max: { tier: null } }
    let tierBreakdown: any[] = []

    try {
      const results = await Promise.all([
        prisma.follow.count({ where: { followingId: id } }),
        prisma.follow.count({ where: { followerId: id } }),
        viewerId && viewerId !== id
          ? prisma.follow.findUnique({
              where: { followerId_followingId: { followerId: viewerId, followingId: id } },
            })
          : Promise.resolve(null),
        prisma.idea.count({ where: { authorId: id, status: 'WINNER' } }),
        prisma.comment.aggregate({
          where: { userId: id },
          _max: { reachTier: true },
          _sum: { upvoteCount: true },
        }),
        prisma.commentUpvote.count({
          where: { comment: { userId: id } },
        }),
        prisma.vote.findMany({
          where: { userId: id },
          select: { cell: { select: { deliberationId: true } } },
          distinct: ['cellId'],
        }),
        prisma.idea.aggregate({
          where: { authorId: id },
          _max: { tier: true },
        }),
        prisma.idea.groupBy({
          by: ['tier'],
          where: { authorId: id, tier: { gt: 0 } },
          _count: true,
          orderBy: { tier: 'asc' },
        }),
      ])
      followersCount = results[0]
      followingCount = results[1]
      isFollowingRecord = results[2]
      ideasWonCount = results[3]
      upPollinateStats = results[4]
      commentUpvoteTotal = results[5]
      deliberationsVotedIn = results[6]
      highestTierIdea = results[7]
      tierBreakdown = results[8]
    } catch (err) {
      console.error('Error fetching enhanced stats (using defaults):', err)
    }

    // Get recent activity (last 10 deliberations participated in)
    const recentMemberships = await prisma.deliberationMember.findMany({
      where: { userId: id },
      orderBy: { lastActiveAt: 'desc' },
      take: 10,
      include: {
        deliberation: {
          select: {
            id: true,
            question: true,
            phase: true,
            createdAt: true,
          },
        },
      },
    })

    // Get recent ideas (last 5)
    const recentIdeas = await prisma.idea.findMany({
      where: { authorId: id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        deliberation: {
          select: {
            id: true,
            question: true,
          },
        },
      },
    })

    // Calculate accuracy percentage
    const accuracy =
      user.totalPredictions > 0
        ? Math.round((user.correctPredictions / user.totalPredictions) * 100)
        : null

    // Compute enhanced stats
    const distinctDelibsVotedIn = new Set(deliberationsVotedIn.map(v => v.cell.deliberationId)).size
    const winRate = ideasCount > 0 ? Math.round((ideasWonCount / ideasCount) * 100) : null
    const ideasAdvanced = tierBreakdown.filter(t => t.tier > 1).reduce((sum, t) => sum + t._count, 0)

    // Participation rate: cells assigned vs cells where user voted
    let cellsAssigned = 0
    let cellsVotedIn = 0
    try {
      cellsAssigned = await prisma.cellParticipation.count({ where: { userId: id } })
      cellsVotedIn = await prisma.vote.groupBy({
        by: ['cellId'],
        where: { userId: id },
      }).then(r => r.length)
    } catch { /* table may not exist in older setups */ }
    const participationRate = cellsAssigned > 0 ? Math.round((cellsVotedIn / cellsAssigned) * 100) : null

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name || 'Anonymous',
        image: user.image,
        bio: (user as any).bio || null,
        joinedAt: user.createdAt,
        followersCount,
        followingCount,
        isFollowing: !!isFollowingRecord,
        totalXP,
        stats: {
          ideas: ideasCount,
          votes: votesCount,
          comments: commentsCount,
          deliberationsCreated: deliberationsCreatedCount,
          deliberationsJoined: membershipsCount,
          deliberationsVotedIn: distinctDelibsVotedIn,
          cellsAssigned,
          cellsVotedIn,
          participationRate,
          // Prediction stats
          totalPredictions: user.totalPredictions,
          correctPredictions: user.correctPredictions,
          accuracy,
          championPicks: user.championPicks,
          currentStreak: user.currentStreak,
          bestStreak: user.bestStreak,
          // Win record
          ideasWon: ideasWonCount,
          winRate,
          highestTierReached: highestTierIdea._max.tier || 0,
          ideasAdvanced,
          tierBreakdown: tierBreakdown.map(t => ({ tier: t.tier, count: t._count })),
          // Up-pollinate & comment stats
          highestUpPollinateTier: upPollinateStats._max.reachTier || 1,
          totalUpvotesReceived: commentUpvoteTotal,
          totalCommentUpvotes: upPollinateStats._sum.upvoteCount || 0,
        },
        recentActivity: recentMemberships.map((m) => ({
          deliberationId: m.deliberation.id,
          question: m.deliberation.question,
          phase: m.deliberation.phase,
          lastActive: m.lastActiveAt,
        })),
        recentIdeas: recentIdeas.map((i) => ({
          id: i.id,
          text: i.text,
          status: i.status,
          deliberationId: i.deliberation.id,
          question: i.deliberation.question,
          createdAt: i.createdAt,
        })),
      },
    })
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}
