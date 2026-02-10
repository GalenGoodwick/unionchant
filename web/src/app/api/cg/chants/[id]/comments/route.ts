import { NextRequest, NextResponse } from 'next/server'
import { verifyCGAuth } from '../../../auth'
import { resolveCGUser } from '@/lib/cg-user'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'

// GET /api/cg/chants/[id]/comments?cgUserId=... — Get all idea-linked comments for a chant
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyCGAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const cgUserId = req.nextUrl.searchParams.get('cgUserId')

    // Resolve current user for upvote status
    let currentUserId: string | null = null
    if (cgUserId) {
      const cgUser = await prisma.user.findFirst({ where: { cgId: cgUserId } })
      currentUserId = cgUser?.id || null
    }

    // Get all idea-linked comments across all cells in this deliberation
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
        idea: {
          select: { id: true, text: true },
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
    console.error('Error fetching CG comments:', error)
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
  }
}

// POST /api/cg/chants/[id]/comments — Post a comment on an idea
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyCGAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const body = await req.json()
    const { cgUserId, cgUsername, cgImageUrl, text, ideaId } = body

    if (!cgUserId || !cgUsername) {
      return NextResponse.json({ error: 'cgUserId and cgUsername required' }, { status: 400 })
    }

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Comment text is required' }, { status: 400 })
    }

    if (text.trim().length > 2000) {
      return NextResponse.json({ error: 'Comment too long (max 2,000 characters)' }, { status: 400 })
    }

    if (!ideaId) {
      return NextResponse.json({ error: 'ideaId is required' }, { status: 400 })
    }

    // Content moderation
    const moderation = moderateContent(text)
    if (!moderation.allowed) {
      return NextResponse.json({ error: moderation.reason }, { status: 400 })
    }

    const user = await resolveCGUser(cgUserId, cgUsername, cgImageUrl)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: { id: true, phase: true, currentTier: true },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    // Verify the idea belongs to this chant
    const idea = await prisma.idea.findFirst({
      where: { id: ideaId, deliberationId: id },
    })
    if (!idea) {
      return NextResponse.json({ error: 'Idea not found in this chant' }, { status: 400 })
    }

    // Find user's cell (ACTIVE or VOTED) at any tier
    let cellId: string | null = null
    const participation = await prisma.cellParticipation.findFirst({
      where: {
        userId: user.id,
        cell: { deliberationId: id },
      },
      orderBy: { joinedAt: 'desc' },
      select: { cellId: true },
    })

    if (participation) {
      cellId = participation.cellId
    } else {
      // User has no cell yet — find any VOTING cell at current tier to attach to
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
        // Enter user into this cell as a participant
        await prisma.deliberationMember.upsert({
          where: { deliberationId_userId: { userId: user.id, deliberationId: id } },
          create: { userId: user.id, deliberationId: id },
          update: {},
        })
        await prisma.cellParticipation.create({
          data: { cellId: anyCell.id, userId: user.id, status: 'ACTIVE' },
        })
        cellId = anyCell.id
      } else {
        // No voting cells — find any cell at all
        const fallbackCell = await prisma.cell.findFirst({
          where: { deliberationId: id },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        if (!fallbackCell) {
          return NextResponse.json({ error: 'No cells available for commenting' }, { status: 400 })
        }
        await prisma.deliberationMember.upsert({
          where: { deliberationId_userId: { userId: user.id, deliberationId: id } },
          create: { userId: user.id, deliberationId: id },
          update: {},
        })
        await prisma.cellParticipation.create({
          data: { cellId: fallbackCell.id, userId: user.id, status: 'ACTIVE' },
        })
        cellId = fallbackCell.id
      }
    }

    const comment = await prisma.comment.create({
      data: {
        cellId: cellId!,
        userId: user.id,
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
    console.error('Error creating CG comment:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to post comment: ${msg}` }, { status: 500 })
  }
}
