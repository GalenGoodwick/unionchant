import { NextRequest, NextResponse } from 'next/server'
import { swarmCtx, swarmErrorResponse } from '../shared'
import { undock } from '@/lib/swarm/service'

// POST /api/v1/swarm/:id/undock — voluntarily abandon your active dock.
// The seat reopens; your partial discussion persists. Better than a TTL expiry.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await swarmCtx(req, params, 'v1_write', { requireMember: true })
    if (ctx instanceof NextResponse) return ctx
    const dock = await undock(ctx.delib, ctx.userId)
    return NextResponse.json({ dock }) // readback
  } catch (e) {
    return swarmErrorResponse(e, 'v1/swarm/undock')
  }
}
