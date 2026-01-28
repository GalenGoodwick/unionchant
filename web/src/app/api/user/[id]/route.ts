import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/user/[id] - Get public user profile
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const user = await prisma.user.findUnique({
      where: { id },
    })

    if (!user || user.status === 'DELETED') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get counts separately for reliability
    const [ideasCount, votesCount, commentsCount, deliberationsCreatedCount, membershipsCount] = await Promise.all([
      prisma.idea.count({ where: { authorId: id } }),
      prisma.vote.count({ where: { userId: id } }),
      prisma.comment.count({ where: { userId: id } }),
      prisma.deliberation.count({ where: { creatorId: id } }),
      prisma.deliberationMember.count({ where: { userId: id } }),
    ])

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

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name || 'Anonymous',
        image: user.image,
        bio: (user as any).bio || null,
        joinedAt: user.createdAt,
        stats: {
          ideas: ideasCount,
          votes: votesCount,
          comments: commentsCount,
          deliberationsCreated: deliberationsCreatedCount,
          deliberationsJoined: membershipsCount,
          // Prediction stats
          totalPredictions: user.totalPredictions,
          correctPredictions: user.correctPredictions,
          accuracy,
          championPicks: user.championPicks,
          currentStreak: user.currentStreak,
          bestStreak: user.bestStreak,
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
