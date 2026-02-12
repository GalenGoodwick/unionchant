import { NextRequest, NextResponse } from 'next/server'
import { resolveSimulatorUser } from '@/lib/simulator-auth'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'

// GET /api/deliberations/[id]/flat-comments — Flat comment list (ChantSimulator format)
// Auth: NextAuth session OR CG signed token
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await resolveSimulatorUser(req)
    const currentUserId = auth.authenticated ? auth.user.id : null

    const comments = await prisma.comment.findMany({
      where: {
        cell: { deliberationId: id },
        ideaId: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, name: true, image: true },
        },
        upvotes: currentUserId ? {
          where: { userId: currentUserId },
          select: { id: true },
        } : false,
      },
    })

    const transformed = comments.map(comment => ({
      id: comment.id,
      text: comment.text,
      ideaId: comment.ideaId,
      createdAt: comment.createdAt,
      upvoteCount: comment.upvoteCount,
      spreadCount: comment.spreadCount,
      userHasUpvoted: currentUserId
        ? (comment.upvotes && Array.isArray(comment.upvotes) && comment.upvotes.length > 0)
        : false,
      user: {
        id: comment.user.id,
        name: comment.user.name,
        image: comment.user.image,
      },
    }))

    return NextResponse.json({ comments: transformed })
  } catch (error) {
    console.error('Error fetching flat comments:', error)
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
  }
}

// POST /api/deliberations/[id]/flat-comments — Post comment on an idea
// Auth: NextAuth session OR CG signed token
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await resolveSimulatorUser(req)

    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json()
    const { text, ideaId } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Comment text is required' }, { status: 400 })
    }

    if (text.trim().length > 2000) {
      return NextResponse.json({ error: 'Comment too long (max 2,000 characters)' }, { status: 400 })
    }

    if (!ideaId) {
      return NextResponse.json({ error: 'ideaId is required' }, { status: 400 })
    }

    const moderation = moderateContent(text)
    if (!moderation.allowed) {
      return NextResponse.json({ error: moderation.reason }, { status: 400 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: { id: true, phase: true, currentTier: true },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    // Verify idea belongs to this chant
    const idea = await prisma.idea.findFirst({
      where: { id: ideaId, deliberationId: id },
    })
    if (!idea) {
      return NextResponse.json({ error: 'Idea not found in this chant' }, { status: 400 })
    }

    // Find user's cell (any status)
    let cellId: string | null = null
    const participation = await prisma.cellParticipation.findFirst({
      where: {
        userId: auth.user.id,
        cell: { deliberationId: id },
      },
      orderBy: { joinedAt: 'desc' },
      select: { cellId: true },
    })

    if (participation) {
      cellId = participation.cellId
    } else {
      // No cell yet — find any cell to attach to
      const anyCell = await prisma.cell.findFirst({
        where: {
          deliberationId: id,
          status: 'VOTING',
          tier: deliberation.currentTier,
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })

      if (anyCell) {
        await prisma.deliberationMember.upsert({
          where: { deliberationId_userId: { userId: auth.user.id, deliberationId: id } },
          create: { userId: auth.user.id, deliberationId: id },
          update: {},
        })
        await prisma.cellParticipation.create({
          data: { cellId: anyCell.id, userId: auth.user.id, status: 'ACTIVE' },
        })
        cellId = anyCell.id
      } else {
        const fallbackCell = await prisma.cell.findFirst({
          where: { deliberationId: id },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        if (!fallbackCell) {
          return NextResponse.json({ error: 'No cells available for commenting' }, { status: 400 })
        }
        await prisma.deliberationMember.upsert({
          where: { deliberationId_userId: { userId: auth.user.id, deliberationId: id } },
          create: { userId: auth.user.id, deliberationId: id },
          update: {},
        })
        await prisma.cellParticipation.create({
          data: { cellId: fallbackCell.id, userId: auth.user.id, status: 'ACTIVE' },
        })
        cellId = fallbackCell.id
      }
    }

    const comment = await prisma.comment.create({
      data: {
        cellId: cellId!,
        userId: auth.user.id,
        text: text.trim(),
        ideaId,
      },
      include: {
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    })

    return NextResponse.json({
      id: comment.id,
      text: comment.text,
      ideaId: comment.ideaId,
      createdAt: comment.createdAt,
      upvoteCount: 0,
      userHasUpvoted: false,
      user: {
        id: comment.user.id,
        name: comment.user.name,
        image: comment.user.image,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Error posting comment:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to post comment: ${msg}` }, { status: 500 })
  }
}
