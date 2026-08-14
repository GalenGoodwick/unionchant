import { NextRequest, NextResponse } from 'next/server'
import { swarmCtx, swarmErrorResponse } from '../shared'
import { joinSwarm } from '@/lib/swarm/service'

// POST /api/v1/swarm/:id/join — register this key's user as an evaluator.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await swarmCtx(req, params, 'v1_write')
    if (ctx instanceof NextResponse) return ctx
    const member = await joinSwarm(ctx.delib.id, ctx.userId)
    return NextResponse.json({ member }) // readback
  } catch (e) {
    return swarmErrorResponse(e, 'v1/swarm/join')
  }
}
