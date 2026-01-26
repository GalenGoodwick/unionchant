import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'

// POST /api/cells/[cellId]/vote - Cast a vote
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cellId: string }> }
) {
  try {
    const { cellId } = await params
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

    const body = await req.json()
    const { ideaId, isSecondVote = false } = body

    if (!ideaId) {
      return NextResponse.json({ error: 'Idea ID is required' }, { status: 400 })
    }

    const cell = await prisma.cell.findUnique({
      where: { id: cellId },
      include: {
        participants: true,
        ideas: true,
        votes: true,
      },
    })

    if (!cell) {
      return NextResponse.json({ error: 'Cell not found' }, { status: 404 })
    }

    // Check user is a participant
    const isParticipant = cell.participants.some((p: { userId: string }) => p.userId === user.id)
    if (!isParticipant) {
      return NextResponse.json({ error: 'Not a participant in this cell' }, { status: 403 })
    }

    // Check cell is in voting status
    if (cell.status !== 'VOTING') {
      return NextResponse.json({ error: 'Cell is not in voting phase' }, { status: 400 })
    }

    // Check deadline hasn't passed
    if (cell.votingDeadline && cell.votingDeadline < new Date()) {
      // Process timeout and return error
      await processCellResults(cellId, true)
      return NextResponse.json({ error: 'Voting deadline has passed' }, { status: 400 })
    }

    // Check idea is in this cell
    const ideaInCell = cell.ideas.some((ci: { ideaId: string }) => ci.ideaId === ideaId)
    if (!ideaInCell) {
      return NextResponse.json({ error: 'Idea is not in this cell' }, { status: 400 })
    }

    // Check if already voted (for this vote type)
    const existingVote = cell.votes.find(
      (v: { userId: string; isSecondVote: boolean }) => v.userId === user.id && v.isSecondVote === isSecondVote
    )
    if (existingVote) {
      return NextResponse.json({ error: 'Already voted' }, { status: 400 })
    }

    // Create vote
    const vote = await prisma.vote.create({
      data: {
        cellId,
        userId: user.id,
        ideaId,
        isSecondVote,
      },
    })

    // Update idea vote count
    await prisma.idea.update({
      where: { id: ideaId },
      data: { totalVotes: { increment: 1 } },
    })

    // Update participant status
    await prisma.cellParticipation.updateMany({
      where: { cellId, userId: user.id },
      data: { status: 'VOTED', votedAt: new Date() },
    })

    // Check if all participants have voted
    const updatedCell = await prisma.cell.findUnique({
      where: { id: cellId },
      include: {
        participants: { where: { status: { in: ['ACTIVE', 'VOTED'] } } },
        votes: { where: { isSecondVote } },
      },
    })

    const allVoted = updatedCell!.participants.every((p: { userId: string }) =>
      updatedCell!.votes.some((v: { userId: string }) => v.userId === p.userId)
    )

    // If all voted, process cell results
    if (allVoted) {
      await processCellResults(cellId, false)
    }

    return NextResponse.json(vote, { status: 201 })
  } catch (error) {
    console.error('Error casting vote:', error)
    return NextResponse.json({ error: 'Failed to cast vote' }, { status: 500 })
  }
}
