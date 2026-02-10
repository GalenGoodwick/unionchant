import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminVerified } from '@/lib/admin'

// POST /api/admin/test/cleanup - Delete test deliberations and test users
export async function POST(req: NextRequest) {
  try {
    // Block test endpoints in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 })
    }

    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    // Find test deliberations
    const testDeliberations = await prisma.deliberation.findMany({
      where: {
        OR: [
          { tags: { has: 'test' } },
          { tags: { has: 'automated' } },
          { question: { contains: 'Test Deliberation' } },
          { question: { contains: '[TEST]' } },
        ],
      },
    })

    console.log(`[CLEANUP] Found ${testDeliberations.length} test deliberations`)
    let deletedDeliberations = 0

    for (const delib of testDeliberations) {
      const id = delib.id
      console.log(`[CLEANUP] Deleting deliberation: ${delib.question.slice(0, 50)}...`)

      try {

        // Delete notifications
        await prisma.notification.deleteMany({
          where: { deliberationId: id },
        })

        // Delete predictions
        await prisma.prediction.deleteMany({
          where: { deliberationId: id },
        })

        // Delete watches
        await prisma.watch.deleteMany({
          where: { deliberationId: id },
        })

        // Delete votes
        await prisma.vote.deleteMany({
          where: { cell: { deliberationId: id } },
        })

        // Delete comment upvotes
        await prisma.commentUpvote.deleteMany({
          where: {
            OR: [
              { comment: { cell: { deliberationId: id } } },
              { comment: { idea: { deliberationId: id } } },
            ]
          },
        })

        // Clear comment reply refs
        await prisma.comment.updateMany({
          where: {
            OR: [
              { cell: { deliberationId: id } },
              { idea: { deliberationId: id } },
            ]
          },
          data: { replyToId: null },
        })

        // Delete comments
        await prisma.comment.deleteMany({
          where: {
            OR: [
              { cell: { deliberationId: id } },
              { idea: { deliberationId: id } },
            ]
          },
        })

        // Delete cell ideas
        await prisma.cellIdea.deleteMany({
          where: { cell: { deliberationId: id } },
        })

        // Delete cell participations
        await prisma.cellParticipation.deleteMany({
          where: { cell: { deliberationId: id } },
        })

        // Delete cells
        await prisma.cell.deleteMany({
          where: { deliberationId: id },
        })

        // Delete ideas
        await prisma.idea.deleteMany({
          where: { deliberationId: id },
        })

        // Delete memberships
        await prisma.deliberationMember.deleteMany({
          where: { deliberationId: id },
        })

        // Delete deliberation
        await prisma.deliberation.delete({
          where: { id },
        })

        deletedDeliberations++
        console.log(`[CLEANUP] Deleted deliberation ${id}`)
      } catch (err) {
        console.error(`[CLEANUP] Failed to delete ${id}:`, err)
      }
    }

    // Delete test users (email contains @test.local), but protect AI personas
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        email: { contains: '@test.local' },
        isAI: false,
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
