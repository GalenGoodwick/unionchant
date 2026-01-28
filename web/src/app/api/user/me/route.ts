import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/user/me - Get current user's profile
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use raw query to handle missing columns gracefully
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get counts separately
    const [ideasCount, votesCount, commentsCount, deliberationsCreatedCount, membershipsCount] = await Promise.all([
      prisma.idea.count({ where: { authorId: user.id } }),
      prisma.vote.count({ where: { userId: user.id } }),
      prisma.comment.count({ where: { userId: user.id } }),
      prisma.deliberation.count({ where: { creatorId: user.id } }),
      prisma.deliberationMember.count({ where: { userId: user.id } }),
    ])

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        bio: (user as any).bio || null,
        role: user.role,
        status: user.status,
        onboardedAt: (user as any).onboardedAt || null,
        createdAt: user.createdAt,
        totalPredictions: user.totalPredictions,
        correctPredictions: user.correctPredictions,
        championPicks: user.championPicks,
        currentStreak: user.currentStreak,
        bestStreak: user.bestStreak,
        stats: {
          ideas: ideasCount,
          votes: votesCount,
          comments: commentsCount,
          deliberationsCreated: deliberationsCreatedCount,
          memberships: membershipsCount,
        },
      },
    })
  } catch (error) {
    console.error('Error fetching current user:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}

// PATCH /api/user/me - Update current user's profile
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, bio } = await request.json()

    const updateData: { name?: string; bio?: string | null } = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 1) {
        return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
      }
      if (name.length > 50) {
        return NextResponse.json({ error: 'Name must be 50 characters or less' }, { status: 400 })
      }
      updateData.name = name.trim()
    }

    if (bio !== undefined) {
      if (bio === null || bio === '') {
        updateData.bio = null
      } else if (typeof bio === 'string') {
        if (bio.length > 200) {
          return NextResponse.json({ error: 'Bio must be 200 characters or less' }, { status: 400 })
        }
        updateData.bio = bio.trim()
      }
    }

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: updateData,
      select: {
        id: true,
        name: true,
        bio: true,
      },
    })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
