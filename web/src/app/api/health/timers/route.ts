import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/health/timers - Timer health check (protected by CRON_SECRET)
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const OVERDUE_THRESHOLD = 5 * 60 * 1000 // 5 minutes

    // 1. Cells with expired grace period still in VOTING
    const stuckGraceCells = await prisma.cell.findMany({
      where: {
        status: 'VOTING',
        finalizesAt: { lte: now },
      },
      select: { id: true, finalizesAt: true },
      orderBy: { finalizesAt: 'asc' },
      take: 5,
    })

    // 2. Deliberations in VOTING with expired tier deadline
    const votingDelibs = await prisma.deliberation.findMany({
      where: {
        phase: 'VOTING',
        currentTierStartedAt: { not: null },
        votingTimeoutMs: { gt: 0 },
      },
      select: {
        id: true,
        currentTierStartedAt: true,
        votingTimeoutMs: true,
        _count: { select: { cells: { where: { status: 'VOTING' } } } },
      },
    })

    const stuckTiers = votingDelibs.filter(d => {
      const deadline = new Date(d.currentTierStartedAt!.getTime() + d.votingTimeoutMs)
      return deadline <= now && d._count.cells > 0
    }).map(d => ({
      id: d.id,
      deadline: new Date(d.currentTierStartedAt!.getTime() + d.votingTimeoutMs),
      votingCells: d._count.cells,
    }))

    // 3. Expired submissions
    const stuckSubmissions = await prisma.deliberation.findMany({
      where: {
        phase: 'SUBMISSION',
        submissionEndsAt: { lte: now },
      },
      select: { id: true, submissionEndsAt: true },
      take: 5,
    })

    // 4. Expired accumulations
    const stuckAccumulations = await prisma.deliberation.findMany({
      where: {
        phase: 'ACCUMULATING',
        accumulationEndsAt: { lte: now },
      },
      select: { id: true, accumulationEndsAt: true },
      take: 5,
    })

    // Calculate oldest overdue ages
    const oldestGrace = stuckGraceCells[0]?.finalizesAt
      ? now.getTime() - stuckGraceCells[0].finalizesAt.getTime() : 0
    const oldestTier = stuckTiers[0]
      ? now.getTime() - stuckTiers[0].deadline.getTime() : 0
    const oldestSubmission = stuckSubmissions[0]?.submissionEndsAt
      ? now.getTime() - stuckSubmissions[0].submissionEndsAt.getTime() : 0
    const oldestAccumulation = stuckAccumulations[0]?.accumulationEndsAt
      ? now.getTime() - stuckAccumulations[0].accumulationEndsAt.getTime() : 0

    const maxOverdue = Math.max(oldestGrace, oldestTier, oldestSubmission, oldestAccumulation)
    const healthy = maxOverdue < OVERDUE_THRESHOLD

    // Recent cron logs
    const recentLogs = await prisma.cronLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    })

    return NextResponse.json({
      healthy,
      timestamp: now.toISOString(),
      stuckGraceCells: {
        count: stuckGraceCells.length,
        oldestOverdueMs: oldestGrace,
        items: stuckGraceCells.map(c => c.id),
      },
      stuckTiers: {
        count: stuckTiers.length,
        oldestOverdueMs: oldestTier,
        items: stuckTiers.map(t => ({ id: t.id, votingCells: t.votingCells })),
      },
      stuckSubmissions: {
        count: stuckSubmissions.length,
        oldestOverdueMs: oldestSubmission,
        items: stuckSubmissions.map(s => s.id),
      },
      stuckAccumulations: {
        count: stuckAccumulations.length,
        oldestOverdueMs: oldestAccumulation,
        items: stuckAccumulations.map(a => a.id),
      },
      recentCronLogs: recentLogs,
    })
  } catch (error) {
    console.error('Health check error:', error)
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
