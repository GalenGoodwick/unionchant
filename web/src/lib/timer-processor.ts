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
 * Process cells where discussion period has expired
 * Transitions DELIBERATING cells to VOTING when discussionEndsAt passes
 */
export async function processExpiredDiscussions(): Promise<string[]> {
  const now = new Date()

  const expiredCells = await prisma.cell.findMany({
    where: {
      status: 'DELIBERATING',
      discussionEndsAt: { lte: now },
    },
    include: {
      deliberation: { select: { votingTimeoutMs: true } },
    },
  })

  const processed: string[] = []

  for (const cell of expiredCells) {
    try {
      await prisma.cell.update({
        where: { id: cell.id },
        data: {
          status: 'VOTING',
          votingStartedAt: now,
          votingDeadline: cell.deliberation.votingTimeoutMs > 0
            ? new Date(now.getTime() + cell.deliberation.votingTimeoutMs)
            : null,
        },
      })
      processed.push(cell.id)
    } catch (err) {
      console.error(`Failed to advance discussion for cell ${cell.id}:`, err)
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
    // Skip no-timer deliberations (advance only when all vote or facilitator forces)
    if (deliberation.votingTimeoutMs === 0) continue

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

  // Check tier deadline (skip no-timer deliberations)
  if (
    deliberation.phase === 'VOTING' &&
    deliberation.currentTierStartedAt &&
    deliberation.votingTimeoutMs > 0
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
 * Detect and self-heal cells stuck in VOTING beyond their deadline.
 * Only runs from cron triggers to avoid overhead on feed requests.
 */
async function processStuckCells(): Promise<string[]> {
  const now = new Date()
  const FIVE_MINUTES = 5 * 60 * 1000

  // Find cells still in VOTING status
  const stuckCandidates = await prisma.cell.findMany({
    where: {
      status: 'VOTING',
    },
    select: {
      id: true,
      createdAt: true,
      finalizesAt: true,
      deliberation: {
        select: {
          currentTierStartedAt: true,
          votingTimeoutMs: true,
        },
      },
    },
  })

  const processed: string[] = []

  for (const cell of stuckCandidates) {
    const delib = cell.deliberation
    if (!delib.currentTierStartedAt || delib.votingTimeoutMs === 0) continue

    const tierDeadline = new Date(delib.currentTierStartedAt.getTime() + delib.votingTimeoutMs)

    // Only self-heal if deadline passed more than 5 minutes ago
    if (tierDeadline.getTime() + FIVE_MINUTES > now.getTime()) continue

    try {
      console.warn(`SELF-HEAL: Processing stuck cell ${cell.id} (deadline was ${tierDeadline.toISOString()})`)
      await processCellResults(cell.id, true)
      processed.push(cell.id)
    } catch (err) {
      console.error(`SELF-HEAL failed for cell ${cell.id}:`, err)
    }
  }

  if (processed.length > 0) {
    console.warn(`SELF-HEAL: Fixed ${processed.length} stuck cells`)
  }

  return processed
}

/**
 * Run all timer processors
 * @param trigger - Source that triggered this run (for logging)
 */
export async function processAllTimers(trigger?: string) {
  const startedAt = Date.now()

  try {
    const [submissions, discussions, tiers, accumulations] = await Promise.all([
      processExpiredSubmissions(),
      processExpiredDiscussions(),
      processExpiredTiers(),
      processExpiredAccumulations(),
    ])

    // Self-healing only runs from cron triggers (not feed API)
    let stuckHealed: string[] = []
    if (trigger === 'external_cron' || trigger === 'vercel_cron') {
      stuckHealed = await processStuckCells()
    }

    const total = submissions.length + discussions.length + tiers.length + accumulations.length + stuckHealed.length

    // Log execution: always for cron, only when work done for feed
    if (trigger === 'external_cron' || trigger === 'vercel_cron' || total > 0) {
      prisma.cronLog.create({
        data: {
          trigger: trigger || 'unknown',
          processed: total,
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
        },
      }).catch(err => console.error('Failed to log cron execution:', err))
    }

    return {
      submissions,
      discussions,
      tiers,
      accumulations,
      stuckHealed,
      total,
    }
  } catch (error) {
    // Log failure
    if (trigger) {
      prisma.cronLog.create({
        data: {
          trigger,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
        },
      }).catch(() => {})
    }
    throw error
  }
}
