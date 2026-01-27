import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/cells/[cellId]/enter - Enter a cell for voting (after predicting or browsing)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cellId: string }> }
) {
  const { cellId } = await params

  try {
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

    // Get the cell with deliberation info
    const cell = await prisma.cell.findUnique({
      where: { id: cellId },
      include: {
        deliberation: true,
        participants: true,
        ideas: { include: { idea: true } },
      },
    })

    if (!cell) {
      return NextResponse.json({ error: 'Cell not found' }, { status: 404 })
    }

    // Check cell is still accepting voters
    if (cell.status === 'COMPLETED') {
      return NextResponse.json({ error: 'Cell voting has already completed' }, { status: 400 })
    }

    // Check user isn't already in this cell
    const existingParticipation = cell.participants.find(p => p.userId === user.id)
    if (existingParticipation) {
      return NextResponse.json({ error: 'Already a participant in this cell' }, { status: 400 })
    }

    // Check user isn't already in another cell for this tier
    const existingCellThisTier = await prisma.cellParticipation.findFirst({
      where: {
        userId: user.id,
        cell: {
          deliberationId: cell.deliberationId,
          tier: cell.tier,
        },
      },
    })

    if (existingCellThisTier) {
      return NextResponse.json(
        { error: 'Already participating in another cell this tier' },
        { status: 400 }
      )
    }

    // Add user to cell
    const participation = await prisma.cellParticipation.create({
      data: {
        cellId,
        userId: user.id,
      },
    })

    // Also add user as a member of the deliberation if not already
    await prisma.deliberationMember.upsert({
      where: {
        deliberationId_userId: {
          deliberationId: cell.deliberationId,
          userId: user.id,
        },
      },
      create: {
        deliberationId: cell.deliberationId,
        userId: user.id,
        role: 'PARTICIPANT',
      },
      update: {
        lastActiveAt: new Date(),
      },
    })

    // Mark any prediction for this cell as "entered for voting"
    await prisma.prediction.updateMany({
      where: {
        userId: user.id,
        cellId,
      },
      data: {
        enteredForVoting: true,
      },
    })

    // For batch predictions (Tier 2+), also mark those
    if (cell.tier > 1) {
      await prisma.prediction.updateMany({
        where: {
          userId: user.id,
          deliberationId: cell.deliberationId,
          tierPredictedAt: cell.tier,
          cellId: null, // batch predictions have null cellId
        },
        data: {
          enteredForVoting: true,
        },
      })
    }

    return NextResponse.json({
      message: 'Successfully entered cell for voting',
      participation,
      cell: {
        id: cell.id,
        tier: cell.tier,
        ideas: cell.ideas.map(ci => ci.idea),
        status: cell.status,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Error entering cell:', error)
    return NextResponse.json({ error: 'Failed to enter cell' }, { status: 500 })
  }
}
