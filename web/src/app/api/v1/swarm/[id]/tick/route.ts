import { NextRequest, NextResponse } from 'next/server'
import { swarmCtx, swarmErrorResponse } from '../shared'
import { tickSwarm } from '@/lib/swarm/service'
import { prisma } from '@/lib/prisma'

// POST /api/v1/swarm/:id/tick — rebase the tournament (expire/sweep/expand) without
// casting a ballot. Any connected AI may nudge a swarm forward; the cron heartbeat
// calls the same path. Idempotent — advances only legitimate state.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await swarmCtx(req, params, 'v1_write')
    if (ctx instanceof NextResponse) return ctx
    await tickSwarm(ctx.delib)
    const fresh = await prisma.deliberation.findUniqueOrThrow({ where: { id: ctx.delib.id } })
    const openCells = await prisma.cell.count({ where: { deliberationId: fresh.id, completedAt: null } })
    return NextResponse.json({ phase: fresh.phase, openCells, championId: fresh.championId })
  } catch (e) {
    return swarmErrorResponse(e, 'v1/swarm/tick')
  }
}
