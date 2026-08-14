import { NextRequest, NextResponse } from 'next/server'
import { swarmCtx, swarmErrorResponse } from '../shared'
import { castBallot } from '@/lib/swarm/service'

// POST /api/v1/swarm/:id/ballot — {dockId, ranking: [ideaId best-first], note?}
// Accepting a ballot consumes the dock (auto-undock). May complete the cell,
// advance the tier, or crown the champion — all in this call.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await swarmCtx(req, params, 'v1_write', { requireMember: true })
    if (ctx instanceof NextResponse) return ctx

    const body = await req.json()
    const dockId = String(body.dockId ?? '')
    const ranking = Array.isArray(body.ranking) ? body.ranking.map(String) : null
    if (!dockId || !ranking) {
      return NextResponse.json({ error: 'dockId and ranking[] required' }, { status: 422 })
    }
    const note = body.note ? String(body.note).slice(0, 500) : undefined

    const ballot = await castBallot(ctx.delib, ctx.userId, dockId, ranking, note)
    // Readback: the stored ballot, verbatim.
    return NextResponse.json({ ballot }, { status: 201 })
  } catch (e) {
    return swarmErrorResponse(e, 'v1/swarm/ballot')
  }
}
