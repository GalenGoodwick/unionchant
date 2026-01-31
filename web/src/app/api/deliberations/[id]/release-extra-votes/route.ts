import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'

// POST /api/deliberations/[id]/release-extra-votes
// Facilitator action: open a window for users with completed cells to join a second cell
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: deliberationId } = await params

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Auth check: creator or admin
    const admin = await isAdmin(session.user.email)
    if (deliberation.creatorId !== user.id && !admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Deliberation must be in VOTING phase' }, { status: 400 })
    }

    // Set secondVotesEnabled and deadline on all completed cells in current tier
    const deadline = new Date(Date.now() + deliberation.secondVoteTimeoutMs)

    const updated = await prisma.cell.updateMany({
      where: {
        deliberationId,
        tier: deliberation.currentTier,
        status: 'COMPLETED',
      },
      data: {
        secondVotesEnabled: true,
        secondVoteDeadline: deadline,
      },
    })

    // Count eligible users (participants in completed cells who could join another)
    const completedCells = await prisma.cell.findMany({
      where: {
        deliberationId,
        tier: deliberation.currentTier,
        status: 'COMPLETED',
        secondVotesEnabled: true,
      },
      select: {
        participants: {
          select: { userId: true },
        },
      },
    })

    const eligibleUserIds = new Set(completedCells.flatMap(c => c.participants.map(p => p.userId)))

    // Send notifications to eligible users (exclude the facilitator)
    const notificationUserIds = [...eligibleUserIds].filter(uid => uid !== user.id)
    if (notificationUserIds.length > 0) {
      const windowMinutes = Math.round(deliberation.secondVoteTimeoutMs / 60000)
      await prisma.notification.createMany({
        data: notificationUserIds.map(userId => ({
          userId,
          type: 'DELIBERATION_UPDATE' as const,
          title: 'Extra vote released!',
          body: `You can now vote in another cell for "${deliberation.question.slice(0, 60)}". ${windowMinutes}min window.`,
          deliberationId,
        })),
      })
    }

    return NextResponse.json({
      success: true,
      cellsUpdated: updated.count,
      eligibleUsers: eligibleUserIds.size,
      notified: notificationUserIds.length,
      deadline: deadline.toISOString(),
      windowMinutes: Math.round(deliberation.secondVoteTimeoutMs / 60000),
    })
  } catch (error) {
    console.error('Error releasing extra votes:', error)
    return NextResponse.json({ error: 'Failed to release extra votes' }, { status: 500 })
  }
}
