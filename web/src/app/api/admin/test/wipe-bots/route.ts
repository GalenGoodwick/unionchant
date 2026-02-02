import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// POST /api/admin/test/wipe-bots - Delete all test bot users
export async function POST() {
  try {
    // Block test endpoints in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 })
    }

    const session = await getServerSession(authOptions)

    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find test bot user IDs first (protect AI personas)
    const testUsers = await prisma.user.findMany({
      where: {
        isAI: false,
        OR: [
          { email: { contains: '@test.bot' } },
          { email: { contains: '@test.local' } },
          { name: { startsWith: 'Test User' } },
          { name: { startsWith: 'TestBot' } },
          { name: { startsWith: 'Tier3 Test User' } },
        ]
      },
      select: { id: true }
    })

    if (testUsers.length === 0) {
      return NextResponse.json({ success: true, usersDeleted: 0 })
    }

    const userIds = testUsers.map(u => u.id)

    // Delete related records first (foreign key constraints)
    await prisma.commentUpvote.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.vote.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.comment.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.prediction.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.cellParticipation.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.deliberationMember.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.pushSubscription.deleteMany({ where: { userId: { in: userIds } } })

    // Delete ideas by test users (and their related records)
    const testIdeas = await prisma.idea.findMany({
      where: { authorId: { in: userIds } },
      select: { id: true }
    })
    const ideaIds = testIdeas.map(i => i.id)

    if (ideaIds.length > 0) {
      await prisma.vote.deleteMany({ where: { ideaId: { in: ideaIds } } })
      await prisma.cellIdea.deleteMany({ where: { ideaId: { in: ideaIds } } })
      await prisma.prediction.deleteMany({ where: { predictedIdeaId: { in: ideaIds } } })
      await prisma.comment.deleteMany({ where: { ideaId: { in: ideaIds } } })
      await prisma.idea.deleteMany({ where: { id: { in: ideaIds } } })
    }

    // Now delete the users
    const deletedUsers = await prisma.user.deleteMany({
      where: { id: { in: userIds } }
    })

    return NextResponse.json({
      success: true,
      usersDeleted: deletedUsers.count,
      ideasDeleted: ideaIds.length
    })
  } catch (error) {
    console.error('Error wiping bots:', error)
    return NextResponse.json({
      error: 'Failed to wipe bots',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 })
  }
}
