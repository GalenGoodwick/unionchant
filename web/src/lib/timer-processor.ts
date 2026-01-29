import { prisma } from './prisma'
import { startVotingPhase, processCellResults } from './voting'
import { startChallengeRound } from './challenge'

/**
 * Process deliberations where submission period has ended
 * Auto-start voting when submissionEndsAt passes
 */
export async function processExpiredSubmissions(): Promise<string[]> {
  const now = new Date()

  const expiredDeliberations = await prisma.deliberation.findMany({
    where: {
      phase: 'SUBMISSION',
      submissionEndsAt: { lte: now },
    },
    include: {
      _count: { select: { ideas: true } }
    }
  })

  const processed: string[] = []

  for (const deliberation of expiredDeliberations) {
    // Only start voting if there are at least 2 ideas
    if (deliberation._count.ideas >= 2) {
      try {
        await startVotingPhase(deliberation.id)
        processed.push(deliberation.id)
      } catch (err) {
        console.error(`Failed to start voting for ${deliberation.id}:`, err)
      }
    } else {
      // Not enough ideas - extend submission or mark as failed
      // For now, just clear the deadline so it doesn't keep trying
      await prisma.deliberation.update({
        where: { id: deliberation.id },
        data: { submissionEndsAt: null }
      })
    }
  }

  return processed
}

/**
 * Process deliberations where voting tier has expired
 * Completes all cells in the tier with whatever votes have been cast
 */
export async function processExpiredTiers(): Promise<string[]> {
  const now = new Date()

  // 1. Finalize cells whose grace period has expired (all votes in, timer elapsed)
  const gracePeriodCells = await prisma.cell.findMany({
    where: {
      status: 'VOTING',
      finalizesAt: { lte: now },
    },
    select: { id: true },
  })

  const processed: string[] = []

  for (const cell of gracePeriodCells) {
    try {
      await processCellResults(cell.id, false)
      processed.push(cell.id)
    } catch (err) {
      console.error(`Failed to finalize grace period cell ${cell.id}:`, err)
    }
  }

  // 2. Find deliberations in VOTING phase where tier has expired
  const expiredDeliberations = await prisma.deliberation.findMany({
    where: {
      phase: 'VOTING',
      currentTierStartedAt: { not: null },
    },
    include: {
      cells: {
        where: { status: 'VOTING' },
      },
    },
  })

  for (const deliberation of expiredDeliberations) {
    // Calculate if tier has expired: startedAt + timeoutMs < now
    const tierStarted = deliberation.currentTierStartedAt!
    const tierDeadline = new Date(tierStarted.getTime() + deliberation.votingTimeoutMs)

    if (tierDeadline <= now) {
      // Process all voting cells in this tier
      for (const cell of deliberation.cells) {
        // Re-check cell status to reduce contention with vote endpoint
        const currentCell = await prisma.cell.findUnique({
          where: { id: cell.id },
          select: { status: true },
        })
        if (currentCell?.status === 'COMPLETED') continue

        try {
          await processCellResults(cell.id, true) // true = timeout
          processed.push(cell.id)
        } catch (err) {
          console.error(`Failed to process expired cell ${cell.id}:`, err)
        }
      }
    }
  }

  return processed
}

/**
 * Process deliberations where accumulation period has ended
 * Start a new challenge round
 */
export async function processExpiredAccumulations(): Promise<string[]> {
  const now = new Date()

  const expiredDeliberations = await prisma.deliberation.findMany({
    where: {
      phase: 'ACCUMULATING',
      accumulationEndsAt: { lte: now },
    },
  })

  const processed: string[] = []

  for (const deliberation of expiredDeliberations) {
    try {
      await startChallengeRound(deliberation.id)
      processed.push(deliberation.id)
    } catch (err) {
      console.error(`Failed to start challenge round for ${deliberation.id}:`, err)
    }
  }

  return processed
}

/**
 * Check and transition a single deliberation
 * Used for lazy evaluation when fetching deliberation data
 */
export async function checkAndTransitionDeliberation(deliberationId: string): Promise<boolean> {
  const now = new Date()

  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    select: {
      id: true,
      phase: true,
      submissionEndsAt: true,
      accumulationEndsAt: true,
      currentTierStartedAt: true,
      votingTimeoutMs: true,
      _count: { select: { ideas: true } },
      cells: {
        where: { status: 'VOTING' },
        select: { id: true }
      }
    }
  })

  if (!deliberation) return false

  let transitioned = false

  // Check submission expiry
  if (
    deliberation.phase === 'SUBMISSION' &&
    deliberation.submissionEndsAt &&
    deliberation.submissionEndsAt <= now &&
    deliberation._count.ideas >= 2
  ) {
    try {
      await startVotingPhase(deliberationId)
      transitioned = true
    } catch (err) {
      console.error(`Lazy transition failed for ${deliberationId}:`, err)
    }
  }

  // Check grace period cells (all votes in, timer elapsed)
  if (deliberation.phase === 'VOTING') {
    const graceCells = await prisma.cell.findMany({
      where: {
        deliberationId,
        status: 'VOTING',
        finalizesAt: { lte: now },
      },
      select: { id: true },
    })

    for (const cell of graceCells) {
      try {
        await processCellResults(cell.id, false)
        transitioned = true
      } catch (err) {
        console.error(`Lazy grace period finalization failed for ${cell.id}:`, err)
      }
    }
  }

  // Check tier deadline
  if (
    deliberation.phase === 'VOTING' &&
    deliberation.currentTierStartedAt
  ) {
    const tierDeadline = new Date(
      deliberation.currentTierStartedAt.getTime() + deliberation.votingTimeoutMs
    )
    if (tierDeadline <= now) {
      // Process all voting cells in this tier
      for (const cell of deliberation.cells) {
        // Re-check cell status to reduce contention
        const currentCell = await prisma.cell.findUnique({
          where: { id: cell.id },
          select: { status: true },
        })
        if (currentCell?.status === 'COMPLETED') continue

        try {
          await processCellResults(cell.id, true)
          transitioned = true
        } catch (err) {
          console.error(`Lazy tier deadline transition failed for ${cell.id}:`, err)
        }
      }
    }
  }

  // Check accumulation expiry
  if (
    deliberation.phase === 'ACCUMULATING' &&
    deliberation.accumulationEndsAt &&
    deliberation.accumulationEndsAt <= now
  ) {
    try {
      await startChallengeRound(deliberationId)
      transitioned = true
    } catch (err) {
      console.error(`Lazy challenge round start failed for ${deliberationId}:`, err)
    }
  }

  return transitioned
}


/**
 * Run all timer processors
 */
export async function processAllTimers() {
  const [submissions, tiers, accumulations] = await Promise.all([
    processExpiredSubmissions(),
    processExpiredTiers(),
    processExpiredAccumulations(),
  ])

  return {
    submissions,
    tiers,
    accumulations,
    total: submissions.length + tiers.length + accumulations.length,
  }
}
