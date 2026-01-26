import { prisma } from './prisma'
import { sendPushToDeliberation, notifications } from './push'

const CELL_SIZE = 5
const IDEAS_PER_CELL = 5

/**
 * Start voting phase for a deliberation
 * Extracted from start-voting route for reuse in timer processing
 */
export async function startVotingPhase(deliberationId: string) {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    include: {
      ideas: { where: { status: 'SUBMITTED' } },
      members: { where: { role: { in: ['CREATOR', 'PARTICIPANT'] } } },
    },
  })

  if (!deliberation) {
    throw new Error('Deliberation not found')
  }

  if (deliberation.phase !== 'SUBMISSION') {
    throw new Error('Deliberation is not in submission phase')
  }

  if (deliberation.ideas.length < 2) {
    throw new Error('Need at least 2 ideas to start voting')
  }

  // Create cells for Tier 1
  const ideas = deliberation.ideas
  const members = deliberation.members

  // Shuffle ideas and members for random assignment
  const shuffledIdeas = [...ideas].sort(() => Math.random() - 0.5)
  const shuffledMembers = [...members].sort(() => Math.random() - 0.5)

  // Calculate number of cells needed
  const numCells = Math.ceil(shuffledIdeas.length / IDEAS_PER_CELL)

  // Create cells
  const cells: Awaited<ReturnType<typeof prisma.cell.create>>[] = []
  for (let i = 0; i < numCells; i++) {
    const cellIdeas = shuffledIdeas.slice(i * IDEAS_PER_CELL, (i + 1) * IDEAS_PER_CELL)
    const cellMembers = shuffledMembers.slice(i * CELL_SIZE, (i + 1) * CELL_SIZE)

    // If not enough members, wrap around
    const actualMembers = cellMembers.length > 0 ? cellMembers : shuffledMembers.slice(0, CELL_SIZE)

    const cell = await prisma.cell.create({
      data: {
        deliberationId,
        tier: 1,
        status: 'VOTING',
        votingStartedAt: new Date(),
        votingDeadline: new Date(Date.now() + deliberation.votingTimeoutMs),
        ideas: {
          create: cellIdeas.map(idea => ({
            ideaId: idea.id,
          })),
        },
        participants: {
          create: actualMembers.map(member => ({
            userId: member.userId,
          })),
        },
      },
    })

    cells.push(cell)

    // Update idea statuses
    await prisma.idea.updateMany({
      where: { id: { in: cellIdeas.map((i: { id: string }) => i.id) } },
      data: { status: 'IN_VOTING', tier: 1 },
    })
  }

  // Update deliberation phase
  await prisma.deliberation.update({
    where: { id: deliberationId },
    data: { phase: 'VOTING', currentTier: 1 },
  })

  // Send push notifications to all members
  sendPushToDeliberation(
    deliberationId,
    notifications.votingStarted(deliberation.question, deliberationId)
  ).catch(err => console.error('Failed to send push notifications:', err))

  return {
    message: 'Voting started',
    cellsCreated: cells.length,
    tier: 1
  }
}

/**
 * Process cell results and handle tier completion
 */
export async function processCellResults(cellId: string, isTimeout = false) {
  const cell = await prisma.cell.findUnique({
    where: { id: cellId },
    include: {
      ideas: { include: { idea: true } },
      votes: true,
      deliberation: true,
    },
  })

  if (!cell) return null

  // Check if this is a final showdown cell (all cells in tier have same ideas, ≤4 ideas)
  const allCellsInTier = await prisma.cell.findMany({
    where: { deliberationId: cell.deliberationId, tier: cell.tier },
    include: { ideas: true },
  })

  const cellIdeaIds = cell.ideas.map((ci: { ideaId: string }) => ci.ideaId).sort()
  const isFinalShowdown = cellIdeaIds.length <= 4 && cellIdeaIds.length > 0 &&
    allCellsInTier.every(c => {
      const otherIdeaIds = c.ideas.map((ci: { ideaId: string }) => ci.ideaId).sort()
      return otherIdeaIds.length === cellIdeaIds.length &&
             otherIdeaIds.every((id: string, i: number) => id === cellIdeaIds[i])
    })

  let winnerIds: string[] = []
  let loserIds: string[] = []

  // In final showdown, don't mark individual winners/losers - wait for cross-cell tally
  if (!isFinalShowdown) {
    // Count votes per idea
    const voteCounts: Record<string, number> = {}
    cell.votes.forEach(vote => {
      voteCounts[vote.ideaId] = (voteCounts[vote.ideaId] || 0) + 1
    })

    // Find winner(s) - ideas with most votes
    const maxVotes = Math.max(...Object.values(voteCounts), 0)

    if (maxVotes === 0) {
      // No votes cast - all ideas advance
      winnerIds = cell.ideas.map((ci: { ideaId: string }) => ci.ideaId)
    } else {
      winnerIds = Object.entries(voteCounts)
        .filter(([, count]) => count === maxVotes)
        .map(([id]) => id)

      loserIds = cell.ideas
        .map((ci: { ideaId: string }) => ci.ideaId)
        .filter((id: string) => !winnerIds.includes(id))
    }

    // Mark winners as advancing
    await prisma.idea.updateMany({
      where: { id: { in: winnerIds } },
      data: { status: 'ADVANCING' },
    })

    // Mark losers and track tier1 losses
    if (loserIds.length > 0) {
      // For Tier 1 losers, increment tier1Losses
      if (cell.tier === 1) {
        await prisma.idea.updateMany({
          where: { id: { in: loserIds } },
          data: {
            status: 'ELIMINATED',
            tier1Losses: { increment: 1 }
          },
        })
      } else {
        await prisma.idea.updateMany({
          where: { id: { in: loserIds } },
          data: { status: 'ELIMINATED' },
        })
      }
    }
  }

  // Mark cell as completed
  await prisma.cell.update({
    where: { id: cellId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedByTimeout: isTimeout
    },
  })

  // Check if all cells in this tier are complete
  await checkTierCompletion(cell.deliberationId, cell.tier)

  return { winnerIds, loserIds }
}

/**
 * Check if a tier is complete and handle transition to next tier or accumulation
 */
export async function checkTierCompletion(deliberationId: string, tier: number) {
  const cells = await prisma.cell.findMany({
    where: { deliberationId, tier },
    include: {
      ideas: true,
      votes: true,
    },
  })

  const allComplete = cells.every((c: { status: string }) => c.status === 'COMPLETED')

  if (!allComplete) return

  // Check if this is a final showdown (all cells have same ideas, ≤4 ideas)
  const firstCellIdeaIds = cells[0]?.ideas.map((ci: { ideaId: string }) => ci.ideaId).sort() || []
  const allCellsHaveSameIdeas = cells.every(cell => {
    const cellIdeaIds = cell.ideas.map((ci: { ideaId: string }) => ci.ideaId).sort()
    return cellIdeaIds.length === firstCellIdeaIds.length &&
           cellIdeaIds.every((id: string, i: number) => id === firstCellIdeaIds[i])
  })

  // FINAL SHOWDOWN: Cross-cell tallying when all cells vote on same ≤4 ideas
  if (allCellsHaveSameIdeas && firstCellIdeaIds.length <= 4 && firstCellIdeaIds.length > 0) {
    // Count ALL votes across ALL cells
    const crossCellTally: Record<string, number> = {}
    for (const cell of cells) {
      for (const vote of cell.votes) {
        crossCellTally[vote.ideaId] = (crossCellTally[vote.ideaId] || 0) + 1
      }
    }

    // Find the winner (most total votes)
    const sortedIdeas = Object.entries(crossCellTally)
      .sort(([, a], [, b]) => b - a)

    if (sortedIdeas.length > 0) {
      const winnerId = sortedIdeas[0][0]

      // Mark winner
      await prisma.idea.update({
        where: { id: winnerId },
        data: { status: 'WINNER', isChampion: true },
      })

      // Mark others as eliminated
      const loserIds = firstCellIdeaIds.filter((id: string) => id !== winnerId)
      if (loserIds.length > 0) {
        await prisma.idea.updateMany({
          where: { id: { in: loserIds } },
          data: { status: 'ELIMINATED' },
        })
      }

      // Get deliberation for accumulation check
      const deliberation = await prisma.deliberation.findUnique({
        where: { id: deliberationId },
      })

      if (deliberation?.accumulationEnabled) {
        const accumulationEndsAt = new Date(Date.now() + deliberation.accumulationTimeoutMs)
        await prisma.deliberation.update({
          where: { id: deliberationId },
          data: {
            phase: 'ACCUMULATING',
            championId: winnerId,
            accumulationEndsAt,
            championEnteredTier: Math.max(2, tier),
          },
        })

        sendPushToDeliberation(
          deliberationId,
          notifications.accumulationStarted(deliberation.question, deliberationId)
        ).catch(err => console.error('Failed to send push notifications:', err))
      } else {
        await prisma.deliberation.update({
          where: { id: deliberationId },
          data: {
            phase: 'COMPLETED',
            championId: winnerId,
            completedAt: new Date(),
          },
        })

        const deliberation = await prisma.deliberation.findUnique({ where: { id: deliberationId } })
        if (deliberation) {
          sendPushToDeliberation(
            deliberationId,
            notifications.championDeclared(deliberation.question, deliberationId)
          ).catch(err => console.error('Failed to send push notifications:', err))
        }
      }

      return // Final showdown complete
    }
  }

  // Normal case: Get advancing ideas
  const advancingIdeas = await prisma.idea.findMany({
    where: { deliberationId, status: 'ADVANCING' },
  })

  if (advancingIdeas.length === 0) {
    return
  }

  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    include: { members: { where: { role: { in: ['CREATOR', 'PARTICIPANT'] } } } },
  })

  if (!deliberation) return

  // Check if defending champion needs to be added at this tier
  if (deliberation.championEnteredTier && tier + 1 === deliberation.championEnteredTier) {
    const champion = await prisma.idea.findFirst({
      where: { deliberationId, status: 'DEFENDING' }
    })

    if (champion) {
      // Champion joins the advancing ideas
      await prisma.idea.update({
        where: { id: champion.id },
        data: { status: 'ADVANCING' }
      })
      advancingIdeas.push(champion)
    }
  }

  if (advancingIdeas.length === 1) {
    // We have a champion!
    const winnerId = advancingIdeas[0].id

    await prisma.idea.update({
      where: { id: winnerId },
      data: { status: 'WINNER', isChampion: true },
    })

    // Check if accumulation is enabled
    if (deliberation.accumulationEnabled) {
      // Transition to accumulation phase
      const accumulationEndsAt = new Date(Date.now() + deliberation.accumulationTimeoutMs)

      await prisma.deliberation.update({
        where: { id: deliberationId },
        data: {
          phase: 'ACCUMULATING',
          championId: winnerId,
          accumulationEndsAt,
          // Set minimum tier for champion entry (at least tier 2)
          championEnteredTier: Math.max(2, tier),
        },
      })

      // Send notification
      sendPushToDeliberation(
        deliberationId,
        notifications.accumulationStarted(deliberation.question, deliberationId)
      ).catch(err => console.error('Failed to send push notifications:', err))
    } else {
      // Complete the deliberation
      await prisma.deliberation.update({
        where: { id: deliberationId },
        data: {
          phase: 'COMPLETED',
          championId: winnerId,
          completedAt: new Date(),
        },
      })

      sendPushToDeliberation(
        deliberationId,
        notifications.championDeclared(deliberation.question, deliberationId)
      ).catch(err => console.error('Failed to send push notifications:', err))
    }
  } else {
    // Need another tier - create new cells with advancing ideas
    const nextTier = tier + 1
    const shuffledIdeas = [...advancingIdeas].sort(() => Math.random() - 0.5)
    const shuffledMembers = [...deliberation.members].sort(() => Math.random() - 0.5)

    const IDEAS_PER_CELL = 5
    const CELL_SIZE = 5

    // Reset advancing ideas status
    await prisma.idea.updateMany({
      where: { id: { in: advancingIdeas.map((i: { id: string }) => i.id) } },
      data: { status: 'IN_VOTING', tier: nextTier },
    })

    // FINAL SHOWDOWN: If 4 or fewer ideas, ALL participants vote on ALL ideas
    if (shuffledIdeas.length <= 4) {
      // Create multiple cells (one per ~5 participants), all voting on same ideas
      const numCells = Math.ceil(shuffledMembers.length / CELL_SIZE)

      for (let i = 0; i < numCells; i++) {
        const cellMembers = shuffledMembers.slice(i * CELL_SIZE, (i + 1) * CELL_SIZE)
        if (cellMembers.length === 0) continue

        await prisma.cell.create({
          data: {
            deliberationId,
            tier: nextTier,
            status: 'VOTING',
            votingStartedAt: new Date(),
            votingDeadline: new Date(Date.now() + deliberation.votingTimeoutMs),
            ideas: {
              create: shuffledIdeas.map(idea => ({ ideaId: idea.id })),
            },
            participants: {
              create: cellMembers.map(member => ({ userId: member.userId })),
            },
          },
        })
      }
    } else {
      // Normal case: batch ideas among cells
      const numCells = Math.ceil(shuffledIdeas.length / IDEAS_PER_CELL)

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
    }

    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: { currentTier: nextTier },
    })

    // Send notification for new tier
    sendPushToDeliberation(
      deliberationId,
      notifications.newTier(nextTier, deliberationId)
    ).catch(err => console.error('Failed to send push notifications:', err))
  }
}
