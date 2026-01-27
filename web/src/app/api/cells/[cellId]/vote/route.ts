import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'
import { Prisma } from '@prisma/client'

// POST /api/cells/[cellId]/vote - Cast a vote
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

    const body = await req.json()
    const { ideaId, isSecondVote = false } = body

    if (!ideaId) {
      return NextResponse.json({ error: 'Idea ID is required' }, { status: 400 })
    }

    // Use a transaction with serializable isolation to prevent race conditions
    // This ensures that concurrent votes are processed sequentially
    const result = await prisma.$transaction(async (tx) => {
      // Lock the cell row by selecting it within the transaction
      const cell = await tx.cell.findUnique({
        where: { id: cellId },
        include: {
          participants: true,
          ideas: true,
          votes: true,
        },
      })

      if (!cell) {
        throw new Error('CELL_NOT_FOUND')
      }

      // Check user is a participant
      const isParticipant = cell.participants.some((p: { userId: string }) => p.userId === user.id)
      if (!isParticipant) {
        throw new Error('NOT_PARTICIPANT')
      }

      // Check cell is in voting status
      if (cell.status !== 'VOTING') {
        throw new Error('CELL_NOT_VOTING')
      }

      // Check deadline hasn't passed
      if (cell.votingDeadline && cell.votingDeadline < new Date()) {
        throw new Error('DEADLINE_PASSED')
      }

      // Check idea is in this cell
      const ideaInCell = cell.ideas.some((ci: { ideaId: string }) => ci.ideaId === ideaId)
      if (!ideaInCell) {
        throw new Error('IDEA_NOT_IN_CELL')
      }

      // Check if already voted (for this vote type)
      const existingVote = cell.votes.find(
        (v: { userId: string; isSecondVote: boolean }) => v.userId === user.id && v.isSecondVote === isSecondVote
      )
      if (existingVote) {
        throw new Error('ALREADY_VOTED')
      }

      // Create vote
      const vote = await tx.vote.create({
        data: {
          cellId,
          userId: user.id,
          ideaId,
          isSecondVote,
        },
      })

      // Update idea vote count
      await tx.idea.update({
        where: { id: ideaId },
        data: { totalVotes: { increment: 1 } },
      })

      // Update participant status
      await tx.cellParticipation.updateMany({
        where: { cellId, userId: user.id },
        data: { status: 'VOTED', votedAt: new Date() },
      })

      // Check if all participants have voted (within same transaction)
      const voteCount = await tx.vote.count({
        where: { cellId, isSecondVote },
      })

      const activeParticipantCount = cell.participants.filter(
        (p: { status: string }) => p.status === 'ACTIVE' || p.status === 'VOTED'
      ).length

      const allVoted = voteCount >= activeParticipantCount

      return { vote, allVoted }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000, // 10 second timeout
    })

    // Process cell results OUTSIDE the transaction to avoid long locks
    // The transaction ensures only one request sees allVoted=true
    if (result.allVoted) {
      await processCellResults(cellId, false)
    }

    return NextResponse.json(result.vote, { status: 201 })
  } catch (error) {
    // Handle known errors
    if (error instanceof Error) {
      const errorMap: Record<string, { message: string; status: number }> = {
        'CELL_NOT_FOUND': { message: 'Cell not found', status: 404 },
        'NOT_PARTICIPANT': { message: 'Not a participant in this cell', status: 403 },
        'CELL_NOT_VOTING': { message: 'Cell is not in voting phase', status: 400 },
        'DEADLINE_PASSED': { message: 'Voting deadline has passed', status: 400 },
        'IDEA_NOT_IN_CELL': { message: 'Idea is not in this cell', status: 400 },
        'ALREADY_VOTED': { message: 'Already voted', status: 400 },
      }

      const mapped = errorMap[error.message]
      if (mapped) {
        // Handle deadline passed - process timeout
        if (error.message === 'DEADLINE_PASSED') {
          await processCellResults(cellId, true)
        }
        return NextResponse.json({ error: mapped.message }, { status: mapped.status })
      }

      // Handle Prisma unique constraint violation (double-click protection)
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json({ error: 'Already voted' }, { status: 400 })
      }
    }

    console.error('Error casting vote:', error)
    return NextResponse.json({ error: 'Failed to cast vote' }, { status: 500 })
  }
}
