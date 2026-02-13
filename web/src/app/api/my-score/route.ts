import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeReputationLite } from '@/lib/reputation'

// GET /api/my-score — Current user's own Foresight Score
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
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
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const rep = await computeReputationLite(user.id)

    return NextResponse.json({
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
    })
  } catch (err) {
    console.error('my-score error:', err)
    return NextResponse.json({ error: 'Failed to load score' }, { status: 500 })
  }
}
