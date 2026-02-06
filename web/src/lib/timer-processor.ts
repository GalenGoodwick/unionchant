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
        where: { tier: { not: undefined } },
        select: { id: true, status: true, completedAt: true, tier: true },
      },
    },
  })

  for (const deliberation of expiredDeliberations) {
    const currentTierCells = deliberation.cells.filter(c => c.tier === deliberation.currentTier)
    const votingCells = currentTierCells.filter(c => c.status === 'VOTING')
    const completedCells = currentTierCells.filter(c => c.status === 'COMPLETED')

    // No-timer deliberations: supermajority auto-advance if enabled
    if (deliberation.votingTimeoutMs === 0) {
      if (!deliberation.supermajorityEnabled) continue
      // Supermajority: 80%+ cells done + 10min grace → auto-complete stragglers
      if (currentTierCells.length >= 3 && votingCells.length > 0) {
        const completionRate = completedCells.length / currentTierCells.length
        if (completionRate >= 0.8) {
          // Check if the last cell completed at least 5 minutes ago
          const lastCompleted = completedCells
            .map(c => c.completedAt?.getTime() ?? 0)
            .reduce((max, t) => Math.max(max, t), 0)
          const GRACE_MS = 10 * 60 * 1000 // 5 minutes
          if (lastCompleted > 0 && now.getTime() - lastCompleted >= GRACE_MS) {
            console.log(`Supermajority auto-advance: ${completedCells.length}/${currentTierCells.length} cells done for deliberation ${deliberation.id}`)
            for (const cell of votingCells) {
              try {
                await processCellResults(cell.id, true)
                processed.push(cell.id)
              } catch (err) {
                console.error(`Failed to auto-advance straggler cell ${cell.id}:`, err)
              }
            }
          }
        }
      }
      continue
    }

    // Calculate if tier has expired: startedAt + timeoutMs < now
    const tierStarted = deliberation.currentTierStartedAt!
    const tierDeadline = new Date(tierStarted.getTime() + deliberation.votingTimeoutMs)

    if (tierDeadline <= now) {
      // Process all voting cells in this tier
      for (const cell of votingCells) {
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
    // Timed mode: no supermajority — let the timer run its course
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
      currentTier: true,
      submissionEndsAt: true,
      accumulationEndsAt: true,
      currentTierStartedAt: true,
      votingTimeoutMs: true,
      supermajorityEnabled: true,
      _count: { select: { ideas: true } },
      cells: {
        select: { id: true, status: true, tier: true, discussionEndsAt: true, completedAt: true }
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

  // Check expired discussions (DELIBERATING → VOTING)
  if (deliberation.phase === 'VOTING') {
    const expiredDiscussionCells = deliberation.cells.filter(
      c => c.status === 'DELIBERATING' && c.discussionEndsAt && c.discussionEndsAt <= now
    )
    for (const cell of expiredDiscussionCells) {
      try {
        await prisma.cell.updateMany({
          where: { id: cell.id, status: 'DELIBERATING' },
          data: {
            status: 'VOTING',
            votingStartedAt: now,
            votingDeadline: deliberation.votingTimeoutMs > 0
              ? new Date(now.getTime() + deliberation.votingTimeoutMs)
              : null,
          },
        })
        transitioned = true
      } catch (err) {
        console.error(`Lazy discussion transition failed for ${cell.id}:`, err)
      }
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

  // Check tier deadline and supermajority auto-advance
  if (deliberation.phase === 'VOTING') {
    const currentTierCells = deliberation.cells.filter(c => c.tier === deliberation.currentTier)
    const votingCells = currentTierCells.filter(c => c.status === 'VOTING')
    const completedCells = currentTierCells.filter(c => c.status === 'COMPLETED')

    // Tier deadline expired — force complete all voting cells
    if (
      deliberation.currentTierStartedAt &&
      deliberation.votingTimeoutMs > 0
    ) {
      const tierDeadline = new Date(
        deliberation.currentTierStartedAt.getTime() + deliberation.votingTimeoutMs
      )
      if (tierDeadline <= now) {
        for (const cell of votingCells) {
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

    // Supermajority auto-advance (no-timer mode only, if enabled): 80%+ cells done, 10min grace
    if (deliberation.votingTimeoutMs === 0 && deliberation.supermajorityEnabled && currentTierCells.length >= 3 && votingCells.length > 0 && !transitioned) {
      const completionRate = completedCells.length / currentTierCells.length
      if (completionRate >= 0.8) {
        const lastCompleted = completedCells
          .map(c => c.completedAt?.getTime() ?? 0)
          .reduce((max, t) => Math.max(max, t), 0)
        const GRACE_MS = 10 * 60 * 1000
        if (lastCompleted > 0 && now.getTime() - lastCompleted >= GRACE_MS) {
          console.log(`Lazy supermajority auto-advance: ${completedCells.length}/${currentTierCells.length} cells done for ${deliberationId}`)
          for (const cell of votingCells) {
            try {
              await processCellResults(cell.id, true)
              transitioned = true
            } catch (err) {
              console.error(`Lazy supermajority auto-advance failed for ${cell.id}:`, err)
            }
          }
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
/**
 * Purge empty talks — deliberations older than 24h with 0 ideas submitted.
 * Any idea submission saves the talk from purging.
 */
export async function purgeEmptyTalks(): Promise<string[]> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24h ago

  const emptyTalks = await prisma.deliberation.findMany({
    where: {
      createdAt: { lte: cutoff },
      phase: 'SUBMISSION',
      isShowcase: false,
    },
    include: {
      _count: { select: { ideas: true } },
    },
  })

  const toPurge = emptyTalks.filter(d => d._count.ideas === 0)
  const purged: string[] = []

  for (const talk of toPurge) {
    try {
      // Cascade delete (no ideas/cells to worry about, but clean up relations)
      await prisma.deliberationUpvote.deleteMany({ where: { deliberationId: talk.id } })
      await prisma.notification.deleteMany({ where: { deliberationId: talk.id } })
      await prisma.watch.deleteMany({ where: { deliberationId: talk.id } })
      await prisma.aIAgent.deleteMany({ where: { deliberationId: talk.id } })
      await prisma.deliberationMember.deleteMany({ where: { deliberationId: talk.id } })
      await prisma.deliberation.delete({ where: { id: talk.id } })
      purged.push(talk.id)
      console.log(`[Purge] Deleted empty talk ${talk.id}: "${talk.question.slice(0, 50)}"`)
    } catch (err) {
      console.error(`[Purge] Failed to delete talk ${talk.id}:`, err)
    }
  }

  return purged
}

export async function processAllTimers(trigger?: string) {
  const startedAt = Date.now()

  try {
    const [submissions, discussions, tiers, accumulations] = await Promise.all([
      processExpiredSubmissions(),
      processExpiredDiscussions(),
      processExpiredTiers(),
      processExpiredAccumulations(),
    ])

    // Self-healing and purging only run from cron triggers (not feed API)
    let stuckHealed: string[] = []
    let purged: string[] = []
    if (trigger === 'external_cron' || trigger === 'vercel_cron') {
      stuckHealed = await processStuckCells()
      purged = await purgeEmptyTalks()
    }

    const total = submissions.length + discussions.length + tiers.length + accumulations.length + stuckHealed.length + purged.length

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
      purged,
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
