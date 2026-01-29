import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Check if user is admin
async function isAdmin(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  })
  return user?.role === 'ADMIN'
}

// POST /api/admin/deliberation/[id]/reset - Reset deliberation to SUBMISSION phase
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email || !(await isAdmin(session.user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: deliberationId } = await params

    // Verify deliberation exists
    const deliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Get all cells for this deliberation
    const cells = await prisma.cell.findMany({
      where: { deliberationId },
      select: { id: true },
    })
    const cellIds = cells.map(c => c.id)

    // Delete all cell-related data
    if (cellIds.length > 0) {
      await prisma.commentUpvote.deleteMany({
        where: { comment: { cellId: { in: cellIds } } },
      })
      await prisma.comment.deleteMany({
        where: { cellId: { in: cellIds } },
      })
      await prisma.vote.deleteMany({
        where: { cellId: { in: cellIds } },
      })
      await prisma.prediction.deleteMany({
        where: { cellId: { in: cellIds } },
      })
      await prisma.cellParticipation.deleteMany({
        where: { cellId: { in: cellIds } },
      })
      await prisma.cellIdea.deleteMany({
        where: { cellId: { in: cellIds } },
      })
      await prisma.cell.deleteMany({
        where: { deliberationId },
      })
    }

    // Find test bot members in this deliberation
    const testBotMembers = await prisma.deliberationMember.findMany({
      where: {
        deliberationId,
        user: {
          OR: [
            { email: { contains: '@test.local' } },
            { email: { contains: '@test.bot' } },
            { name: { startsWith: 'Test User' } },
            { name: { startsWith: 'TestBot' } },
          ],
        },
      },
      select: { userId: true },
    })
    const testBotUserIds = testBotMembers.map(m => m.userId)

    // Delete ideas by test bots
    if (testBotUserIds.length > 0) {
      await prisma.idea.deleteMany({
        where: {
          deliberationId,
          authorId: { in: testBotUserIds },
        },
      })

      // Remove test bot members from deliberation
      await prisma.deliberationMember.deleteMany({
        where: {
          deliberationId,
          userId: { in: testBotUserIds },
        },
      })
    }

    // Reset remaining ideas to SUBMITTED status
    await prisma.idea.updateMany({
      where: { deliberationId },
      data: {
        status: 'SUBMITTED',
        tier: 0,
        isChampion: false,
        losses: 0,
        totalVotes: 0,
      },
    })

    // Reset deliberation to SUBMISSION phase
    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: {
        phase: 'SUBMISSION',
        currentTier: 0,
        challengeRound: 0,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Deliberation reset to SUBMISSION phase',
      deletedCells: cellIds.length,
      removedTestBots: testBotUserIds.length,
    })
  } catch (error) {
    console.error('Error resetting deliberation:', error)
    return NextResponse.json(
      { error: 'Failed to reset deliberation' },
      { status: 500 }
    )
  }
}
