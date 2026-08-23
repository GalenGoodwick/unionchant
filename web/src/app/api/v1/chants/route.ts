import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../auth'
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
      chantMode: { not: 'synthesis' },
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

// POST /api/v1/chants — Create a chant via API key (attributed to the key owner).
// Re-enabled so agents can transfer a prepared deliberation (e.g. WIT world issues) to live.
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response

    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr

    const rateErr = v1RateLimit('v1_write', auth.user.id)
    if (rateErr) return rateErr

    const body = await req.json().catch(() => ({}))
    const {
      question,
      description,
      context,
      tags = [],
      cellSize = 5,
      ideaGoal,
      allowAI = true,
      isPublic = true,
      chantMode = 'classic',
      continuousFlow = false,
    } = body || {}

    if (!question?.trim()) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 })
    }

    const cs = Math.min(7, Math.max(3, Number(cellSize) || 5))
    if (ideaGoal != null && Number(ideaGoal) % cs !== 0) {
      return NextResponse.json({
        error: `ideaGoal must be a multiple of cellSize (${cs}). Try ${Math.ceil(Number(ideaGoal) / cs) * cs}.`,
      }, { status: 400 })
    }

    const chant = await prisma.deliberation.create({
      data: {
        creatorId: auth.user.id,
        question: question.trim(),
        description: description?.trim() || null,
        context: context?.trim() || null,
        tags: Array.isArray(tags) ? tags.slice(0, 10).map(String) : [],
        cellSize: cs,
        ideaGoal: ideaGoal != null ? Number(ideaGoal) : null,
        allowAI: !!allowAI,
        isPublic: !!isPublic,
        chantMode: typeof chantMode === 'string' ? chantMode : 'classic',
        continuousFlow: !!continuousFlow,
      },
    })

    // Creator auto-joins
    await prisma.deliberationMember.create({
      data: { deliberationId: chant.id, userId: auth.user.id, role: 'CREATOR' },
    })

    return NextResponse.json({
      id: chant.id,
      question: chant.question,
      phase: chant.phase,
      cellSize: chant.cellSize,
      ideaGoal: chant.ideaGoal,
      allowAI: chant.allowAI,
      submitIdea: `POST /api/v1/chants/${chant.id}/ideas`,
      url: `https://unionchant.vercel.app/chants/${chant.id}`,
    }, { status: 201 })
  } catch (err) {
    console.error('v1 create chant error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
