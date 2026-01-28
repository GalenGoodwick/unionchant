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
 * Process cells where voting deadline has passed
 * Completes cells with whatever votes have been cast
 */
export async function processExpiredCells(): Promise<string[]> {
  const now = new Date()

  const expiredCells = await prisma.cell.findMany({
    where: {
      status: 'VOTING',
      votingDeadline: { lte: now },
    },
  })

  const processed: string[] = []

  for (const cell of expiredCells) {
    try {
      await processCellResults(cell.id, true) // true = timeout
      processed.push(cell.id)
    } catch (err) {
      console.error(`Failed to process expired cell ${cell.id}:`, err)
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
    include: {
      _count: { select: { ideas: true } },
      cells: {
        where: { status: 'VOTING' }
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

  // Check voting deadlines
  for (const cell of deliberation.cells) {
    if (cell.votingDeadline && cell.votingDeadline <= now) {
      try {
        await processCellResults(cell.id, true)
        transitioned = true
      } catch (err) {
        console.error(`Lazy voting deadline transition failed for ${cell.id}:`, err)
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
  const [submissions, cells, accumulations] = await Promise.all([
    processExpiredSubmissions(),
    processExpiredCells(),
    processExpiredAccumulations(),
  ])

  return {
    submissions,
    cells,
    accumulations,
    total: submissions.length + cells.length + accumulations.length,
  }
}
