import { prisma } from './prisma'
import { fireWebhookEvent } from './webhooks'
import { sendPushToDeliberation, notifications } from './push'
import { sendEmailToDeliberation } from './email'
import { resolveChampionPredictions } from './voting'
import { notifyAgentOwner, notifyVotedForWinner } from './agent-notifications'

/**
 * Continuous Flow Fractal Tier Advancement
 *
 * After a cell completes at tier N, check if enough winners have accumulated
 * to form a tier N+1 cell. If cellSize winners exist at tier N with status
 * ADVANCING, create a new cell at tier N+1.
 *
 * This replaces the batch-based checkTierCompletion for continuous flow
 * deliberations. Instead of waiting for ALL cells at a tier to finish,
 * cells form as soon as enough winners accumulate.
 *
 * T1 cells form continuously from new ideas (tryCreateContinuousFlowCell).
 * T2 cells form when 5 T1 winners accumulate.
 * T3 cells form when 5 T2 winners accumulate.
 * ...and so on until a single winner emerges.
 */

const DEFAULT_CELL_SIZE = 5

/**
 * Try to create a next-tier cell from completed tier winners.
 * Called after every cell completion in a continuous flow deliberation.
 *
 * Returns true if a new cell was created.
 */
export async function tryAdvanceContinuousFlowTier(
  deliberationId: string,
  completedTier: number
): Promise<boolean> {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    select: {
      id: true,
      phase: true,
      continuousFlow: true,
      cellSize: true,
      allocationMode: true,
      votingTimeoutMs: true,
      discussionDurationMs: true,
      accumulationEnabled: true,
      accumulationTimeoutMs: true,
      question: true,
    },
  })

  if (!deliberation || !deliberation.continuousFlow || deliberation.phase !== 'VOTING') {
    return false
  }

  const cellSize = deliberation.cellSize || DEFAULT_CELL_SIZE
  const nextTier = completedTier + 1

  // Find ADVANCING ideas at this tier (winners not yet placed in a higher-tier cell)
  const advancingIdeas = await prisma.idea.findMany({
    where: {
      deliberationId,
      status: 'ADVANCING',
      tier: completedTier,
    },
    orderBy: { createdAt: 'asc' }, // oldest winners first (fairness)
    select: { id: true, text: true, totalXP: true },
  })

  // Not enough winners yet — wait for more cells to complete
  if (advancingIdeas.length < cellSize) {
    return false
  }

  // === Single winner case: if only 1 idea would advance, we have a champion ===
  // This happens when cellSize ideas compete and 1 wins. But since we need
  // cellSize ADVANCING ideas to form the next cell, the single-winner case
  // is handled naturally: we just wait for more T(N-1) cells to complete.
  // The ONLY time we declare a winner is in the final showdown (1 cell, 1 winner).

  // Take exactly cellSize ideas for the new cell
  const cellIdeas = advancingIdeas.slice(0, cellSize)

  // Atomic guard: try to mark these ideas as IN_VOTING at next tier.
  // If another concurrent call already grabbed them, some will fail to match.
  const updated = await prisma.idea.updateMany({
    where: {
      id: { in: cellIdeas.map(i => i.id) },
      status: 'ADVANCING', // only grab if still ADVANCING (not already claimed)
    },
    data: {
      status: 'IN_VOTING',
      tier: nextTier,
    },
  })

  // If we couldn't claim all ideas, another call beat us — revert and bail
  if (updated.count < cellSize) {
    // Revert any we did claim back to ADVANCING
    await prisma.idea.updateMany({
      where: {
        id: { in: cellIdeas.map(i => i.id) },
        status: 'IN_VOTING',
        tier: nextTier,
      },
      data: {
        status: 'ADVANCING',
        tier: completedTier,
      },
    })
    console.log(`continuousFlow: race condition — only claimed ${updated.count}/${cellSize} ideas for tier ${nextTier}, reverting`)
    return false
  }

  // Determine cell status (discussion phase or straight to voting)
  const hasDiscussion = deliberation.discussionDurationMs !== null && deliberation.discussionDurationMs !== 0
  const cellStatus = hasDiscussion ? 'DELIBERATING' as const : 'VOTING' as const
  const discussionEndsAt = hasDiscussion && deliberation.discussionDurationMs! > 0
    ? new Date(Date.now() + deliberation.discussionDurationMs!)
    : null

  // Create the next-tier cell (FCFS: no participants pre-assigned)
  const isFCFS = deliberation.allocationMode === 'fcfs'

  // For FCFS: assign a batch number so the enter endpoint can create
  // additional cells in the same batch for cross-cell XP tally.
  // Batch = count of existing cells at this tier (each seed cell = new batch).
  let batchNumber: number | undefined = undefined
  if (isFCFS) {
    const existingCellCount = await prisma.cell.count({
      where: { deliberationId, tier: nextTier },
    })
    batchNumber = existingCellCount
  }

  const cell = await prisma.cell.create({
    data: {
      deliberationId,
      tier: nextTier,
      batch: batchNumber ?? null,
      status: cellStatus,
      discussionEndsAt,
      votingDeadline: !hasDiscussion && deliberation.votingTimeoutMs > 0
        ? new Date(Date.now() + deliberation.votingTimeoutMs)
        : null,
      ideas: {
        create: cellIdeas.map(idea => ({ ideaId: idea.id })),
      },
    },
  })

  // Update deliberation's currentTier if this is a new highest tier
  await prisma.deliberation.updateMany({
    where: {
      id: deliberationId,
      currentTier: { lt: nextTier },
    },
    data: {
      currentTier: nextTier,
      currentTierStartedAt: new Date(),
    },
  })

  console.log(`continuousFlow: created tier ${nextTier} cell ${cell.id} with ${cellSize} winners from tier ${completedTier}${isFCFS ? ' (FCFS)' : ''}`)

  // Fire webhook
  fireWebhookEvent('tier_complete', {
    deliberationId,
    completedTier,
    nextTier,
    advancingIdeas: cellIdeas.map(i => ({ id: i.id, text: i.text })),
    advancingCount: cellIdeas.length,
  })

  // Check if there are MORE remaining advancing ideas at this tier for another cell
  // (recursive: keep forming cells as long as we have enough winners)
  const remaining = advancingIdeas.length - cellSize
  if (remaining >= cellSize) {
    // Schedule another attempt (don't await to avoid deep recursion)
    tryAdvanceContinuousFlowTier(deliberationId, completedTier).catch(err =>
      console.error('continuousFlow: recursive tier advance failed:', err)
    )
  }

  return true
}

/**
 * Handle continuous flow cell completion.
 * Called from processCellResults when the deliberation has continuousFlow=true.
 *
 * After a cell completes:
 * 1. Try to form a next-tier cell from accumulated winners at this tier
 * 2. If a final showdown cell (tier N, only 1 cell) produces a single winner,
 *    that's the champion — complete the deliberation.
 */
export async function handleContinuousFlowCellComplete(
  deliberationId: string,
  completedTier: number,
  winnerIds: string[]
): Promise<void> {
  // Count incomplete cells at this tier
  const incompleteCells = await prisma.cell.count({
    where: {
      deliberationId,
      tier: completedTier,
      status: { notIn: ['COMPLETED'] },
    },
  })

  // Count remaining ADVANCING ideas at this tier
  const otherAdvancing = await prisma.idea.count({
    where: {
      deliberationId,
      status: 'ADVANCING',
      tier: completedTier,
    },
  })

  // FINAL SHOWDOWN: processCellResults passes winnerIds=[] for final showdown cells
  // because it skips per-cell winner marking. We need to do the cross-cell tally here.
  if (
    winnerIds.length === 0 &&
    incompleteCells === 0 &&
    completedTier >= 2
  ) {
    // Get all completed cells at this tier
    const cells = await prisma.cell.findMany({
      where: { deliberationId, tier: completedTier, status: 'COMPLETED' },
      include: { ideas: true },
    })

    // Check if all cells have the same ideas (final showdown condition)
    const firstIdeaIds = cells[0]?.ideas.map(ci => ci.ideaId).sort() || []
    const allSameIdeas = cells.every(c => {
      const ids = c.ideas.map(ci => ci.ideaId).sort()
      return ids.length === firstIdeaIds.length && ids.every((id, i) => id === firstIdeaIds[i])
    })

    if (allSameIdeas && firstIdeaIds.length > 0) {
      // Cross-cell tally: sum XP across all cells
      const cellIds = cells.map(c => c.id)
      const allVotes = await prisma.$queryRaw<{ ideaId: string; xpPoints: number }[]>`
        SELECT "ideaId", "xpPoints" FROM "Vote" WHERE "cellId" = ANY(${cellIds})
      `
      const tally: Record<string, number> = {}
      for (const vote of allVotes) {
        tally[vote.ideaId] = (tally[vote.ideaId] || 0) + vote.xpPoints
      }

      const sorted = Object.entries(tally).sort(([, a], [, b]) => b - a)
      const winnerId = sorted.length > 0
        ? sorted[0][0]
        : firstIdeaIds[Math.floor(Math.random() * firstIdeaIds.length)]

      if (winnerId) {
        // Mark losers
        const loserIds = firstIdeaIds.filter(id => id !== winnerId)
        if (loserIds.length > 0) {
          await prisma.idea.updateMany({
            where: { id: { in: loserIds } },
            data: { status: 'ELIMINATED' },
          })
        }

        await declareContinuousFlowChampion(deliberationId, winnerId, completedTier)
        return
      }
    }
  }

  // Normal case: single winner from a non-showdown cell
  if (
    winnerIds.length === 1 &&
    otherAdvancing === 0 &&
    incompleteCells === 0 &&
    completedTier >= 2
  ) {
    await declareContinuousFlowChampion(deliberationId, winnerIds[0], completedTier)
    return
  }

  // Otherwise, try to form a next-tier cell from accumulated winners
  await tryAdvanceContinuousFlowTier(deliberationId, completedTier)
}

/**
 * Declare the champion for a continuous flow deliberation.
 */
async function declareContinuousFlowChampion(
  deliberationId: string,
  winnerId: string,
  finalTier: number
): Promise<void> {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    select: {
      question: true,
      accumulationEnabled: true,
      accumulationTimeoutMs: true,
      phase: true,
    },
  })

  if (!deliberation || deliberation.phase !== 'VOTING') return

  // Mark winner
  await prisma.idea.update({
    where: { id: winnerId },
    data: { status: 'WINNER', isChampion: true },
  })

  const winnerIdea = await prisma.idea.findUnique({
    where: { id: winnerId },
    select: { text: true },
  })

  {
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

      sendEmailToDeliberation(deliberationId, 'champion_declared', {
        championText: winnerIdea?.text || 'Unknown',
      }).catch(err => console.error('Failed to send champion email:', err))
    }
  }

  // Resolve predictions
  await resolveChampionPredictions(deliberationId, winnerId)

  fireWebhookEvent('winner_declared', {
    deliberationId,
    winnerId,
    winnerText: winnerIdea?.text || '',
    totalTiers: finalTier,
  })

  // Agent notifications (fire-and-forget)
  notifyAgentOwner({ type: 'idea_won', ideaId: winnerId, deliberationId })
  notifyAgentOwner({ type: 'chant_concluded', deliberationId, question: deliberation.question, winnerText: winnerIdea?.text || '' })
  notifyVotedForWinner(deliberationId, winnerId)

  console.log(`continuousFlow: champion declared! Idea ${winnerId} won after ${finalTier} tiers`)
}
