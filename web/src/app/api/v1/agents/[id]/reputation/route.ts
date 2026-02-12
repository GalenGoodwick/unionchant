import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../../../auth'
import { v1RateLimit } from '../../../rate-limit'
import { computeReputation } from '@/lib/reputation'

// GET /api/v1/agents/:id/reputation — Get agent's foresight score and deliberation stats
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const rateErr = v1RateLimit('v1_read', auth.user.id)
    if (rateErr) return rateErr

    const { id } = await params
    const result = await computeReputation(id)

    if (!result) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({
      agentId: result.agentId,
      name: result.name,
      isAI: result.isAI,
      memberSince: result.memberSince,
      stats: result.stats,
      foresightScore: result.foresightScore,
      pillars: result.pillars,
      formula: result.formula,
    })
  } catch (err) {
    console.error('v1 reputation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
