import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/admin/test/simulate-voting - Simulate votes through all tiers
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { deliberationId, leaveFinalVote = true } = body

    if (!deliberationId) {
      return NextResponse.json({ error: 'deliberationId required' }, { status: 400 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Deliberation must be in VOTING phase' }, { status: 400 })
    }

    let votesCreated = 0
    let tiersProcessed = 0
    let champion: string | null = null
    let finalCellStatus: string | null = null

    // Process tiers until we reach completion or final cell
    while (true) {
      // Get incomplete cells (status != COMPLETED) at the current lowest tier
      const incompleteCells = await prisma.cell.findMany({
        where: {
          deliberationId,
          status: { not: 'COMPLETED' },
        },
        include: {
          participants: {
            include: { user: true },
          },
          ideas: {
            include: { idea: true },
          },
          votes: true,
        },
        orderBy: { tier: 'asc' },
      })

      if (incompleteCells.length === 0) {
        // Check if deliberation is complete
        const updatedDeliberation = await prisma.deliberation.findUnique({
          where: { id: deliberationId },
          include: {
            ideas: {
              where: { status: 'WINNER' },
            },
          },
        })

        if (updatedDeliberation?.phase === 'COMPLETED' && updatedDeliberation.ideas.length > 0) {
          champion = updatedDeliberation.ideas[0].text
        }
        break
      }

      const currentTier = incompleteCells[0].tier
      const cellsAtTier = incompleteCells.filter((c: typeof incompleteCells[number]) => c.tier === currentTier)

      for (const cell of cellsAtTier) {
        const votedUserIds = new Set(cell.votes.map((v: { userId: string }) => v.userId))
        const unvotedParticipants = cell.participants.filter((p: { userId: string }) => !votedUserIds.has(p.userId))

        // Check if this is the final cell and we should leave a vote
        const isFinalCell = cellsAtTier.length === 1 && incompleteCells.length === 1
        const participantsToVote = isFinalCell && leaveFinalVote
          ? unvotedParticipants.slice(0, -1) // Leave one participant unvoted
          : unvotedParticipants

        if (isFinalCell && leaveFinalVote && unvotedParticipants.length > 0) {
          finalCellStatus = `Waiting for ${unvotedParticipants.length} vote(s) in final cell`
        }

        // Simulate votes
        for (let i = 0; i < participantsToVote.length; i++) {
          const participant = participantsToVote[i]
          // Vote for different ideas to make it interesting
          const ideaIndex = i % cell.ideas.length
          const ideaToVote = cell.ideas[ideaIndex]

          if (!ideaToVote) continue

          await prisma.vote.create({
            data: {
              cellId: cell.id,
              userId: participant.userId,
              ideaId: ideaToVote.ideaId,
            },
          })
          votesCreated++
        }

        // Check if cell is now complete and process it
        const updatedCell = await prisma.cell.findUnique({
          where: { id: cell.id },
          include: { votes: true, participants: true },
        })

        if (updatedCell && updatedCell.votes.length >= updatedCell.participants.length) {
          await processCompletedCell(cell.id, deliberationId)
        }
      }

      tiersProcessed++

      // Safety limit
      if (tiersProcessed > 10) {
        break
      }
    }

    return NextResponse.json({
      success: true,
      votesCreated,
      tiersProcessed,
      champion,
      finalCellStatus,
    })
  } catch (error) {
    console.error('Error simulating voting:', error)
    return NextResponse.json({ error: 'Failed to simulate voting' }, { status: 500 })
  }
}

async function processCompletedCell(cellId: string, deliberationId: string) {
  const cell = await prisma.cell.findUnique({
    where: { id: cellId },
    include: {
      votes: true,
      ideas: { include: { idea: true } },
    },
  })

  if (!cell) return

  // Count votes per idea
  const voteCounts = new Map<string, number>()
  for (const cellIdea of cell.ideas) {
    voteCounts.set(cellIdea.ideaId, 0)
  }
  for (const vote of cell.votes) {
    voteCounts.set(vote.ideaId, (voteCounts.get(vote.ideaId) || 0) + 1)
  }

  // Find winner
  let maxVotes = 0
  let winnerId: string | null = null
  for (const [ideaId, count] of voteCounts) {
    if (count > maxVotes) {
      maxVotes = count
      winnerId = ideaId
    }
  }

  if (!winnerId) return

  // Mark cell complete
  await prisma.cell.update({
    where: { id: cellId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  })

  // Update idea statuses - winner advances, others eliminated
  for (const cellIdea of cell.ideas) {
    await prisma.idea.update({
      where: { id: cellIdea.ideaId },
      data: {
        status: cellIdea.ideaId === winnerId ? 'ADVANCING' : 'ELIMINATED',
      },
    })
  }

  // Check if we need to advance to next tier
  await checkTierAdvancement(deliberationId, cell.tier)
}

async function checkTierAdvancement(deliberationId: string, currentTier: number) {
  // Get all cells at current tier
  const cellsAtTier = await prisma.cell.findMany({
    where: { deliberationId, tier: currentTier },
  })

  const allComplete = cellsAtTier.every((c: { status: string }) => c.status === 'COMPLETED')
  if (!allComplete) return

  // Get advancing ideas from this tier
  const advancingIdeas = await prisma.idea.findMany({
    where: {
      deliberationId,
      status: 'ADVANCING',
    },
  })

  if (advancingIdeas.length === 1) {
    // We have a champion!
    await prisma.idea.update({
      where: { id: advancingIdeas[0].id },
      data: { status: 'WINNER' },
    })

    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: {
        phase: 'COMPLETED',
        championId: advancingIdeas[0].id,
        completedAt: new Date(),
      },
    })
    return
  }

  if (advancingIdeas.length === 0) return

  // Reset advancing ideas to SUBMITTED for next tier
  for (const idea of advancingIdeas) {
    await prisma.idea.update({
      where: { id: idea.id },
      data: { status: 'SUBMITTED' },
    })
  }

  // Create next tier cells
  const nextTier = currentTier + 1
  const participants = await prisma.deliberationMember.findMany({
    where: { deliberationId },
    include: { user: true },
  })

  // Shuffle participants
  const shuffled = [...participants].sort(() => Math.random() - 0.5)

  // Form cells of 5
  const cellSize = 5
  const ideasPerCell = 5
  const numCells = Math.ceil(advancingIdeas.length / ideasPerCell)

  for (let i = 0; i < numCells; i++) {
    const cellParticipants = shuffled.slice(i * cellSize, (i + 1) * cellSize)
    const cellIdeas = advancingIdeas.slice(i * ideasPerCell, (i + 1) * ideasPerCell)

    if (cellParticipants.length === 0 || cellIdeas.length === 0) continue

    const newCell = await prisma.cell.create({
      data: {
        deliberationId,
        tier: nextTier,
        status: 'VOTING',
      },
    })

    // Add participants
    for (const participant of cellParticipants) {
      await prisma.cellParticipation.create({
        data: {
          cellId: newCell.id,
          userId: participant.userId,
        },
      })
    }

    // Add ideas
    for (const idea of cellIdeas) {
      await prisma.cellIdea.create({
        data: {
          cellId: newCell.id,
          ideaId: idea.id,
        },
      })
    }
  }
}
