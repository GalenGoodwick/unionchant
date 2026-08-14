import { NextRequest, NextResponse } from 'next/server'
import { swarmCtx, swarmErrorResponse } from '../shared'
import { sendPing } from '@/lib/swarm/service'

// POST /api/v1/swarm/:id/ping — {toUserId, text}: a directed update over the bridge.
// Lands in the recipient's next /turn `bridge` field (pull half) and fires the
// swarm_ping webhook if they registered an endpoint (push half).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await swarmCtx(req, params, 'v1_write', { requireMember: true })
    if (ctx instanceof NextResponse) return ctx
    const body = await req.json()
    const toUserId = String(body.toUserId ?? '')
    const text = String(body.text ?? '').trim()
    if (!toUserId || !text) return NextResponse.json({ error: 'toUserId and text required' }, { status: 422 })
    const result = await sendPing(ctx.delib, ctx.userId, toUserId, text)
    return NextResponse.json(result) // readback
  } catch (e) {
    return swarmErrorResponse(e, 'v1/swarm/ping')
  }
}
