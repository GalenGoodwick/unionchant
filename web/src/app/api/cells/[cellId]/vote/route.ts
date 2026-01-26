import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
    const isParticipant = cell.participants.some(p => p.userId === user.id)
    if (!isParticipant) {
      return NextResponse.json({ error: 'Not a participant in this cell' }, { status: 403 })
    }

    // Check cell is in voting status
    if (cell.status !== 'VOTING') {
      return NextResponse.json({ error: 'Cell is not in voting phase' }, { status: 400 })
    }

    // Check idea is in this cell
    const ideaInCell = cell.ideas.some(ci => ci.ideaId === ideaId)
    if (!ideaInCell) {
      return NextResponse.json({ error: 'Idea is not in this cell' }, { status: 400 })
    }

    // Check if already voted (for this vote type)
    const existingVote = cell.votes.find(
      v => v.userId === user.id && v.isSecondVote === isSecondVote
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

    const allVoted = updatedCell!.participants.every(p =>
      updatedCell!.votes.some(v => v.userId === p.userId)
    )

    // If all voted, process cell results
    if (allVoted) {
      await processCellResults(cellId)
    }

    return NextResponse.json(vote, { status: 201 })
  } catch (error) {
    console.error('Error casting vote:', error)
    return NextResponse.json({ error: 'Failed to cast vote' }, { status: 500 })
  }
}

async function processCellResults(cellId: string) {
  const cell = await prisma.cell.findUnique({
    where: { id: cellId },
    include: {
      ideas: { include: { idea: true } },
      votes: true,
      deliberation: true,
    },
  })

  if (!cell) return

  // Count votes per idea
  const voteCounts: Record<string, number> = {}
  cell.votes.forEach(vote => {
    voteCounts[vote.ideaId] = (voteCounts[vote.ideaId] || 0) + 1
  })

  // Find winner(s) - ideas with most votes
  const maxVotes = Math.max(...Object.values(voteCounts), 0)

  if (maxVotes === 0) {
    // No votes cast - all ideas advance
    await prisma.idea.updateMany({
      where: { id: { in: cell.ideas.map(ci => ci.ideaId) } },
      data: { status: 'ADVANCING' },
    })
  } else {
    const winnerIds = Object.entries(voteCounts)
      .filter(([, count]) => count === maxVotes)
      .map(([id]) => id)

    // Mark winners as advancing
    await prisma.idea.updateMany({
      where: { id: { in: winnerIds } },
      data: { status: 'ADVANCING' },
    })

    // Mark losers as eliminated
    const loserIds = cell.ideas
      .map(ci => ci.ideaId)
      .filter(id => !winnerIds.includes(id))

    await prisma.idea.updateMany({
      where: { id: { in: loserIds } },
      data: { status: 'ELIMINATED' },
    })
  }

  // Mark cell as completed
  await prisma.cell.update({
    where: { id: cellId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })

  // Check if all cells in this tier are complete
  await checkTierCompletion(cell.deliberationId, cell.tier)
}

async function checkTierCompletion(deliberationId: string, tier: number) {
  const cells = await prisma.cell.findMany({
    where: { deliberationId, tier },
  })

  const allComplete = cells.every(c => c.status === 'COMPLETED')

  if (!allComplete) return

  // Get advancing ideas
  const advancingIdeas = await prisma.idea.findMany({
    where: { deliberationId, status: 'ADVANCING' },
  })

  if (advancingIdeas.length === 0) {
    // No winners - should not happen normally
    return
  }

  if (advancingIdeas.length === 1) {
    // We have a champion!
    await prisma.idea.update({
      where: { id: advancingIdeas[0].id },
      data: { status: 'WINNER', isChampion: true },
    })

    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: {
        phase: 'COMPLETED',
        championId: advancingIdeas[0].id,
        completedAt: new Date(),
      },
    })
  } else {
    // Need another tier - create new cells with advancing ideas
    const deliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
      include: { members: { where: { role: { in: ['CREATOR', 'PARTICIPANT'] } } } },
    })

    if (!deliberation) return

    const nextTier = tier + 1
    const shuffledIdeas = [...advancingIdeas].sort(() => Math.random() - 0.5)
    const shuffledMembers = [...deliberation.members].sort(() => Math.random() - 0.5)

    const IDEAS_PER_CELL = 5
    const CELL_SIZE = 5
    const numCells = Math.ceil(shuffledIdeas.length / IDEAS_PER_CELL)

    // Reset advancing ideas status
    await prisma.idea.updateMany({
      where: { id: { in: advancingIdeas.map(i => i.id) } },
      data: { status: 'IN_VOTING', tier: nextTier },
    })

    for (let i = 0; i < numCells; i++) {
      const cellIdeas = shuffledIdeas.slice(i * IDEAS_PER_CELL, (i + 1) * IDEAS_PER_CELL)
      const cellMembers = shuffledMembers.slice(i * CELL_SIZE, (i + 1) * CELL_SIZE)
      const actualMembers = cellMembers.length > 0 ? cellMembers : shuffledMembers.slice(0, CELL_SIZE)

      await prisma.cell.create({
        data: {
          deliberationId,
          tier: nextTier,
          status: 'VOTING',
          votingStartedAt: new Date(),
          votingDeadline: new Date(Date.now() + deliberation.votingTimeoutMs),
          ideas: {
            create: cellIdeas.map(idea => ({ ideaId: idea.id })),
          },
          participants: {
            create: actualMembers.map(member => ({ userId: member.userId })),
          },
        },
      })
    }

    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: { currentTier: nextTier },
    })
  }
}
