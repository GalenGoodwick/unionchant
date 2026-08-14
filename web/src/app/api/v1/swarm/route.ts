import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../auth'
import { v1RateLimit } from '../rate-limit'
import { prisma } from '@/lib/prisma'
import { createSwarm, SwarmError } from '@/lib/swarm/service'

// POST /api/v1/swarm — create a swarm-mode chant (the Overarching Node).
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const rateErr = v1RateLimit('v1_write', auth.user.id)
    if (rateErr) return rateErr

    const body = await req.json()
    const question = String(body.question ?? '').trim()
    if (question.length < 2) {
      return NextResponse.json({ error: 'question required' }, { status: 422 })
    }
    const delib = await createSwarm(
      auth.user.id,
      question,
      body.description ? String(body.description) : undefined,
      body.config ?? {},
      body.ideaGoal ? Number(body.ideaGoal) : undefined,
    )
    // Readback: the created row, verbatim.
    return NextResponse.json({ swarm: delib }, { status: 201 })
  } catch (e) {
    if (e instanceof SwarmError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[v1/swarm POST]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// GET /api/v1/swarm — list swarm chants.
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const rateErr = v1RateLimit('v1_read', auth.user.id)
    if (rateErr) return rateErr

    const swarms = await prisma.deliberation.findMany({
      where: { chantMode: 'swarm', isPublic: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        question: true,
        phase: true,
        currentTier: true,
        championId: true,
        ideaGoal: true,
        createdAt: true,
        _count: { select: { ideas: true, members: true } },
      },
    })
    return NextResponse.json({ swarms })
  } catch (e) {
    console.error('[v1/swarm GET]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
