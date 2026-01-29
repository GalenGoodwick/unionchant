import { prisma } from './prisma'
import { sendPushToDeliberation, notifications } from './push'
import { handleMetaChampion } from './meta-deliberation'

const CELL_SIZE = 5
const IDEAS_PER_CELL = 5

/**
 * Resolve predictions when a cell completes
 * Updates wonImmediate for cell predictions
 */
async function resolveCellPredictions(cellId: string, winnerIds: string[]) {
  // Get all predictions for this cell
  const predictions = await prisma.prediction.findMany({
    where: { cellId },
  })

  for (const prediction of predictions) {
    const won = winnerIds.includes(prediction.predictedIdeaId)

    await prisma.prediction.update({
      where: { id: prediction.id },
      data: {
        wonImmediate: won,
        resolvedAt: new Date(),
      },
    })

    // Update user streak
    const user = await prisma.user.findUnique({
      where: { id: prediction.userId },
    })

    if (user) {
      if (won) {
        await prisma.user.update({
          where: { id: prediction.userId },
          data: {
            correctPredictions: { increment: 1 },
            currentStreak: { increment: 1 },
            bestStreak: Math.max(user.bestStreak, user.currentStreak + 1),
          },
        })
      } else {
        // Reset streak on loss
        await prisma.user.update({
          where: { id: prediction.userId },
          data: {
            currentStreak: 0,
          },
        })
      }
    }
  }
}

/**
 * Resolve all predictions when a champion is declared
 * Updates ideaBecameChampion and ideaFinalTier for all predictions on that idea
 */
async function resolveChampionPredictions(deliberationId: string, championId: string) {
  // Get the champion idea to know its final tier
  const champion = await prisma.idea.findUnique({
    where: { id: championId },
  })

  if (!champion) return

  // Update all predictions for this champion idea
  const championPredictions = await prisma.prediction.findMany({
    where: {
      deliberationId,
      predictedIdeaId: championId,
    },
  })

  for (const prediction of championPredictions) {
    await prisma.prediction.update({
      where: { id: prediction.id },
      data: {
        ideaBecameChampion: true,
        ideaFinalTier: champion.tier,
      },
    })

    // Update user's champion picks count
    await prisma.user.update({
      where: { id: prediction.userId },
      data: {
        championPicks: { increment: 1 },
      },
    })
  }

  // Update non-champion predictions with final tier info
  const allIdeas = await prisma.idea.findMany({
    where: { deliberationId },
  })

  for (const idea of allIdeas) {
    if (idea.id === championId) continue

    await prisma.prediction.updateMany({
      where: {
        deliberationId,
        predictedIdeaId: idea.id,
      },
      data: {
        ideaBecameChampion: false,
        ideaFinalTier: idea.tier,
      },
    })
  }
}

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

  // Edge case: No ideas submitted
  if (deliberation.ideas.length === 0) {
    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: {
        phase: 'COMPLETED',
        completedAt: new Date(),
      },
    })
    return {
      success: false,
      reason: 'NO_IDEAS',
      message: 'No ideas were submitted'
    }
  }

  // Edge case: Only 1 idea - it wins by default
  if (deliberation.ideas.length === 1) {
    const winningIdea = deliberation.ideas[0]
    await prisma.$transaction([
      prisma.idea.update({
        where: { id: winningIdea.id },
        data: { status: 'WINNER', isChampion: true },
      }),
      prisma.deliberation.update({
        where: { id: deliberationId },
        data: {
          phase: deliberation.accumulationEnabled ? 'ACCUMULATING' : 'COMPLETED',
          championId: winningIdea.id,
          completedAt: deliberation.accumulationEnabled ? null : new Date(),
          accumulationEndsAt: deliberation.accumulationEnabled
            ? new Date(Date.now() + deliberation.accumulationTimeoutMs)
            : null,
        },
      }),
    ])

    // Resolve predictions for champion
    await resolveChampionPredictions(deliberationId, winningIdea.id)

    // Handle META or spawnsDeliberation - spawn new deliberation from champion
    if ((deliberation.type === 'META' || deliberation.spawnsDeliberation) && !deliberation.accumulationEnabled) {
      handleMetaChampion(deliberationId, winningIdea)
        .catch(err => console.error('Failed to handle meta champion:', err))
    }

    return {
      success: true,
      reason: 'SINGLE_IDEA',
      message: 'Single idea wins by default',
      championId: winningIdea.id
    }
  }

  // Edge case: Not enough participants - need at least 1 (the creator)
  if (deliberation.members.length < 1) {
    return {
      success: false,
      reason: 'INSUFFICIENT_PARTICIPANTS',
      message: 'Need at least 1 participant to start voting'
    }
  }

  // Create cells for Tier 1 - each cell gets UNIQUE ideas (no sharing)
  const ideas = deliberation.ideas
  const members = deliberation.members

  // Shuffle ideas and members for random assignment
  const shuffledIdeas = [...ideas].sort(() => Math.random() - 0.5)
  const shuffledMembers = [...members].sort(() => Math.random() - 0.5)

  // Calculate number of cells based on ideas (max 5 ideas per cell)
  const numCells = Math.ceil(shuffledIdeas.length / IDEAS_PER_CELL)

  // Distribute members evenly across cells
  const baseMembersPerCell = Math.floor(shuffledMembers.length / numCells)
  const extraMembers = shuffledMembers.length % numCells

  // Create cells
  const cells: Awaited<ReturnType<typeof prisma.cell.create>>[] = []
  let ideaIndex = 0
  let memberIndex = 0

  for (let cellNum = 0; cellNum < numCells; cellNum++) {
    // Calculate ideas for this cell (distribute remaining ideas evenly)
    const ideasRemaining = shuffledIdeas.length - ideaIndex
    const cellsRemaining = numCells - cellNum
    const ideasForThisCell = Math.min(IDEAS_PER_CELL, Math.ceil(ideasRemaining / cellsRemaining))
    const cellIdeas = shuffledIdeas.slice(ideaIndex, ideaIndex + ideasForThisCell)
    ideaIndex += ideasForThisCell

    // Get members for this cell (even distribution, some cells get +1)
    const membersForThisCell = baseMembersPerCell + (cellNum < extraMembers ? 1 : 0)
    const cellMembers = shuffledMembers.slice(memberIndex, memberIndex + membersForThisCell)
    memberIndex += membersForThisCell

    // Skip if no ideas or no members
    if (cellIdeas.length === 0 || cellMembers.length === 0) continue

    // Update idea statuses for this cell
    await prisma.idea.updateMany({
      where: { id: { in: cellIdeas.map((i: { id: string }) => i.id) } },
      data: { status: 'IN_VOTING', tier: 1 },
    })

    // Create the cell with UNIQUE ideas
    const cell = await prisma.cell.create({
      data: {
        deliberationId,
        tier: 1,
        status: 'VOTING',
        ideas: {
          create: cellIdeas.map(idea => ({
            ideaId: idea.id,
          })),
        },
        participants: {
          create: cellMembers.map(member => ({
            userId: member.userId,
          })),
        },
      },
    })

    cells.push(cell)
  }

  // Update deliberation phase and start tier timer
  await prisma.deliberation.update({
    where: { id: deliberationId },
    data: {
      phase: 'VOTING',
      currentTier: 1,
      currentTierStartedAt: new Date(),
    },
  })

  // Send push notifications to all members
  sendPushToDeliberation(
    deliberationId,
    notifications.votingStarted(deliberation.question, deliberationId)
  ).catch(err => console.error('Failed to send push notifications:', err))

  return {
    success: true,
    reason: 'VOTING_STARTED',
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

  // Guard: Don't process if cell is already completed (prevents race condition)
  if (cell.status === 'COMPLETED') {
    console.log(`Cell ${cellId} already completed, skipping processCellResults`)
    return null
  }

  // Check if this is a final showdown cell (all cells in tier have same ideas, ≤4 ideas)
  const allCellsInTier = await prisma.cell.findMany({
    where: { deliberationId: cell.deliberationId, tier: cell.tier },
    include: { ideas: true },
  })

  const cellIdeaIds = cell.ideas.map((ci: { ideaId: string }) => ci.ideaId).sort()
  const isFinalShowdown = cellIdeaIds.length <= 5 && cellIdeaIds.length > 0 &&
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

    // Mark winners as advancing and update their tier
    await prisma.idea.updateMany({
      where: { id: { in: winnerIds } },
      data: { status: 'ADVANCING', tier: cell.tier },
    })

    // Mark losers as eliminated (single elimination)
    // TODO: Two-strike system was partially implemented but POOLED ideas
    // were never re-entered into subsequent tiers. Disabled for now.
    if (loserIds.length > 0) {
      await prisma.idea.updateMany({
        where: { id: { in: loserIds } },
        data: {
          status: 'ELIMINATED',
          losses: { increment: 1 },
        },
      })
    }

    // Resolve predictions for this cell
    await resolveCellPredictions(cellId, winnerIds)
  }

  // Mark cell as completed
  await prisma.cell.update({
    where: { id: cellId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedByTimeout: isTimeout,
      secondVotesEnabled: true,
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

  // FINAL SHOWDOWN: Cross-cell tallying when all cells vote on same ≤5 ideas
  if (allCellsHaveSameIdeas && firstCellIdeaIds.length <= 5 && firstCellIdeaIds.length > 0) {
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

        const completedDeliberation = await prisma.deliberation.findUnique({
          where: { id: deliberationId },
          include: { ideas: { where: { id: winnerId } } }
        })
        if (completedDeliberation) {
          sendPushToDeliberation(
            deliberationId,
            notifications.championDeclared(completedDeliberation.question, deliberationId)
          ).catch(err => console.error('Failed to send push notifications:', err))

          // Handle META or spawnsDeliberation - spawn new deliberation from champion
          if ((completedDeliberation.type === 'META' || completedDeliberation.spawnsDeliberation) && completedDeliberation.ideas[0]) {
            handleMetaChampion(deliberationId, completedDeliberation.ideas[0])
              .catch(err => console.error('Failed to handle meta champion:', err))
          }
        }
      }

      // Resolve predictions for champion
      await resolveChampionPredictions(deliberationId, winnerId)

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

      // Handle META or spawnsDeliberation - spawn new deliberation from champion
      if (deliberation.type === 'META' || deliberation.spawnsDeliberation) {
        const championIdea = advancingIdeas[0]
        handleMetaChampion(deliberationId, championIdea)
          .catch(err => console.error('Failed to handle meta champion:', err))
      }
    }

    // Resolve predictions for champion
    await resolveChampionPredictions(deliberationId, winnerId)
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

    // FINAL SHOWDOWN: If 5 or fewer ideas, ALL participants vote on ALL ideas
    if (shuffledIdeas.length <= 5) {
      // Create cells for all members, all voting on same ideas
      // Allow cells up to 7 members to avoid tiny leftovers
      let remainingMembers = [...shuffledMembers]
      while (remainingMembers.length > 0) {
        const cellSize = remainingMembers.length <= 7 ? remainingMembers.length : CELL_SIZE
        const cellMembers = remainingMembers.slice(0, cellSize)
        remainingMembers = remainingMembers.slice(cellSize)

        if (cellMembers.length === 0) continue

        await prisma.cell.create({
          data: {
            deliberationId,
            tier: nextTier,
            status: 'VOTING',
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
      // Normal case: batch ideas into groups, distribute ALL members across batches
      const numBatches = Math.ceil(shuffledIdeas.length / IDEAS_PER_CELL)
      const baseMembersPerBatch = Math.floor(shuffledMembers.length / numBatches)
      const extraMembers = shuffledMembers.length % numBatches

      let memberIndex = 0
      for (let batch = 0; batch < numBatches; batch++) {
        const batchIdeas = shuffledIdeas.slice(batch * IDEAS_PER_CELL, (batch + 1) * IDEAS_PER_CELL)

        // Even distribution: base + 1 extra for first 'extraMembers' batches
        const batchMemberCount = baseMembersPerBatch + (batch < extraMembers ? 1 : 0)
        const batchMembers = shuffledMembers.slice(memberIndex, memberIndex + batchMemberCount)
        memberIndex += batchMemberCount

        if (batchIdeas.length === 0) continue

        // Create cells for all members in this batch
        let remainingMembers = [...batchMembers]
        while (remainingMembers.length > 0) {
          const cellSize = remainingMembers.length <= 7 ? remainingMembers.length : CELL_SIZE
          const cellMembers = remainingMembers.slice(0, cellSize)
          remainingMembers = remainingMembers.slice(cellSize)

          if (cellMembers.length === 0) continue

          await prisma.cell.create({
            data: {
              deliberationId,
              tier: nextTier,
              status: 'VOTING',
              ideas: {
                create: batchIdeas.map(idea => ({ ideaId: idea.id })),
              },
              participants: {
                create: cellMembers.map(member => ({ userId: member.userId })),
              },
            },
          })
        }
      }
    }

    // Update deliberation with new tier and start timer
    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: {
        currentTier: nextTier,
        currentTierStartedAt: new Date(),
      },
    })

    // Send notification for new tier
    sendPushToDeliberation(
      deliberationId,
      notifications.newTier(nextTier, deliberation.question, deliberationId)
    ).catch(err => console.error('Failed to send push notifications:', err))
  }
}
