import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// POST /api/admin/test/cleanup - Delete test deliberations and test users
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin-only endpoint
    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Find test deliberations (tagged with 'test' or 'automated')
    const testDeliberations = await prisma.deliberation.findMany({
      where: {
        OR: [
          { tags: { has: 'test' } },
          { tags: { has: 'automated' } },
          { question: { contains: 'Test Deliberation' } },
        ],
      },
    })

    let deletedDeliberations = 0

    for (const delib of testDeliberations) {
      // Delete in order due to foreign keys
      // Delete votes
      await prisma.vote.deleteMany({
        where: { cell: { deliberationId: delib.id } },
      })

      // Delete comments
      await prisma.comment.deleteMany({
        where: { cell: { deliberationId: delib.id } },
      })

      // Delete cell ideas
      await prisma.cellIdea.deleteMany({
        where: { cell: { deliberationId: delib.id } },
      })

      // Delete cell participations
      await prisma.cellParticipation.deleteMany({
        where: { cell: { deliberationId: delib.id } },
      })

      // Delete cells
      await prisma.cell.deleteMany({
        where: { deliberationId: delib.id },
      })

      // Delete ideas
      await prisma.idea.deleteMany({
        where: { deliberationId: delib.id },
      })

      // Delete memberships
      await prisma.deliberationMember.deleteMany({
        where: { deliberationId: delib.id },
      })

      // Delete deliberation
      await prisma.deliberation.delete({
        where: { id: delib.id },
      })

      deletedDeliberations++
    }

    // Delete test users (email contains @test.local)
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        email: { contains: '@test.local' },
      },
    })

    return NextResponse.json({
      success: true,
      deleted: deletedDeliberations,
      usersDeleted: deletedUsers.count,
    })
  } catch (error) {
    console.error('Error cleaning up test data:', error)
    return NextResponse.json({ error: 'Failed to cleanup test data' }, { status: 500 })
  }
}
