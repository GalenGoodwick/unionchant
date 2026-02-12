import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../../../auth'
import { v1RateLimit } from '../../../rate-limit'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'
import { recordTaskCompletion } from '@/lib/rate-limit'

// GET /api/v1/chants/:id/comment — Read comments in your cell
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const rateErr = v1RateLimit('v1_read', auth.user.id)
    if (rateErr) return rateErr

    const { id } = await params
    const userId = auth.user.id

    const cell = await prisma.cell.findFirst({
      where: {
        deliberationId: id,
        participants: { some: { userId } },
      },
      orderBy: { tier: 'desc' },
      select: { id: true, tier: true, ideas: { select: { ideaId: true } } },
    })

    if (!cell) {
      return NextResponse.json({ error: 'You are not in any cell for this chant' }, { status: 404 })
    }

    const comments = await prisma.comment.findMany({
      where: { cellId: cell.id },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, isAI: true } },
        idea: { select: { id: true, text: true } },
      },
    })

    const cellIdeaIds = cell.ideas.map(ci => ci.ideaId)
    const upPollinated = cellIdeaIds.length > 0 ? await prisma.comment.findMany({
      where: {
        ideaId: { in: cellIdeaIds },
        cellId: { not: cell.id },
        OR: [
          { reachTier: { gte: cell.tier }, cell: { tier: { lt: cell.tier } } },
          { spreadCount: { gte: 1 }, cell: { tier: cell.tier } },
        ],
      },
      orderBy: [{ upvoteCount: 'desc' }, { createdAt: 'asc' }],
      include: {
        user: { select: { id: true, name: true, isAI: true } },
        idea: { select: { id: true, text: true } },
      },
      take: 20,
    }) : []

    return NextResponse.json({
      cellId: cell.id,
      tier: cell.tier,
      comments: comments.map(c => ({
        id: c.id,
        text: c.text,
        author: c.user,
        idea: c.idea,
        upvotes: c.upvoteCount,
        replyToId: c.replyToId,
        createdAt: c.createdAt,
        isUpPollinated: false,
      })),
      upPollinated: upPollinated.map(c => ({
        id: c.id,
        text: c.text,
        author: c.user,
        idea: c.idea,
        upvotes: c.upvoteCount,
        createdAt: c.createdAt,
        isUpPollinated: true,
      })),
    })
  } catch (err) {
    console.error('v1 comments GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/v1/chants/:id/comment — Post a comment in your cell
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr
    const rateErr2 = v1RateLimit('v1_write', auth.user.id)
    if (rateErr2) return rateErr2

    const { id } = await params
    const userId = auth.user.id

    const body = await req.json()
    const { text, ideaId, replyToId } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }
    if (text.trim().length > 2000) {
      return NextResponse.json({ error: 'Comment too long (max 2,000 characters)' }, { status: 400 })
    }

    const moderation = moderateContent(text)
    if (!moderation.allowed) {
      return NextResponse.json({ error: moderation.reason }, { status: 400 })
    }

    const cell = await prisma.cell.findFirst({
      where: {
        deliberationId: id,
        participants: { some: { userId } },
        status: { in: ['DELIBERATING', 'VOTING'] },
      },
      include: { participants: true },
      orderBy: { tier: 'desc' },
    })

    if (!cell) {
      return NextResponse.json({ error: 'No active cell found' }, { status: 404 })
    }

    if (ideaId) {
      const ideaInCell = await prisma.cellIdea.findFirst({ where: { cellId: cell.id, ideaId } })
      if (!ideaInCell) {
        return NextResponse.json({ error: 'Idea not in this cell' }, { status: 400 })
      }
    }

    const comment = await prisma.comment.create({
      data: {
        cellId: cell.id,
        userId,
        text: text.trim(),
        ideaId: ideaId || null,
        replyToId: replyToId || null,
      },
      include: {
        user: { select: { id: true, name: true, isAI: true } },
        idea: ideaId ? { select: { id: true, text: true } } : false,
      },
    })

    recordTaskCompletion(userId)
    return NextResponse.json({
      id: comment.id,
      text: comment.text,
      author: comment.user,
      idea: 'idea' in comment ? comment.idea : null,
      cellId: cell.id,
      createdAt: comment.createdAt,
    }, { status: 201 })
  } catch (err) {
    console.error('v1 comment POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
