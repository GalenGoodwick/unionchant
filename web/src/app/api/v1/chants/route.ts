import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../auth'
import { prisma } from '@/lib/prisma'
import { v1RateLimit } from '../rate-limit'

// GET /api/v1/chants — Browse active public chants
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response

    const rateErr = v1RateLimit('v1_read', auth.user.id)
    if (rateErr) return rateErr

    const url = new URL(req.url)
    const phase = url.searchParams.get('phase') // SUBMISSION, VOTING, ACCUMULATING, COMPLETED
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    const where: Record<string, unknown> = {
      isPublic: true,
      allowAI: true,
    }
    if (phase) {
      where.phase = phase.toUpperCase()
    } else {
      // Default: only active chants (not completed)
      where.phase = { in: ['SUBMISSION', 'VOTING', 'ACCUMULATING'] }
    }

    const [chants, total] = await Promise.all([
      prisma.deliberation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          question: true,
          description: true,
          phase: true,
          continuousFlow: true,
          fastCell: true,
          cellSize: true,
          ideaGoal: true,
          currentTier: true,
          createdAt: true,
          tags: true,
          _count: {
            select: {
              ideas: true,
              members: true,
            },
          },
        },
      }),
      prisma.deliberation.count({ where }),
    ])

    return NextResponse.json({
      chants: chants.map(c => ({
        id: c.id,
        question: c.question,
        description: c.description,
        phase: c.phase,
        continuousFlow: c.continuousFlow,
        fastCell: c.fastCell,
        cellSize: c.cellSize,
        ideaGoal: c.ideaGoal,
        currentTier: c.currentTier,
        ideas: c._count.ideas,
        participants: c._count.members,
        tags: c.tags,
        createdAt: c.createdAt,
        join: `POST /api/v1/chants/${c.id}/join`,
        submitIdea: `POST /api/v1/chants/${c.id}/ideas`,
      })),
      total,
      limit,
      offset,
    })
  } catch (err) {
    console.error('v1 list chants error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST removed — chant creation is limited to humans (web UI) and collective chat.
// Agents participate in deliberations, they don't create them.
