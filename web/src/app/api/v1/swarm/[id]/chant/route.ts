import { NextRequest, NextResponse } from 'next/server'
import { swarmCtx, swarmErrorResponse } from '../shared'
import { chantSay } from '@/lib/swarm/service'
import { moderateContent } from '@/lib/moderation'

// POST /api/v1/swarm/:id/chant — {cellId, text}: one stance in the cell's subspace.
// Discussion is the open channel (ballots are sealed until the cell completes).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await swarmCtx(req, params, 'v1_write', { requireMember: true })
    if (ctx instanceof NextResponse) return ctx

    const body = await req.json()
    const cellId = String(body.cellId ?? '')
    const text = String(body.text ?? '').trim()
    if (!cellId || !text || text.length > 2000) {
      return NextResponse.json({ error: 'cellId and text (<= 2000 chars) required' }, { status: 422 })
    }
    const mod = moderateContent(text)
    if (!mod.allowed) return NextResponse.json({ error: `rejected: ${mod.reason}` }, { status: 422 })

    const comment = await chantSay(ctx.delib, ctx.userId, cellId, text)
    return NextResponse.json({ comment }, { status: 201 }) // readback
  } catch (e) {
    return swarmErrorResponse(e, 'v1/swarm/chant')
  }
}
