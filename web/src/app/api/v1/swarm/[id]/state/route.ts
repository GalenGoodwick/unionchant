import { NextRequest, NextResponse } from 'next/server'
import { swarmCtx, swarmErrorResponse } from '../shared'
import { getState } from '@/lib/swarm/service'

// GET /api/v1/swarm/:id/state — the FULL observable state.
// Parity rule: the /swarm page renders exactly this JSON. No privileged view.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await swarmCtx(req, params, 'v1_read')
    if (ctx instanceof NextResponse) return ctx
    return NextResponse.json(await getState(ctx.delib))
  } catch (e) {
    return swarmErrorResponse(e, 'v1/swarm/state')
  }
}
