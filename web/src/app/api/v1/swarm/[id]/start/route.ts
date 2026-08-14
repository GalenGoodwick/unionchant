import { NextRequest, NextResponse } from 'next/server'
import { swarmCtx, swarmErrorResponse } from '../shared'
import { startSwarmVoting } from '@/lib/swarm/service'

// POST /api/v1/swarm/:id/start — creator manually opens voting.
// (With ideaGoal set, voting opens itself when the goal is reached.)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await swarmCtx(req, params, 'v1_write', { requireMember: true })
    if (ctx instanceof NextResponse) return ctx
    if (ctx.delib.creatorId !== ctx.userId) {
      return NextResponse.json({ error: 'only the creator can start voting' }, { status: 403 })
    }
    const delib = await startSwarmVoting(ctx.delib.id)
    return NextResponse.json({ swarm: { id: delib.id, phase: delib.phase, currentTier: delib.currentTier } })
  } catch (e) {
    return swarmErrorResponse(e, 'v1/swarm/start')
  }
}
