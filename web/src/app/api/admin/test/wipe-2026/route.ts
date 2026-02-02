import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// POST /api/admin/test/wipe-2026 - Delete the stuck 2026 deliberation
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

    // Find all deliberations with "2026" or "Test Completed Cell" in the question
    const deliberations = await prisma.deliberation.findMany({
      where: {
        OR: [
          { question: { contains: '2026' } },
          { question: { contains: 'Test Completed Cell' } },
        ]
      },
      select: { id: true, question: true }
    })

    let deleted = 0

    for (const delib of deliberations) {
      // Delete in order due to foreign keys
      await prisma.vote.deleteMany({
        where: { cell: { deliberationId: delib.id } }
      })

      await prisma.commentUpvote.deleteMany({
        where: { comment: { cell: { deliberationId: delib.id } } }
      })

      await prisma.comment.deleteMany({
        where: { cell: { deliberationId: delib.id } }
      })

      await prisma.cellIdea.deleteMany({
        where: { cell: { deliberationId: delib.id } }
      })

      await prisma.cellParticipation.deleteMany({
        where: { cell: { deliberationId: delib.id } }
      })

      await prisma.cell.deleteMany({
        where: { deliberationId: delib.id }
      })

      await prisma.prediction.deleteMany({
        where: { deliberationId: delib.id }
      })

      await prisma.idea.deleteMany({
        where: { deliberationId: delib.id }
      })

      await prisma.deliberationMember.deleteMany({
        where: { deliberationId: delib.id }
      })

      await prisma.deliberation.delete({
        where: { id: delib.id }
      })

      deleted++
    }

    // Also delete test bot users, but protect AI personas
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        isAI: false,
        OR: [
          { email: { contains: '@test.bot' } },
          { email: { contains: '@test.local' } },
          { name: { startsWith: 'Test User' } },
          { name: { startsWith: 'TestBot' } },
        ]
      }
    })

    return NextResponse.json({
      success: true,
      deliberationsDeleted: deleted,
      deliberations: deliberations.map(d => d.question),
      usersDeleted: deletedUsers.count
    })
  } catch (error) {
    console.error('Error wiping 2026:', error)
    return NextResponse.json({
      error: 'Failed to wipe',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 })
  }
}
