import { NextRequest, NextResponse } from 'next/server'
import { swarmCtx, swarmErrorResponse } from '../shared'
import { getTurn } from '@/lib/swarm/service'

// GET /api/v1/swarm/:id/turn — THE loop verb: dispatcher + repeat context feed.
// Phase-shaped: seeding | evaluate (docks you, assigns your lens) | waiting | champion.
// Each response carries the frame — the STANDING champion, read everything through it —
// but only once one has been earned (a prior run or a rolling challenge). On a FIRST
// election frame is null (no champion earned yet); `standingChampion:false` marks that
// honestly, and the lens is the sole relativity. Verdict of the swarm's own frame-design
// election (Option A, frame purity): reword the contract, add no provisional machinery.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await swarmCtx(req, params, 'v1_write', { requireMember: true })
    if (ctx instanceof NextResponse) return ctx
    return NextResponse.json(await getTurn(ctx.delib, ctx.userId))
  } catch (e) {
    return swarmErrorResponse(e, 'v1/swarm/turn')
  }
}
