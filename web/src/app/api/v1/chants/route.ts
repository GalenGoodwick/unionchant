import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// GET /api/v1/chants — Browse active public chants
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response

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

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr

    const body = await req.json()
    const {
      question, description, context, isPublic = true, tags = [],
      continuousFlow = false, accumulationEnabled = false,
      ideaGoal, votingTimeoutMs, submissionDurationMs,
      discussionDurationMs, supermajorityEnabled, isPinned,
      allocationMode, cellSize, allowAI, callbackUrl, fastCell,
    } = body

    if (!question?.trim()) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 })
    }

    // Validate cellSize if provided
    if (cellSize !== undefined) {
      const cs = Number(cellSize)
      if (!Number.isInteger(cs) || cs < 3 || cs > 7) {
        return NextResponse.json({ error: 'cellSize must be an integer between 3 and 7' }, { status: 400 })
      }
    }

    // Validate callbackUrl if provided
    if (callbackUrl && typeof callbackUrl === 'string') {
      try {
        const url = new URL(callbackUrl)
        if (!['http:', 'https:'].includes(url.protocol)) {
          return NextResponse.json({ error: 'callbackUrl must be http or https' }, { status: 400 })
        }
      } catch {
        return NextResponse.json({ error: 'callbackUrl must be a valid URL' }, { status: 400 })
      }
    }

    const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    const submissionEndsAt = submissionDurationMs
      ? new Date(Date.now() + submissionDurationMs)
      : null

    const deliberation = await prisma.deliberation.create({
      data: {
        question: question.trim(),
        description: description?.trim() || null,
        context: context?.trim() || null,
        isPublic,
        inviteCode,
        tags: Array.isArray(tags) ? tags.slice(0, 5) : [],
        creatorId: auth.user.id,
        continuousFlow,
        accumulationEnabled,
        ...(ideaGoal && { ideaGoal }),
        ...(votingTimeoutMs !== undefined && { votingTimeoutMs }),
        ...(submissionDurationMs && { submissionDurationMs, submissionEndsAt }),
        ...(discussionDurationMs !== undefined && { discussionDurationMs }),
        ...(supermajorityEnabled !== undefined && { supermajorityEnabled }),
        ...(isPinned !== undefined && { isPinned }),
        allocationMode: allocationMode || 'fcfs',
        ...(cellSize !== undefined && { cellSize: Number(cellSize) }),
        ...(allowAI !== undefined && { allowAI: Boolean(allowAI) }),
        ...(fastCell !== undefined && { fastCell: Boolean(fastCell) }),
        members: {
          create: { userId: auth.user.id, role: 'CREATOR' },
        },
      },
    })

    // Auto-register callback webhook if callbackUrl provided
    if (callbackUrl && typeof callbackUrl === 'string') {
      const secret = crypto.randomBytes(16).toString('hex')
      await prisma.integration.create({
        data: {
          name: `callback-${deliberation.id.slice(0, 8)}`,
          webhookUrl: callbackUrl,
          secret,
          events: ['winner_declared', 'tier_complete'],
          userId: auth.user.id,
        },
      })
    }

    return NextResponse.json({
      id: deliberation.id,
      inviteCode,
      question: deliberation.question,
      phase: deliberation.phase,
      cellSize: deliberation.cellSize,
      allowAI: deliberation.allowAI,
      fastCell: deliberation.fastCell,
      ...(deliberation.context && { context: deliberation.context }),
    })
  } catch (err) {
    console.error('v1 create chant error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
