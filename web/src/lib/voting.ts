import { prisma } from './prisma'
import { sendPushToDeliberation, notifications } from './push'
import { sendEmailToDeliberation } from './email'
import { updateAgreementScores } from './agreement'
import { fireWebhookEvent } from './webhooks'

const DEFAULT_CELL_SIZE = 5
const IDEAS_PER_CELL = 5
const MAX_CELL_SIZE = 7  // Allow cells up to 7 for flexible sizing

/**
 * Flexible cell sizing algorithm (3-7 participants per cell)
 * Avoids creating tiny cells (1-2 people) that can't have meaningful deliberation
 * Ported from union-chant-engine.js
 */
export function calculateCellSizes(totalParticipants: number, targetSize: number = DEFAULT_CELL_SIZE): number[] {
  if (totalParticipants < 3) return [totalParticipants] // Edge case: tiny group
  if (totalParticipants <= targetSize) return [totalParticipants]

  let numCells = Math.floor(totalParticipants / targetSize)
  let remainder = totalParticipants % targetSize

  // Perfect division
  if (remainder === 0) return Array(numCells).fill(targetSize)

  // Remainder of 1 or 2: Absorb into larger cell (avoid 1-2 person cells)
  if (remainder === 1 || remainder === 2) {
    if (numCells > 0) {
      numCells--
      remainder += targetSize
      return [...Array(numCells).fill(targetSize), remainder]
    }
  }

  // Remainder of 3+: Create a separate cell
  return [...Array(numCells).fill(targetSize), remainder]
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
export async function resolveChampionPredictions(deliberationId: string, championId: string) {
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
      ideas: { where: { status: { in: ['SUBMITTED', 'IN_VOTING', 'PENDING'] } } },
      members: { where: { role: { in: ['CREATOR', 'PARTICIPANT'] } } },
    },
  })

  if (!deliberation) {
    throw new Error('Deliberation not found')
  }

  if (deliberation.phase !== 'SUBMISSION') {
    throw new Error('Deliberation is not in submission phase')
  }

  // Edge case: No ideas submitted — do NOT auto-complete, just return error
  if (deliberation.ideas.length === 0) {
    return {
      success: false,
      reason: 'NO_IDEAS',
      message: 'No ideas were submitted. The chant remains in submission phase.'
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

    fireWebhookEvent('winner_declared', {
      deliberationId, winnerId: winningIdea.id, winnerText: winningIdea.text, totalTiers: 0,
    })

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

  // ── FCFS mode: create cells with ideas only, no pre-assigned participants ──
  // Continuous flow REQUIRES FCFS — cells form from ideas, participants join later
  if (deliberation.allocationMode === 'fcfs' || deliberation.continuousFlow) {
    return startVotingPhaseFCFS(deliberationId, deliberation)
  }

  // Check if this is a resume (existing cells from a previous voting round)
  const existingActiveCells = await prisma.cell.findMany({
    where: {
      deliberationId,
      status: { in: ['VOTING', 'DELIBERATING'] },
    },
    include: {
      participants: { select: { userId: true } },
    },
  })
  const isResume = existingActiveCells.length > 0
  const membersInActiveCells = new Set(
    existingActiveCells.flatMap(c => c.participants.map(p => p.userId))
  )

  // Create cells for Tier 1 - each cell gets UNIQUE ideas (no sharing)
  const ideas = deliberation.ideas
  // When resuming, exclude members who are already in active cells
  const members = isResume
    ? deliberation.members.filter(m => !membersInActiveCells.has(m.userId))
    : deliberation.members

  // Shuffle ideas and members for random assignment
  const shuffledIdeas = [...ideas].sort(() => Math.random() - 0.5)
  const shuffledMembers = [...members].sort(() => Math.random() - 0.5)

  // Use flexible cell sizing algorithm to determine cell structure
  const cellSizes = calculateCellSizes(shuffledMembers.length, deliberation.cellSize || DEFAULT_CELL_SIZE)
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
  // When resuming, preserve the current tier (new ideas enter at tier 1 alongside)
  await prisma.deliberation.update({
    where: { id: deliberationId },
    data: {
      phase: 'VOTING',
      ...(!isResume && { currentTier: 1 }),
      currentTierStartedAt: new Date(),
    },
  })

  // In-app notifications for all members
  const memberIds = deliberation.members.map(m => m.userId)
  if (memberIds.length > 0) {
    prisma.notification.createMany({
      data: memberIds.map(userId => ({
        userId,
        type: 'VOTE_NEEDED' as const,
        title: 'Voting is open',
        body: deliberation.question.length > 80 ? deliberation.question.slice(0, 80) + '...' : deliberation.question,
        deliberationId,
      })),
    }).catch(err => console.error('Failed to create voting notifications:', err))
  }

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
    reason: isResume ? 'VOTING_RESUMED' : 'VOTING_STARTED',
    message: isResume ? `Voting resumed with ${cells.length} new cells` : 'Voting started',
    cellsCreated: cells.length,
    tier: 1
  }
}

/**
 * FCFS voting start: create cells with ideas distributed but NO participants.
 * Users join cells first-come-first-serve via the enter endpoint.
 * Cell completes when it reaches FCFS_CELL_SIZE voters.
 */
const FCFS_CELL_SIZE = 5 // Default; overridden by deliberation.cellSize when available

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function startVotingPhaseFCFS(deliberationId: string, deliberation: any) {
  const ideas = deliberation.ideas
  const cellSize = deliberation.cellSize || IDEAS_PER_CELL

  // Shuffle ideas for fairness
  const shuffledIdeas = [...ideas].sort(() => Math.random() - 0.5)

  // In continuous flow, only create FULL cells (leftover ideas wait for more)
  // In non-continuous, split evenly across cells (all ideas must be assigned)
  const cellIdeaGroups: typeof shuffledIdeas[] = []
  if (deliberation.continuousFlow) {
    // Full cells only — leftovers stay unassigned for tryCreateContinuousFlowCell
    const numFullCells = Math.floor(shuffledIdeas.length / cellSize)
    for (let i = 0; i < numFullCells; i++) {
      cellIdeaGroups.push(shuffledIdeas.slice(i * cellSize, (i + 1) * cellSize))
    }
  } else {
    // Non-continuous: distribute all ideas evenly
    const numCells = Math.max(1, Math.ceil(shuffledIdeas.length / cellSize))
    const ideaSizes = calculateIdeaSizes(shuffledIdeas.length, numCells)
    let ideaIndex = 0
    for (let cellNum = 0; cellNum < numCells; cellNum++) {
      const count = ideaSizes[cellNum] || 0
      cellIdeaGroups.push(shuffledIdeas.slice(ideaIndex, ideaIndex + count))
      ideaIndex += count
    }
  }

  // Create cells with ideas but NO participants
  const cells: Awaited<ReturnType<typeof prisma.cell.create>>[] = []

  for (let cellNum = 0; cellNum < cellIdeaGroups.length; cellNum++) {
    const cellIdeas = cellIdeaGroups[cellNum]
    if (cellIdeas.length === 0) continue

    await prisma.idea.updateMany({
      where: { id: { in: cellIdeas.map((i: { id: string }) => i.id) } },
      data: { status: 'IN_VOTING', tier: 1 },
    })

    const cell = await prisma.cell.create({
      data: {
        deliberationId,
        tier: 1,
        status: 'VOTING',
        ideas: {
          create: cellIdeas.map(idea => ({ ideaId: idea.id })),
        },
        // NO participants — they join via enter endpoint
      },
    })

    cells.push(cell)
  }

  // Update deliberation phase
  await prisma.deliberation.update({
    where: { id: deliberationId },
    data: {
      phase: 'VOTING',
      currentTier: 1,
      currentTierStartedAt: new Date(),
    },
  })

  // Notifications
  const memberIds = deliberation.members.map((m: { userId: string }) => m.userId)
  if (memberIds.length > 0) {
    prisma.notification.createMany({
      data: memberIds.map((userId: string) => ({
        userId,
        type: 'VOTE_NEEDED' as const,
        title: 'Voting is open — join a cell to vote',
        body: deliberation.question.length > 80 ? deliberation.question.slice(0, 80) + '...' : deliberation.question,
        deliberationId,
      })),
    }).catch(err => console.error('Failed to create FCFS voting notifications:', err))
  }

  sendPushToDeliberation(
    deliberationId,
    notifications.votingStarted(deliberation.question, deliberationId)
  ).catch(err => console.error('Failed to send push notifications:', err))

  sendEmailToDeliberation(deliberationId, 'cell_ready', { tier: 1 })
    .catch(err => console.error('Failed to send email notifications:', err))

  return {
    success: true,
    reason: 'VOTING_STARTED_FCFS',
    message: `Voting started (FCFS mode) — ${cells.length} cells open for voters`,
    cellsCreated: cells.length,
    tier: 1,
  }
}

/**
 * Process cell results and handle tier completion
 */
export async function processCellResults(cellId: string, isTimeout = false) {
  // If timeout with zero votes, extend once then force-complete
  if (isTimeout) {
    const voteCount = await prisma.vote.count({ where: { cellId } })
    if (voteCount === 0) {
      const cell = await prisma.cell.findUnique({
        where: { id: cellId },
        select: {
          completedByTimeout: true,
          deliberation: { select: { votingTimeoutMs: true } },
        },
      })
      // If cell hasn't been extended yet, give it one more timeout period
      // completedByTimeout is repurposed here as "already extended once" flag
      if (!cell?.completedByTimeout) {
        const timeoutMs = cell?.deliberation?.votingTimeoutMs
        const newDeadline = timeoutMs ? new Date(Date.now() + timeoutMs) : null
        await prisma.cell.update({
          where: { id: cellId },
          data: { votingDeadline: newDeadline, completedByTimeout: true },
        })
        console.log(`Cell ${cellId}: zero votes on timeout, extending deadline once to ${newDeadline?.toISOString() ?? 'null'}`)
        return null
      }
      // Already extended once — force complete (all ideas advance as tie)
      console.log(`Cell ${cellId}: zero votes after extension, force-completing — all ideas advance`)
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

  // Check if this cell is part of a batch (other cells in this tier share the same ideas).
  // Batch cells defer winner/loser resolution to checkTierCompletion's cross-cell XP tally.
  // This covers both final showdown (all cells same ideas) and multi-batch tiers.
  const allCellsInTier = await prisma.cell.findMany({
    where: { deliberationId: cell.deliberationId, tier: cell.tier },
    include: { ideas: true },
  })

  const cellIdeaIds = cell.ideas.map((ci: { ideaId: string }) => ci.ideaId).sort()
  const isBatchCell = allCellsInTier.some(c => {
    if (c.id === cellId) return false
    const otherIdeaIds = c.ideas.map((ci: { ideaId: string }) => ci.ideaId).sort()
    return otherIdeaIds.length === cellIdeaIds.length &&
           otherIdeaIds.every((id: string, i: number) => id === cellIdeaIds[i])
  })

  console.log(`Processing cell ${cellId}: tier ${cell.tier}, ${cellIdeaIds.length} ideas, ${allCellsInTier.length} cells in tier, isBatchCell: ${isBatchCell}`)

  let winnerIds: string[] = []
  let loserIds: string[] = []

  if (!isBatchCell) {
    // ── Single-cell batch: resolve winner/loser from this cell's votes ──
    const cellVotes = await prisma.$queryRaw<{ ideaId: string; xpPoints: number }[]>`
      SELECT "ideaId", "xpPoints" FROM "Vote" WHERE "cellId" = ${cellId}
    `
    const xpTotals: Record<string, number> = {}
    cellVotes.forEach(vote => {
      xpTotals[vote.ideaId] = (xpTotals[vote.ideaId] || 0) + vote.xpPoints
    })

    const voterResult = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(DISTINCT "userId") as cnt FROM "Vote" WHERE "cellId" = ${cellId}
    `
    const numVoters = Number(voterResult[0]?.cnt || 0)
    const minXPToAdvance = numVoters <= 1 ? 4 : 0
    const maxXP = Math.max(...Object.values(xpTotals), 0)

    if (maxXP === 0) {
      winnerIds = cell.ideas.map((ci: { ideaId: string }) => ci.ideaId)
    } else {
      const qualifiedIdeas = Object.entries(xpTotals).filter(([, total]) => total >= minXPToAdvance)

      if (qualifiedIdeas.length === 0) {
        winnerIds = cell.ideas.map((ci: { ideaId: string }) => ci.ideaId)
        console.log(`Cell ${cellId}: No ideas met ${minXPToAdvance} XP threshold with ${numVoters} voter(s), all advance`)
      } else {
        const qualifiedMax = Math.max(...qualifiedIdeas.map(([, t]) => t))
        winnerIds = qualifiedIdeas
          .filter(([, total]) => total === qualifiedMax)
          .map(([id]) => id)
      }

      loserIds = cell.ideas
        .map((ci: { ideaId: string }) => ci.ideaId)
        .filter((id: string) => !winnerIds.includes(id))
    }

    await prisma.idea.updateMany({
      where: { id: { in: winnerIds } },
      data: { status: 'ADVANCING', tier: cell.tier },
    })

    if (loserIds.length > 0) {
      await prisma.idea.updateMany({
        where: { id: { in: loserIds } },
        data: { status: 'ELIMINATED', losses: { increment: 1 } },
      })
    }

    await resolveCellPredictions(cellId, winnerIds)
  } else {
    // ── Multi-cell batch: check if ALL cells in this batch are complete ──
    // If so, run cross-cell XP tally to determine the batch winner.
    // This resolves per-batch instead of waiting for the entire tier.
    const batchNum = cell.batch ?? 0
    const batchCells = allCellsInTier.filter(c => (c.batch ?? 0) === batchNum)
    const allBatchComplete = batchCells.every(c => c.status === 'COMPLETED')

    if (allBatchComplete && batchCells.length > 1) {
      const batchIdeaIds = cell.ideas.map((ci: { ideaId: string }) => ci.ideaId)

      // Only resolve if ideas are still unresolved (idempotency)
      const unresolvedCount = await prisma.idea.count({
        where: { id: { in: batchIdeaIds }, status: 'IN_VOTING' },
      })

      if (unresolvedCount > 0) {
        const batchCellIds = batchCells.map(c => c.id)
        const batchVotes = await prisma.$queryRaw<{ ideaId: string; xpPoints: number }[]>`
          SELECT "ideaId", "xpPoints" FROM "Vote" WHERE "cellId" = ANY(${batchCellIds})
        `
        const tally: Record<string, number> = {}
        for (const vote of batchVotes) {
          tally[vote.ideaId] = (tally[vote.ideaId] || 0) + vote.xpPoints
        }

        const sorted = Object.entries(tally).sort(([, a], [, b]) => b - a)
        const batchWinnerId = sorted.length > 0
          ? sorted[0][0]
          : batchIdeaIds[Math.floor(Math.random() * batchIdeaIds.length)]

        if (batchWinnerId) {
          winnerIds = [batchWinnerId]
          loserIds = batchIdeaIds.filter((id: string) => id !== batchWinnerId)

          await prisma.idea.updateMany({
            where: { id: { in: winnerIds } },
            data: { status: 'ADVANCING', tier: cell.tier },
          })

          if (loserIds.length > 0) {
            await prisma.idea.updateMany({
              where: { id: { in: loserIds } },
              data: { status: 'ELIMINATED', losses: { increment: 1 } },
            })
          }

          // Resolve predictions for all cells in the batch
          for (const bc of batchCells) {
            await resolveCellPredictions(bc.id, winnerIds)
          }

          console.log(`processCellResults: batch ${batchNum} cross-cell tally — winner: ${batchWinnerId} (${tally[batchWinnerId] || 0} XP), ${batchCells.length} cells`)
        }
      }
    }
    // If not all batch cells complete yet, winnerIds stays empty — that's fine,
    // the tier handler will be called but won't advance yet.
  }

  // Cell already marked COMPLETED by atomic guard above.
  // Update agreement scores (fire-and-forget)
  updateAgreementScores(cellId).catch(err =>
    console.error('Agreement score update failed:', err)
  )

  // Fast cell: single cell, no tiers. Winner declared immediately.
  if (cell.deliberation.fastCell && winnerIds.length > 0) {
    const fastWinnerId = winnerIds[0]
    await prisma.idea.update({
      where: { id: fastWinnerId },
      data: { status: 'WINNER', isChampion: true },
    })
    const updated = await prisma.deliberation.updateMany({
      where: { id: cell.deliberationId, phase: 'VOTING' },
      data: {
        phase: 'COMPLETED',
        championId: fastWinnerId,
        completedAt: new Date(),
      },
    })
    if (updated.count > 0) {
      const winnerIdea = await prisma.idea.findUnique({ where: { id: fastWinnerId }, select: { text: true } })
      sendPushToDeliberation(
        cell.deliberationId,
        notifications.championDeclared(cell.deliberation.question, cell.deliberationId)
      ).catch(err => console.error('Failed to send push notifications:', err))
      sendEmailToDeliberation(cell.deliberationId, 'champion_declared', {
        championText: winnerIdea?.text || 'Unknown',
      }).catch(err => console.error('Failed to send champion email:', err))
      fireWebhookEvent('winner_declared', {
        deliberationId: cell.deliberationId,
        winnerId: fastWinnerId,
        winnerText: winnerIdea?.text || '',
        totalTiers: 1,
        fastCell: true,
      })
      await resolveChampionPredictions(cell.deliberationId, fastWinnerId)
      console.log(`fastCell: winner declared! Idea ${fastWinnerId} in deliberation ${cell.deliberationId}`)
    }
    return { winnerIds, loserIds }
  }

  // Check tier advancement
  if (cell.deliberation.continuousFlow) {
    // Continuous flow: form next-tier cells as winners accumulate (fractal)
    const { handleContinuousFlowCellComplete } = await import('./continuous-flow')
    await handleContinuousFlowCellComplete(cell.deliberationId, cell.tier, winnerIds)
  } else {
    // Standard batch: wait for ALL cells at this tier to complete
    await checkTierCompletion(cell.deliberationId, cell.tier)
  }

  return { winnerIds, loserIds }
}

/**
 * Promote top comments when a tier completes and ideas advance.
 * For each advancing idea, the comment with the highest cross-cell upvoteCount
 * gets promoted to the next tier (ties: promote both). Starts fresh at new tier
 * with spreadCount=0 and tierUpvotes=0.
 * Only idea-linked comments are promoted (unlinked comments stay in their origin cell).
 */
async function promoteTopComments(deliberationId: string, completedTier: number, advancingIdeaIds: string[]) {
  const nextTier = completedTier + 1

  for (const ideaId of advancingIdeaIds) {
    // Find the single top comment by cross-cell upvoteCount for this idea at the completed tier
    const topComment = await prisma.comment.findFirst({
      where: {
        ideaId,
        cell: { deliberationId },
        upvoteCount: { gte: 1 },
        reachTier: completedTier,
      },
      orderBy: [{ upvoteCount: 'desc' }, { createdAt: 'asc' }],
    })

    if (!topComment) continue

    // Promote: set reachTier to next tier, reset spread and tier upvotes for fresh start
    await prisma.comment.update({
      where: { id: topComment.id },
      data: {
        reachTier: nextTier,
        spreadCount: 0,
        tierUpvotes: 0,
      },
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

  // CONTINUOUS FLOW GUARD: During tier 1 with continuous flow, don't auto-advance
  // if there are unassigned ideas or enough members to form another cell.
  // The facilitator must explicitly close submissions via the close-submissions endpoint.
  if (tier === 1) {
    const fullDelib = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
      select: { continuousFlow: true },
    })
    if (fullDelib?.continuousFlow) {
      // Check for unassigned SUBMITTED ideas (not yet in any cell)
      const unassignedIdeas = await prisma.idea.count({
        where: {
          deliberationId,
          status: 'SUBMITTED',
          cellIdeas: { none: {} },
        },
      })
      if (unassignedIdeas > 0) {
        console.log(`checkTierCompletion: continuous flow tier 1, ${unassignedIdeas} unassigned ideas — waiting for facilitator to close submissions`)
        return
      }
    }
  }

  // ── Per-batch cross-cell XP tally ──
  // Group cells by batch. Multi-cell batches need cross-cell tally.
  // Single-cell batches were already resolved by processCellResults.

  const batchMap = new Map<number, typeof cells>()
  for (const cell of cells) {
    const b = cell.batch ?? 0
    if (!batchMap.has(b)) batchMap.set(b, [])
    batchMap.get(b)!.push(cell)
  }

  // For FCFS on-demand: check all expected batches have cells before auto-advancing.
  // Expected batches = ceil(total tier ideas / cellSize)
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    include: { members: { where: { role: { in: ['CREATOR', 'PARTICIPANT'] } } } },
  })
  if (!deliberation) return

  const cellSize = deliberation.cellSize || DEFAULT_CELL_SIZE

  if (deliberation.allocationMode === 'fcfs') {
    // Count ALL ideas at this tier (any status — some may already be ADVANCING/ELIMINATED)
    const allTierIdeaCount = await prisma.idea.count({
      where: { deliberationId, tier },
    })
    const expectedBatches = Math.max(1, Math.ceil(allTierIdeaCount / cellSize))

    for (let b = 0; b < expectedBatches; b++) {
      if (!batchMap.has(b)) {
        console.log(`checkTierCompletion: FCFS batch ${b} has no cells yet (expected ${expectedBatches} batches), waiting for voters`)
        return
      }
    }
  }

  // Process multi-cell batches: cross-cell XP tally
  for (const [batchNum, batchCells] of batchMap.entries()) {
    if (batchCells.length <= 1) continue // Single-cell batch: already resolved

    const batchCellIds = batchCells.map(c => c.id)
    const batchIdeaIds = batchCells[0].ideas.map((ci: { ideaId: string }) => ci.ideaId)

    // Check if ideas are still unresolved (IN_VOTING) — skip if already processed
    const unresolvedCount = await prisma.idea.count({
      where: { id: { in: batchIdeaIds }, status: 'IN_VOTING' },
    })
    if (unresolvedCount === 0) continue // Already resolved

    // Cross-cell XP tally for this batch
    const batchVotes = await prisma.$queryRaw<{ ideaId: string; xpPoints: number }[]>`
      SELECT "ideaId", "xpPoints" FROM "Vote" WHERE "cellId" = ANY(${batchCellIds})
    `
    const tally: Record<string, number> = {}
    for (const vote of batchVotes) {
      tally[vote.ideaId] = (tally[vote.ideaId] || 0) + vote.xpPoints
    }

    // Find batch winner (most total XP)
    const sorted = Object.entries(tally).sort(([, a], [, b]) => b - a)
    const batchWinnerId = sorted.length > 0
      ? sorted[0][0]
      : batchIdeaIds[Math.floor(Math.random() * batchIdeaIds.length)]

    if (!batchWinnerId) continue

    const batchLoserIds = batchIdeaIds.filter((id: string) => id !== batchWinnerId)

    console.log(`checkTierCompletion: batch ${batchNum} cross-cell tally — winner: ${batchWinnerId} (${tally[batchWinnerId] || 0} XP), ${batchCells.length} cells`)

    // Mark batch winner as ADVANCING, losers as ELIMINATED
    await prisma.idea.update({
      where: { id: batchWinnerId },
      data: { status: 'ADVANCING', tier },
    })

    if (batchLoserIds.length > 0) {
      await prisma.idea.updateMany({
        where: { id: { in: batchLoserIds } },
        data: { status: 'ELIMINATED', losses: { increment: 1 } },
      })
    }

    // Resolve predictions for batch cells
    for (const cell of batchCells) {
      await resolveCellPredictions(cell.id, [batchWinnerId])
    }
  }

  // Collect all advancing ideas (from both single-cell and multi-cell batches)
  const advancingIdeas = await prisma.idea.findMany({
    where: { deliberationId, status: 'ADVANCING' },
  })

  if (advancingIdeas.length === 0) {
    return
  }

  // Check if this is a single-batch final showdown (1 winner = champion)
  const totalBatches = batchMap.size
  if (totalBatches === 1 && advancingIdeas.length === 1) {
    // Final showdown: the single advancing idea is the champion
    const winnerId = advancingIdeas[0].id
    await prisma.idea.update({
      where: { id: winnerId },
      data: { status: 'WINNER', isChampion: true },
    })

    if (deliberation.accumulationEnabled) {
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
          sendEmailToDeliberation(deliberationId, 'champion_declared', {
            championText: completedDeliberation.ideas[0]?.text || 'Unknown',
          }).catch(err => console.error('Failed to send champion email:', err))
        }
      }
    }

    await resolveChampionPredictions(deliberationId, winnerId)
    const winnerForHook = await prisma.idea.findUnique({ where: { id: winnerId }, select: { text: true } })
    fireWebhookEvent('winner_declared', {
      deliberationId, winnerId, winnerText: winnerForHook?.text || '', totalTiers: tier,
    })

    return // Final showdown complete — champion declared
  }

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

    fireWebhookEvent('winner_declared', {
      deliberationId, winnerId, winnerText: advancingIdeas[0]?.text || '', totalTiers: tier,
    })
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

    // Fire tier_complete webhook
    fireWebhookEvent('tier_complete', {
      deliberationId,
      completedTier: tier,
      nextTier,
      advancingIdeas: advancingIdeas.map(i => ({ id: i.id, text: i.text })),
      advancingCount: advancingIdeas.length,
    })

    // Backfill to 5 ideas for final showdown if we have 2-4 advancing
    if (advancingIdeas.length >= 2 && advancingIdeas.length < 5) {
      const needed = 5 - advancingIdeas.length
      // Pull runners-up by totalXP from ideas eliminated this tier
      const allRunnersUp = await prisma.idea.findMany({
        where: {
          deliberationId,
          status: 'ELIMINATED',
          tier: tier,
        },
        orderBy: { totalXP: 'desc' },
      })

      if (allRunnersUp.length > 0) {
        let toRevive = allRunnersUp.slice(0, needed)

        // Check for ties at the cutoff — if the last included idea ties with excluded ones, include them (max 7 total)
        if (toRevive.length === needed && allRunnersUp.length > needed) {
          const cutoffXP = toRevive[toRevive.length - 1].totalXP
          const tiedExtras = allRunnersUp.slice(needed).filter(i => i.totalXP === cutoffXP)
          if (tiedExtras.length > 0 && advancingIdeas.length + needed + tiedExtras.length <= 7) {
            // Include all tied ideas (allows 6-7 in final showdown)
            toRevive = [...toRevive, ...tiedExtras]
            console.log(`checkTierCompletion: including ${tiedExtras.length} tied ideas at ${cutoffXP} VP`)
          } else if (tiedExtras.length > 0) {
            // Too many ties to include all — randomly pick from the tied group to fill to 5
            const tiedPool = [...toRevive.filter(i => i.totalXP === cutoffXP), ...tiedExtras]
            const nonTied = toRevive.filter(i => i.totalXP !== cutoffXP)
            const slotsForTied = needed - nonTied.length
            const shuffledTied = tiedPool.sort(() => Math.random() - 0.5).slice(0, slotsForTied)
            toRevive = [...nonTied, ...shuffledTied]
            console.log(`checkTierCompletion: randomly picked ${slotsForTied} from ${tiedPool.length} tied ideas at ${cutoffXP} VP`)
          }
        }

        // Revive runners-up back to ADVANCING
        await prisma.idea.updateMany({
          where: { id: { in: toRevive.map(i => i.id) } },
          data: { status: 'ADVANCING' },
        })
        advancingIdeas.push(...toRevive)
        console.log(`checkTierCompletion: backfilled ${toRevive.length} runners-up by VP to reach ${advancingIdeas.length} ideas for final showdown`)
      }
    }

    const shuffledIdeas = [...advancingIdeas].sort(() => Math.random() - 0.5)
    const shuffledMembers = [...deliberation.members].sort(() => Math.random() - 0.5)

    const IDEAS_PER_CELL = deliberation.cellSize || DEFAULT_CELL_SIZE
    const CELL_SIZE = deliberation.cellSize || DEFAULT_CELL_SIZE

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

    // ── FCFS mode: NO upfront cell creation — all cells created on-demand ──
    // via the enter endpoint. This applies to both final showdown (≤ cellSize ideas)
    // and multi-batch tiers (> cellSize ideas). Voters round-robin across batches.
    if (deliberation.allocationMode === 'fcfs') {
      // Notifications
      sendPushToDeliberation(
        deliberationId,
        notifications.newTier(nextTier, deliberation.question, deliberationId)
      ).catch(err => console.error('Failed to send push notifications:', err))

      sendEmailToDeliberation(deliberationId, 'new_tier', { tier: nextTier })
        .catch(err => console.error('Failed to send new tier email:', err))

      return // FCFS: cells created on-demand when voters enter
    }

    // FINAL SHOWDOWN: If 5 or fewer ideas, ALL participants vote on ALL ideas
    // Multiple cells for up-pollination of comments between cells
    console.log(`Creating tier ${nextTier}: ${shuffledIdeas.length} ideas, ${shuffledMembers.length} members, final showdown: ${shuffledIdeas.length <= 5}`)
    if (shuffledIdeas.length <= CELL_SIZE) {
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
    // All cells at max capacity (7) — round is full
    return { success: false, reason: 'ROUND_FULL' }
  }

  await prisma.cellParticipation.create({
    data: { cellId: targetCell.id, userId },
  })

  return { success: true, cellId: targetCell.id }
}

/**
 * Continuous Flow: Try to create a new tier 1 cell from unassigned ideas.
 * Called after each idea submission during VOTING phase with continuousFlow enabled.
 * FCFS mode: creates cell with ideas only (users join via stream/enter).
 * Non-FCFS mode: also requires 3+ unassigned members, pre-assigns them.
 */
export async function tryCreateContinuousFlowCell(deliberationId: string): Promise<{ cellCreated: boolean; cellId?: string }> {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    select: {
      id: true,
      phase: true,
      continuousFlow: true,
      currentTier: true,
      votingTimeoutMs: true,
      discussionDurationMs: true,
      allocationMode: true,
      cellSize: true,
    },
  })

  if (!deliberation || deliberation.phase !== 'VOTING' || !deliberation.continuousFlow) {
    return { cellCreated: false }
  }

  const isFCFS = deliberation.allocationMode === 'fcfs'

  // Find unassigned ideas: status SUBMITTED and not in any cell
  const unassignedIdeas = await prisma.idea.findMany({
    where: {
      deliberationId,
      status: 'SUBMITTED',
      cellIdeas: { none: {} },
    },
    select: { id: true, authorId: true },
  })

  const cfCellSize = deliberation.cellSize || DEFAULT_CELL_SIZE
  if (unassignedIdeas.length < cfCellSize) {
    return { cellCreated: false }
  }

  // For non-FCFS, also need unassigned members
  let cellMembers: { userId: string }[] = []
  if (!isFCFS) {
    const membersInTier1 = await prisma.cellParticipation.findMany({
      where: { cell: { deliberationId, tier: 1 } },
      select: { userId: true },
    })
    const assignedUserIds = new Set(membersInTier1.map(p => p.userId))

    const allMembers = await prisma.deliberationMember.findMany({
      where: { deliberationId, role: { in: ['CREATOR', 'PARTICIPANT'] } },
      select: { userId: true },
    })

    const unassignedMembers = allMembers.filter(m => !assignedUserIds.has(m.userId))
    if (unassignedMembers.length < 3) {
      return { cellCreated: false }
    }

    const memberCount = Math.min(unassignedMembers.length, cfCellSize)
    cellMembers = unassignedMembers.slice(0, memberCount)
  }

  // Take first N ideas (based on cell size)
  const cellIdeas = unassignedIdeas.slice(0, cfCellSize)

  // Mark ideas as IN_VOTING
  await prisma.idea.updateMany({
    where: { id: { in: cellIdeas.map(i => i.id) } },
    data: { status: 'IN_VOTING', tier: 1 },
  })

  // Determine cell status based on discussion settings
  const hasDiscussion = deliberation.discussionDurationMs !== null && deliberation.discussionDurationMs !== 0
  const cellStatus = hasDiscussion ? 'DELIBERATING' as const : 'VOTING' as const
  const discussionEndsAt = hasDiscussion && deliberation.discussionDurationMs! > 0
    ? new Date(Date.now() + deliberation.discussionDurationMs!)
    : null

  const cell = await prisma.cell.create({
    data: {
      deliberationId,
      tier: 1,
      status: cellStatus,
      discussionEndsAt,
      votingDeadline: !hasDiscussion && deliberation.votingTimeoutMs > 0
        ? new Date(Date.now() + deliberation.votingTimeoutMs)
        : null,
      ideas: {
        create: cellIdeas.map(idea => ({ ideaId: idea.id })),
      },
      ...(cellMembers.length > 0 && {
        participants: {
          create: cellMembers.map(m => ({ userId: m.userId })),
        },
      }),
    },
  })

  console.log(`Continuous flow: created tier 1 cell ${cell.id} with ${cellIdeas.length} ideas${isFCFS ? ' (FCFS)' : ` and ${cellMembers.length} members`}`)

  return { cellCreated: true, cellId: cell.id }
}

/**
 * Close submissions in continuous flow mode.
 * Sets submissionsClosed=true, creates a final cell from any leftover unassigned ideas
 * (even if fewer than cellSize), and lets existing cells finish voting naturally.
 */
export async function closeSubmissions(deliberationId: string): Promise<{ closed: boolean; finalCellCreated: boolean; finalCellId?: string; leftoverIdeas: number }> {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    select: {
      id: true,
      phase: true,
      continuousFlow: true,
      currentTier: true,
      votingTimeoutMs: true,
      discussionDurationMs: true,
      allocationMode: true,
      cellSize: true,
    },
  })

  if (!deliberation || deliberation.phase !== 'VOTING' || !deliberation.continuousFlow) {
    return { closed: false, finalCellCreated: false, leftoverIdeas: 0 }
  }

  // Set submissionsClosed flag
  await prisma.deliberation.update({
    where: { id: deliberationId },
    data: { submissionsClosed: true },
  })

  // Find unassigned ideas
  const unassignedIdeas = await prisma.idea.findMany({
    where: {
      deliberationId,
      status: 'SUBMITTED',
      cellIdeas: { none: {} },
    },
    select: { id: true, authorId: true },
  })

  if (unassignedIdeas.length === 0) {
    return { closed: true, finalCellCreated: false, leftoverIdeas: 0 }
  }

  // Create a final cell with whatever ideas remain (even if < cellSize)
  const isFCFS = deliberation.allocationMode === 'fcfs'

  // Mark ideas as IN_VOTING at tier 1 (new ideas always enter at bottom of pyramid)
  await prisma.idea.updateMany({
    where: { id: { in: unassignedIdeas.map(i => i.id) } },
    data: { status: 'IN_VOTING', tier: 1 },
  })

  const hasDiscussion = deliberation.discussionDurationMs !== null && deliberation.discussionDurationMs !== 0
  const cellStatus = hasDiscussion ? 'DELIBERATING' as const : 'VOTING' as const
  const discussionEndsAt = hasDiscussion && deliberation.discussionDurationMs! > 0
    ? new Date(Date.now() + deliberation.discussionDurationMs!)
    : null

  const cell = await prisma.cell.create({
    data: {
      deliberationId,
      tier: 1,
      status: cellStatus,
      discussionEndsAt,
      votingDeadline: !hasDiscussion && deliberation.votingTimeoutMs > 0
        ? new Date(Date.now() + deliberation.votingTimeoutMs)
        : null,
      ideas: {
        create: unassignedIdeas.map(idea => ({ ideaId: idea.id })),
      },
    },
  })

  console.log(`Close submissions: created final cell ${cell.id} with ${unassignedIdeas.length} leftover ideas${isFCFS ? ' (FCFS)' : ''}`)

  return { closed: true, finalCellCreated: true, finalCellId: cell.id, leftoverIdeas: unassignedIdeas.length }
}
