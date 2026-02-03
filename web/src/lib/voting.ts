import { prisma } from './prisma'
import { sendPushToDeliberation, notifications } from './push'
import { sendEmailToDeliberation } from './email'
import { updateAgreementScores } from './agreement'

const CELL_SIZE = 5
const IDEAS_PER_CELL = 5
const MAX_CELL_SIZE = 7  // Allow cells up to 7 for flexible sizing

/**
 * Flexible cell sizing algorithm (3-7 participants per cell)
 * Avoids creating tiny cells (1-2 people) that can't have meaningful deliberation
 * Ported from union-chant-engine.js
 */
export function calculateCellSizes(totalParticipants: number): number[] {
  if (totalParticipants < 3) return [totalParticipants] // Edge case: tiny group
  if (totalParticipants === 3) return [3]
  if (totalParticipants === 4) return [4]

  let numCells = Math.floor(totalParticipants / 5)
  let remainder = totalParticipants % 5

  // Perfect division by 5
  if (remainder === 0) return Array(numCells).fill(5)

  // Remainder of 1 or 2: Absorb into larger cell (avoid 1-2 person cells)
  if (remainder === 1 || remainder === 2) {
    if (numCells > 0) {
      numCells--
      remainder += 5
      // remainder is now 6 or 7
      return [...Array(numCells).fill(5), remainder]
    }
  }

  // Remainder of 3 or 4: Create a separate cell
  if (remainder === 3) return [...Array(numCells).fill(5), 3]
  if (remainder === 4) return [...Array(numCells).fill(5), 4]

  return Array(numCells).fill(5)
}

/**
 * Distribute ideas evenly across cells.
 * Earlier cells get one extra idea if there's a remainder.
 */
export function calculateIdeaSizes(totalIdeas: number, totalCells: number): number[] {
  if (totalIdeas <= 0) return []

  const basePerCell = Math.floor(totalIdeas / totalCells)
  let remainder = totalIdeas % totalCells

  const sizes: number[] = []
  for (let i = 0; i < totalCells; i++) {
    if (remainder > 0) {
      sizes.push(basePerCell + 1)
      remainder--
    } else {
      sizes.push(basePerCell)
    }
  }
  return sizes
}

/**
 * Resolve predictions when a cell completes
 * Updates wonImmediate for cell predictions
 */
async function resolveCellPredictions(cellId: string, winnerIds: string[]) {
  // Get all predictions for this cell
  const predictions = await prisma.prediction.findMany({
    where: { cellId },
    include: { user: { select: { id: true, currentStreak: true, bestStreak: true } } },
  })

  if (predictions.length === 0) return

  // Batch all updates in a single transaction to prevent partial stat corruption
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = []
  for (const prediction of predictions) {
    const won = winnerIds.includes(prediction.predictedIdeaId)

    ops.push(
      prisma.prediction.update({
        where: { id: prediction.id },
        data: { wonImmediate: won, resolvedAt: new Date() },
      })
    )

    if (prediction.user) {
      if (won) {
        ops.push(
          prisma.user.update({
            where: { id: prediction.userId },
            data: {
              correctPredictions: { increment: 1 },
              currentStreak: { increment: 1 },
              bestStreak: Math.max(prediction.user.bestStreak, prediction.user.currentStreak + 1),
            },
          })
        )
      } else {
        ops.push(
          prisma.user.update({
            where: { id: prediction.userId },
            data: { currentStreak: 0 },
          })
        )
      }
    }
  }

  await prisma.$transaction(ops)
}

/**
 * Resolve all predictions when a champion is declared
 * Updates ideaBecameChampion and ideaFinalTier for all predictions on that idea
 */
async function resolveChampionPredictions(deliberationId: string, championId: string) {
  const champion = await prisma.idea.findUnique({
    where: { id: championId },
  })

  if (!champion) return

  // Get all ideas to update final tier info
  const allIdeas = await prisma.idea.findMany({
    where: { deliberationId },
  })

  // Get champion predictions for user stat updates
  const championPredictions = await prisma.prediction.findMany({
    where: { deliberationId, predictedIdeaId: championId },
  })

  // Batch all updates in a single transaction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = []

  // Mark champion predictions
  for (const prediction of championPredictions) {
    ops.push(
      prisma.prediction.update({
        where: { id: prediction.id },
        data: { ideaBecameChampion: true, ideaFinalTier: champion.tier },
      })
    )
    ops.push(
      prisma.user.update({
        where: { id: prediction.userId },
        data: { championPicks: { increment: 1 } },
      })
    )
  }

  // Mark non-champion predictions with final tier info
  for (const idea of allIdeas) {
    if (idea.id === championId) continue
    ops.push(
      prisma.prediction.updateMany({
        where: { deliberationId, predictedIdeaId: idea.id },
        data: { ideaBecameChampion: false, ideaFinalTier: idea.tier },
      })
    )
  }

  if (ops.length > 0) {
    await prisma.$transaction(ops)
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
          accumulationEndsAt: deliberation.accumulationEnabled && deliberation.accumulationTimeoutMs
            ? new Date(Date.now() + deliberation.accumulationTimeoutMs)
            : null,
        },
      }),
    ])

    // Resolve predictions for champion
    await resolveChampionPredictions(deliberationId, winningIdea.id)

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

  // Use flexible cell sizing algorithm to determine cell structure
  const cellSizes = calculateCellSizes(shuffledMembers.length)
  const numCells = cellSizes.length

  // Number of cells is determined by PARTICIPANTS (never create unstaffed cells).
  // Ideas flex to fit — some cells may get 6-7 ideas if there are more ideas than
  // ideal, but every idea gets into a cell.
  const actualNumCells = numCells
  const actualCellSizes = cellSizes

  const ideaSizes = calculateIdeaSizes(shuffledIdeas.length, actualNumCells)

  // Build a map of which ideas go into which cell (by index)
  const cellIdeaGroups: typeof shuffledIdeas[] = []
  let ideaIndex = 0
  for (let cellNum = 0; cellNum < actualNumCells; cellNum++) {
    const count = ideaSizes[cellNum] || 0
    cellIdeaGroups.push(shuffledIdeas.slice(ideaIndex, ideaIndex + count))
    ideaIndex += count
  }

  // Build a map of idea authorId -> set of cell indices containing their idea
  const authorToCells = new Map<string, Set<number>>()
  for (const idea of shuffledIdeas) {
    if (!idea.authorId) continue
    if (!authorToCells.has(idea.authorId)) authorToCells.set(idea.authorId, new Set())
  }
  cellIdeaGroups.forEach((group, cellIdx) => {
    for (const idea of group) {
      if (idea.authorId) {
        authorToCells.get(idea.authorId)?.add(cellIdx)
      }
    }
  })

  // Assign members to cells, avoiding cells that contain their own idea when possible.
  // Priority: get every cell to 3 members first (minimum for deliberation),
  // then fill remaining slots in least-full cells.
  const MIN_CELL_MEMBERS = 3
  const cellMemberGroups: typeof shuffledMembers[] = Array.from({ length: actualNumCells }, () => [])
  const cellCapacities = [...actualCellSizes]

  for (const member of shuffledMembers) {
    const conflictCells = authorToCells.get(member.userId)

    // Find best cell: prefer cells below minimum first, then least-full
    let bestCell = -1
    let bestFill = Infinity
    let bestBelowMin = false

    for (let c = 0; c < actualNumCells; c++) {
      if (cellMemberGroups[c].length >= cellCapacities[c]) continue
      if (cellIdeaGroups[c].length === 0) continue
      if (conflictCells && conflictCells.has(c)) continue

      const fill = cellMemberGroups[c].length
      const belowMin = fill < MIN_CELL_MEMBERS

      // Cells below minimum always beat cells at/above minimum
      if (belowMin && !bestBelowMin) {
        bestCell = c
        bestFill = fill
        bestBelowMin = true
      } else if (belowMin === bestBelowMin && fill < bestFill) {
        bestCell = c
        bestFill = fill
      }
    }

    // Fallback: accept conflict, same priority logic
    if (bestCell === -1) {
      bestFill = Infinity
      bestBelowMin = false
      for (let c = 0; c < actualNumCells; c++) {
        if (cellMemberGroups[c].length >= cellCapacities[c]) continue
        if (cellIdeaGroups[c].length === 0) continue

        const fill = cellMemberGroups[c].length
        const belowMin = fill < MIN_CELL_MEMBERS

        if (belowMin && !bestBelowMin) {
          bestCell = c
          bestFill = fill
          bestBelowMin = true
        } else if (belowMin === bestBelowMin && fill < bestFill) {
          bestCell = c
          bestFill = fill
        }
      }
    }

    if (bestCell !== -1) {
      cellMemberGroups[bestCell].push(member)
    }
  }

  // Create cells
  const cells: Awaited<ReturnType<typeof prisma.cell.create>>[] = []

  for (let cellNum = 0; cellNum < actualNumCells; cellNum++) {
    const cellIdeas = cellIdeaGroups[cellNum]
    const cellMembers = cellMemberGroups[cellNum]

    // Skip if no ideas or no members
    if (cellIdeas.length === 0 || cellMembers.length === 0) continue

    // Update idea statuses for this cell
    await prisma.idea.updateMany({
      where: { id: { in: cellIdeas.map((i: { id: string }) => i.id) } },
      data: { status: 'IN_VOTING', tier: 1 },
    })

    // Determine initial cell status: DELIBERATING if discussion enabled, else VOTING
    const hasDiscussion = deliberation.discussionDurationMs !== null && deliberation.discussionDurationMs !== 0
    const cellStatus = hasDiscussion ? 'DELIBERATING' as const : 'VOTING' as const
    const discussionEndsAt = hasDiscussion && deliberation.discussionDurationMs! > 0
      ? new Date(Date.now() + deliberation.discussionDurationMs!)
      : null // -1 = manual advance, no deadline

    // Create the cell with UNIQUE ideas
    const cell = await prisma.cell.create({
      data: {
        deliberationId,
        tier: 1,
        status: cellStatus,
        discussionEndsAt,
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

  // Send email notifications to all members
  sendEmailToDeliberation(deliberationId, 'cell_ready', { tier: 1 })
    .catch(err => console.error('Failed to send email notifications:', err))

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
  // If timeout with zero votes, complete the cell (don't extend indefinitely)
  if (isTimeout) {
    const voteCount = await prisma.vote.count({ where: { cellId } })
    if (voteCount === 0) {
      console.log(`Cell ${cellId}: zero votes on timeout, completing cell as timeout`)
      // Fall through to normal completion — cell completes with no winner
    }
  }

  // ATOMIC GUARD: Claim this cell for processing using atomic updateMany.
  // Only one concurrent caller can succeed — others get count=0 and bail out.
  const claimed = await prisma.cell.updateMany({
    where: { id: cellId, status: { not: 'COMPLETED' } },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedByTimeout: isTimeout,
      secondVotesEnabled: true,
    },
  })

  if (claimed.count === 0) {
    console.log(`Cell ${cellId} already completed, skipping processCellResults`)
    return null
  }

  // Now fetch the cell data for processing (status is already COMPLETED)
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
  const isFinalShowdown = cellIdeaIds.length <= 5 && cellIdeaIds.length > 0 &&
    allCellsInTier.every(c => {
      const otherIdeaIds = c.ideas.map((ci: { ideaId: string }) => ci.ideaId).sort()
      return otherIdeaIds.length === cellIdeaIds.length &&
             otherIdeaIds.every((id: string, i: number) => id === cellIdeaIds[i])
    })

  console.log(`Processing cell ${cellId}: tier ${cell.tier}, ${cellIdeaIds.length} ideas, ${allCellsInTier.length} cells in tier, isFinalShowdown: ${isFinalShowdown}`)

  let winnerIds: string[] = []
  let loserIds: string[] = []

  // In final showdown, don't mark individual winners/losers - wait for cross-cell tally
  if (!isFinalShowdown) {
    // Sum XP points per idea
    const xpTotals: Record<string, number> = {}
    cell.votes.forEach((vote: { ideaId: string; xpPoints: number }) => {
      xpTotals[vote.ideaId] = (xpTotals[vote.ideaId] || 0) + vote.xpPoints
    })

    // Find winner(s) — ideas with most XP
    const maxXP = Math.max(...Object.values(xpTotals), 0)

    if (maxXP === 0) {
      // No votes cast — all ideas advance
      winnerIds = cell.ideas.map((ci: { ideaId: string }) => ci.ideaId)
    } else {
      winnerIds = Object.entries(xpTotals)
        .filter(([, total]) => total === maxXP)
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

  // Cell already marked COMPLETED by atomic guard above.
  // Update agreement scores (fire-and-forget)
  updateAgreementScores(cellId).catch(err =>
    console.error('Agreement score update failed:', err)
  )

  // Check if all cells in this tier are complete
  await checkTierCompletion(cell.deliberationId, cell.tier)

  return { winnerIds, loserIds }
}

/**
 * Promote top comments when a tier completes and ideas advance.
 * - Idea-linked: top 1 comment per advancing idea (ties allowed), min 1 upvote
 * - Unlinked: top 1 comment per completed cell (ties allowed), min 1 upvote
 */
async function promoteTopComments(deliberationId: string, completedTier: number, advancingIdeaIds: string[]) {
  const nextTier = completedTier + 1

  // Idea-linked comments: promote top 1 per idea (ties allowed)
  // Query by reachTier (not origin cell tier) so previously-promoted comments can climb further
  for (const ideaId of advancingIdeaIds) {
    const topComments = await prisma.comment.findMany({
      where: {
        ideaId,
        cell: { deliberationId },
        upvoteCount: { gte: 1 },
        reachTier: completedTier,
      },
      orderBy: { upvoteCount: 'desc' },
      take: 2,
    })

    if (topComments.length === 0) continue

    // Always promote the top comment; promote second only if tied
    const toPromote = topComments.length === 2 && topComments[0].upvoteCount === topComments[1].upvoteCount
      ? [topComments[0].id, topComments[1].id]
      : [topComments[0].id]

    await prisma.comment.updateMany({
      where: { id: { in: toPromote } },
      data: { reachTier: nextTier },
    })
  }

  // Unlinked comments: top 1 per completed cell (ties allowed)
  // Also query by reachTier so previously-promoted unlinked comments can climb
  const completedCells = await prisma.cell.findMany({
    where: { deliberationId, tier: completedTier, status: 'COMPLETED' },
    select: { id: true },
  })

  for (const cell of completedCells) {
    const topComments = await prisma.comment.findMany({
      where: {
        cellId: cell.id,
        ideaId: null,
        upvoteCount: { gte: 1 },
        reachTier: completedTier,
      },
      orderBy: { upvoteCount: 'desc' },
      take: 2,
    })

    if (topComments.length === 0) continue

    const toPromote = topComments.length === 2 && topComments[0].upvoteCount === topComments[1].upvoteCount
      ? [topComments[0].id, topComments[1].id]
      : [topComments[0].id]

    await prisma.comment.updateMany({
      where: { id: { in: toPromote } },
      data: { reachTier: nextTier },
    })
  }

  console.log(`promoteTopComments: promoted comments for ${advancingIdeaIds.length} ideas from tier ${completedTier}→${nextTier}`)
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

  // IDEMPOTENCY: Check if this tier has already been processed by another caller.
  // Without this, concurrent calls that both see allComplete=true would both
  // create next-tier cells, doubling everything.
  const currentDeliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    select: { currentTier: true, phase: true },
  })

  if (!currentDeliberation) return

  // If deliberation already advanced past this tier, or is no longer in VOTING, bail out.
  if (
    currentDeliberation.currentTier > tier ||
    currentDeliberation.phase === 'COMPLETED' ||
    currentDeliberation.phase === 'ACCUMULATING'
  ) {
    console.log(`checkTierCompletion: deliberation ${deliberationId} already past tier ${tier} (currentTier=${currentDeliberation.currentTier}, phase=${currentDeliberation.phase}), skipping`)
    return
  }

  // Also check if next-tier cells already exist (belt-and-suspenders)
  const nextTierCellCount = await prisma.cell.count({
    where: { deliberationId, tier: tier + 1 },
  })

  if (nextTierCellCount > 0) {
    console.log(`checkTierCompletion: next tier cells already exist for deliberation ${deliberationId} tier ${tier + 1} (${nextTierCellCount} cells), skipping`)
    return
  }

  // Check if this is a final showdown (all cells have same ideas, ≤4 ideas)
  const firstCellIdeaIds = cells[0]?.ideas.map((ci: { ideaId: string }) => ci.ideaId).sort() || []
  const allCellsHaveSameIdeas = cells.every(cell => {
    const cellIdeaIds = cell.ideas.map((ci: { ideaId: string }) => ci.ideaId).sort()
    return cellIdeaIds.length === firstCellIdeaIds.length &&
           cellIdeaIds.every((id: string, i: number) => id === firstCellIdeaIds[i])
  })

  // FINAL SHOWDOWN: Cross-cell tallying when all cells vote on same ≤5 ideas
  if (allCellsHaveSameIdeas && firstCellIdeaIds.length <= 5 && firstCellIdeaIds.length > 0) {
    // Sum XP points across ALL cells
    const crossCellTally: Record<string, number> = {}
    for (const cell of cells) {
      for (const vote of cell.votes) {
        crossCellTally[vote.ideaId] = (crossCellTally[vote.ideaId] || 0) + (vote as { xpPoints: number }).xpPoints
      }
    }

    // Find the winner (most total XP)
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
        const accumulationEndsAt = deliberation.accumulationTimeoutMs
          ? new Date(Date.now() + deliberation.accumulationTimeoutMs)
          : null
        // Atomic: only transition if still in VOTING phase
        const updated = await prisma.deliberation.updateMany({
          where: { id: deliberationId, phase: 'VOTING' },
          data: {
            phase: 'ACCUMULATING',
            championId: winnerId,
            accumulationEndsAt,
            championEnteredTier: Math.max(2, tier),
          },
        })

        if (updated.count > 0) {
          sendPushToDeliberation(
            deliberationId,
            notifications.accumulationStarted(deliberation.question, deliberationId)
          ).catch(err => console.error('Failed to send push notifications:', err))
        }
      } else {
        // Atomic: only complete if still in VOTING phase
        const updated = await prisma.deliberation.updateMany({
          where: { id: deliberationId, phase: 'VOTING' },
          data: {
            phase: 'COMPLETED',
            championId: winnerId,
            completedAt: new Date(),
          },
        })

        if (updated.count > 0) {
          const completedDeliberation = await prisma.deliberation.findUnique({
            where: { id: deliberationId },
            include: { ideas: { where: { id: winnerId } } }
          })
          if (completedDeliberation) {
            sendPushToDeliberation(
              deliberationId,
              notifications.championDeclared(completedDeliberation.question, deliberationId)
            ).catch(err => console.error('Failed to send push notifications:', err))

            // Email: champion declared
            sendEmailToDeliberation(deliberationId, 'champion_declared', {
              championText: completedDeliberation.ideas[0]?.text || 'Unknown',
            }).catch(err => console.error('Failed to send champion email:', err))

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
      // Atomic: only transition if still in VOTING phase
      const accumulationEndsAt = deliberation.accumulationTimeoutMs
        ? new Date(Date.now() + deliberation.accumulationTimeoutMs)
        : null

      const updated = await prisma.deliberation.updateMany({
        where: { id: deliberationId, phase: 'VOTING' },
        data: {
          phase: 'ACCUMULATING',
          championId: winnerId,
          accumulationEndsAt,
          championEnteredTier: Math.max(2, tier),
        },
      })

      if (updated.count > 0) {
        sendPushToDeliberation(
          deliberationId,
          notifications.accumulationStarted(deliberation.question, deliberationId)
        ).catch(err => console.error('Failed to send push notifications:', err))
      }
    } else {
      // Atomic: only complete if still in VOTING phase
      const updated = await prisma.deliberation.updateMany({
        where: { id: deliberationId, phase: 'VOTING' },
        data: {
          phase: 'COMPLETED',
          championId: winnerId,
          completedAt: new Date(),
        },
      })

      if (updated.count > 0) {
        sendPushToDeliberation(
          deliberationId,
          notifications.championDeclared(deliberation.question, deliberationId)
        ).catch(err => console.error('Failed to send push notifications:', err))

        // Email: champion declared
        sendEmailToDeliberation(deliberationId, 'champion_declared', {
          championText: advancingIdeas[0]?.text || 'Unknown',
        }).catch(err => console.error('Failed to send champion email:', err))

      }
    }

    // Resolve predictions for champion
    await resolveChampionPredictions(deliberationId, winnerId)
  } else {
    // Need another tier - create new cells with advancing ideas
    const nextTier = tier + 1

    // ATOMIC CLAIM: Only one caller can advance the tier.
    // Move this BEFORE cell creation so a second concurrent caller
    // cannot also start creating cells.
    const tierAdvanced = await prisma.deliberation.updateMany({
      where: { id: deliberationId, currentTier: tier },
      data: {
        currentTier: nextTier,
        currentTierStartedAt: new Date(),
      },
    })

    if (tierAdvanced.count === 0) {
      console.log(`checkTierCompletion: failed to claim tier advancement for ${deliberationId} tier ${tier}→${nextTier}, another caller won`)
      return
    }

    // Double-check: if cells already exist for next tier despite winning the claim,
    // something went wrong (e.g., server restart during cell creation). Bail out.
    const existingNextTierCells = await prisma.cell.count({
      where: { deliberationId, tier: nextTier },
    })
    if (existingNextTierCells > 0) {
      console.log(`checkTierCompletion: WARNING - won tier claim but ${existingNextTierCells} cells already exist for tier ${nextTier}, skipping cell creation`)
      return
    }

    console.log(`checkTierCompletion: claimed tier advancement ${tier}→${nextTier} for ${deliberationId}`)

    const shuffledIdeas = [...advancingIdeas].sort(() => Math.random() - 0.5)
    const shuffledMembers = [...deliberation.members].sort(() => Math.random() - 0.5)

    const IDEAS_PER_CELL = 5
    const CELL_SIZE = 5

    // Reset advancing ideas status
    await prisma.idea.updateMany({
      where: { id: { in: advancingIdeas.map((i: { id: string }) => i.id) } },
      data: { status: 'IN_VOTING', tier: nextTier },
    })

    // Promote top comments from completed tier to next tier
    await promoteTopComments(deliberationId, tier, advancingIdeas.map(i => i.id))

    // Determine cell status for next tier: DELIBERATING if discussion enabled
    const hasNextTierDiscussion = deliberation.discussionDurationMs !== null && deliberation.discussionDurationMs !== 0
    const nextTierCellStatus = hasNextTierDiscussion ? 'DELIBERATING' as const : 'VOTING' as const
    const nextTierDiscussionEndsAt = hasNextTierDiscussion && deliberation.discussionDurationMs! > 0
      ? new Date(Date.now() + deliberation.discussionDurationMs!)
      : null

    // FINAL SHOWDOWN: If 5 or fewer ideas, ALL participants vote on ALL ideas
    // Multiple cells for up-pollination of comments between cells
    console.log(`Creating tier ${nextTier}: ${shuffledIdeas.length} ideas, ${shuffledMembers.length} members, final showdown: ${shuffledIdeas.length <= 5}`)
    if (shuffledIdeas.length <= 5) {
      // Create cells for all members, all voting on same ideas
      // Each participant only in ONE cell (no duplicates)
      let remainingMembers = [...shuffledMembers]
      while (remainingMembers.length > 0) {
        const cellSize = remainingMembers.length <= MAX_CELL_SIZE ? remainingMembers.length : CELL_SIZE
        const cellMembers = remainingMembers.slice(0, cellSize)
        remainingMembers = remainingMembers.slice(cellSize)

        if (cellMembers.length === 0) continue

        await prisma.cell.create({
          data: {
            deliberationId,
            tier: nextTier,
            batch: 0, // All cells vote on same ideas in final showdown
            status: nextTierCellStatus,
            discussionEndsAt: nextTierDiscussionEndsAt,
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
      // Normal case: batch ideas into groups, distribute ALL members across batches.
      // Use floor division so remainder ideas absorb into existing batches
      // rather than creating a tiny batch. Fewer batches with more ideas = better deliberation.
      // e.g., 11 ideas → 2 batches of 6,5 instead of 3 batches of 5,5,1
      const numBatches = Math.max(1, Math.round(shuffledIdeas.length / IDEAS_PER_CELL))
      const baseIdeasPerBatch = Math.floor(shuffledIdeas.length / numBatches)
      const extraIdeas = shuffledIdeas.length % numBatches
      const baseMembersPerBatch = Math.floor(shuffledMembers.length / numBatches)
      const extraMembers = shuffledMembers.length % numBatches

      let memberIndex = 0
      let ideaIndex = 0
      for (let batch = 0; batch < numBatches; batch++) {
        // Distribute ideas evenly: earlier batches get one extra
        const batchIdeaCount = baseIdeasPerBatch + (batch < extraIdeas ? 1 : 0)
        const batchIdeas = shuffledIdeas.slice(ideaIndex, ideaIndex + batchIdeaCount)
        ideaIndex += batchIdeaCount

        // Even distribution: base + 1 extra for first 'extraMembers' batches
        const batchMemberCount = baseMembersPerBatch + (batch < extraMembers ? 1 : 0)
        const batchMembers = shuffledMembers.slice(memberIndex, memberIndex + batchMemberCount)
        memberIndex += batchMemberCount

        if (batchIdeas.length === 0) continue

        // Create cells for all members in this batch.
        // Reuse calculateCellSizes to get proper 3-7 sizing with no tiny cells.
        const cellSizesForBatch = calculateCellSizes(batchMembers.length)

        let memberOffset = 0
        for (let c = 0; c < cellSizesForBatch.length; c++) {
          const cellSize = cellSizesForBatch[c]
          if (cellSize === 0) continue

          const cellMembers = batchMembers.slice(memberOffset, memberOffset + cellSize)
          memberOffset += cellSize

          await prisma.cell.create({
            data: {
              deliberationId,
              tier: nextTier,
              batch, // Track which batch of ideas this cell votes on
              status: nextTierCellStatus,
              discussionEndsAt: nextTierDiscussionEndsAt,
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

    // Send notification for new tier (tier was already advanced above)
    sendPushToDeliberation(
      deliberationId,
      notifications.newTier(nextTier, deliberation.question, deliberationId)
    ).catch(err => console.error('Failed to send push notifications:', err))

    // Email: new tier started
    sendEmailToDeliberation(deliberationId, 'new_tier', { tier: nextTier })
      .catch(err => console.error('Failed to send new tier email:', err))
  }
}

/**
 * Add a late joiner to an existing cell in the current voting tier
 * Finds the smallest cell (that hasn't exceeded MAX_CELL_SIZE) and adds them
 * This allows everyone to participate even after voting has started
 */
export async function addLateJoinerToCell(deliberationId: string, userId: string) {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
  })

  if (!deliberation || deliberation.phase !== 'VOTING') {
    return { success: false, reason: 'NOT_IN_VOTING_PHASE' }
  }

  // Check if user is already in a cell for current tier
  const existingParticipation = await prisma.cellParticipation.findFirst({
    where: {
      userId,
      cell: {
        deliberationId,
        tier: deliberation.currentTier,
      },
    },
  })

  if (existingParticipation) {
    return { success: false, reason: 'ALREADY_IN_CELL', cellId: existingParticipation.cellId }
  }

  // Find all active cells in current tier with batch info
  const cells = await prisma.cell.findMany({
    where: {
      deliberationId,
      tier: deliberation.currentTier,
      status: 'VOTING',
    },
    include: {
      _count: { select: { participants: true } },
    },
  })

  if (cells.length === 0) {
    return { success: false, reason: 'NO_ACTIVE_CELLS' }
  }

  // Group cells by batch and find the batch with fewest total participants
  // This ensures late joiners are distributed across batches round-robin
  const batchMap = new Map<number, typeof cells>()
  for (const cell of cells) {
    const b = cell.batch ?? 0
    if (!batchMap.has(b)) batchMap.set(b, [])
    batchMap.get(b)!.push(cell)
  }

  // Sort batches by total participant count (ascending) — least populated first
  const batchEntries = [...batchMap.entries()].sort((a, b) => {
    const totalA = a[1].reduce((sum, c) => sum + c._count.participants, 0)
    const totalB = b[1].reduce((sum, c) => sum + c._count.participants, 0)
    return totalA - totalB
  })

  // Within the least populated batch, find the smallest cell under MAX_CELL_SIZE
  let targetCell: typeof cells[0] | null = null
  for (const [, batchCells] of batchEntries) {
    // Sort cells by participant count ascending
    batchCells.sort((a, b) => a._count.participants - b._count.participants)
    const candidate = batchCells.find(c => c._count.participants < MAX_CELL_SIZE)
    if (candidate) {
      targetCell = candidate
      break
    }
  }

  if (!targetCell) {
    // All cells at max size — pick the globally smallest cell
    cells.sort((a, b) => a._count.participants - b._count.participants)
    targetCell = cells[0]

    await prisma.cellParticipation.create({
      data: { cellId: targetCell.id, userId },
    })

    return {
      success: true,
      cellId: targetCell.id,
      note: 'Added to full cell (overflow)'
    }
  }

  await prisma.cellParticipation.create({
    data: { cellId: targetCell.id, userId },
  })

  return { success: true, cellId: targetCell.id }
}
