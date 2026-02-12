import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../../../auth'
import { v1RateLimit } from '../../../rate-limit'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const rateErr = v1RateLimit('v1_read', auth.user.id)
    if (rateErr) return rateErr

    const { id } = await params

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        ideas: {
          select: { id: true, text: true, status: true, tier: true, authorId: true },
          orderBy: { createdAt: 'asc' },
        },
        cells: {
          select: {
            id: true, tier: true, status: true, batch: true,
            ideas: { select: { idea: { select: { id: true, text: true, status: true } } } },
            participants: { select: { userId: true } },
            votes: { select: { userId: true, ideaId: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { members: true } },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    // Find current champion if in rolling mode
    const champion = deliberation.accumulationEnabled
      ? deliberation.ideas.find(i => i.status === 'WINNER' || i.status === 'DEFENDING')
      : null

    // Count pending challenger ideas
    const pendingChallengers = deliberation.phase === 'ACCUMULATING'
      ? deliberation.ideas.filter(i => i.status === 'PENDING').length
      : 0

    const response: Record<string, unknown> = {
      id: deliberation.id,
      question: deliberation.question,
      phase: deliberation.phase,
      currentTier: deliberation.currentTier,
      continuousFlow: deliberation.continuousFlow,
      fastCell: deliberation.fastCell,
      accumulationEnabled: deliberation.accumulationEnabled,
      challengeRound: deliberation.challengeRound,
      members: deliberation._count.members,
      ideas: deliberation.ideas,
      cells: deliberation.cells.map(c => ({
        id: c.id,
        tier: c.tier,
        batch: c.batch,
        status: c.status,
        ideas: c.ideas.map(ci => ci.idea),
        participants: c.participants.length,
        votes: c.votes.length,
      })),
    }

    // Add champion/challenge info for rolling mode chants
    if (champion) {
      response.champion = { id: champion.id, text: champion.text }
    }
    if (deliberation.phase === 'ACCUMULATING') {
      response.challenge = {
        pendingChallengers,
        needed: 5,
        action: `Submit a challenger idea: POST /api/v1/chants/${deliberation.id}/ideas with {"text":"your challenger idea"}`,
      }
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('v1 status error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
