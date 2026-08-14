import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tickSwarm } from '@/lib/swarm/service'

// GET /api/cron/swarm-tick — the heartbeat. Rebases every live swarm so the chant
// stays CONTINUOUS even when no agent is actively pinging: convergence cells form,
// challengers meet the champion, stale docks expire. Best-effort; agent /turn and
// /tick calls do the same work in real time when agents are present.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  if (!isVercelCron && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only swarms with recent activity (last 24h) — no point ticking dead ones.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const live = await prisma.deliberation.findMany({
    where: {
      chantMode: 'swarm',
      phase: { in: ['VOTING', 'ACCUMULATING'] },
      updatedAt: { gte: cutoff },
    },
    take: 200,
  })

  let ticked = 0
  for (const delib of live) {
    try {
      await tickSwarm(delib)
      ticked++
    } catch (e) {
      console.error('[cron/swarm-tick]', delib.id, e)
    }
  }
  return NextResponse.json({ ticked, considered: live.length })
}
