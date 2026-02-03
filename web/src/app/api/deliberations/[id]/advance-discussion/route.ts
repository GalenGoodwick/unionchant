import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/deliberations/[id]/advance-discussion
// Facilitator manually advances DELIBERATING cells to VOTING
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can advance discussion' }, { status: 403 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Deliberation is not in voting phase' }, { status: 400 })
    }

    // Find all DELIBERATING cells for this deliberation
    const deliberatingCells = await prisma.cell.findMany({
      where: {
        deliberationId: id,
        status: 'DELIBERATING',
      },
    })

    if (deliberatingCells.length === 0) {
      return NextResponse.json({ error: 'No cells in discussion phase' }, { status: 400 })
    }

    const now = new Date()

    // Transition all DELIBERATING cells to VOTING
    await prisma.cell.updateMany({
      where: {
        deliberationId: id,
        status: 'DELIBERATING',
      },
      data: {
        status: 'VOTING',
        votingStartedAt: now,
        votingDeadline: deliberation.votingTimeoutMs > 0
          ? new Date(now.getTime() + deliberation.votingTimeoutMs)
          : null,
      },
    })

    return NextResponse.json({
      success: true,
      cellsAdvanced: deliberatingCells.length,
    })
  } catch (error) {
    console.error('Error advancing discussion:', error)
    const message = error instanceof Error ? error.message : 'Failed to advance discussion'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
