import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'

// POST /api/admin/test/wipe-bots - Delete all test bot users
export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email || !(await isAdmin(session.user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find test bot user IDs first (protect AI personas and podium-writing bots)
    const testUsers = await prisma.user.findMany({
      where: {
        isAI: false,
        podiums: { none: {} },
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
    // Social graph
    await prisma.follow.deleteMany({ where: { OR: [{ followerId: { in: userIds } }, { followingId: { in: userIds } }] } })
    await prisma.agreementScore.deleteMany({ where: { OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }] } })

    // Community
    await prisma.communityBan.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.groupMessage.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.communityMember.deleteMany({ where: { userId: { in: userIds } } })

    // Chat & messages
    await prisma.collectiveMessage.deleteMany({ where: { userId: { in: userIds } } })

    // Votes, comments, upvotes
    await prisma.commentUpvote.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.deliberationUpvote.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.ideaRevisionVote.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.vote.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.comment.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.prediction.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.cellParticipation.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.deliberationMember.deleteMany({ where: { userId: { in: userIds } } })

    // Notifications, watches, push
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.pushSubscription.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.watch.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.report.deleteMany({ where: { reporterId: { in: userIds } } })

    // Delete ideas by test users (and their related records)
    const testIdeas = await prisma.idea.findMany({
      where: { authorId: { in: userIds } },
      select: { id: true }
    })
    const ideaIds = testIdeas.map(i => i.id)

    if (ideaIds.length > 0) {
      await prisma.ideaRevisionVote.deleteMany({ where: { revision: { ideaId: { in: ideaIds } } } })
      await prisma.ideaRevision.deleteMany({ where: { ideaId: { in: ideaIds } } })
      await prisma.vote.deleteMany({ where: { ideaId: { in: ideaIds } } })
      await prisma.cellIdea.deleteMany({ where: { ideaId: { in: ideaIds } } })
      await prisma.prediction.deleteMany({ where: { predictedIdeaId: { in: ideaIds } } })
      await prisma.comment.deleteMany({ where: { ideaId: { in: ideaIds } } })
      await prisma.idea.deleteMany({ where: { id: { in: ideaIds } } })
    }

    // Auth records
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } })

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
