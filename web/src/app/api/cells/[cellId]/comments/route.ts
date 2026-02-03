import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'

// GET /api/cells/[cellId]/comments - Get all comments for a cell (local + up-pollinated)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cellId: string }> }
) {
  try {
    const { cellId } = await params
    const session = await getServerSession(authOptions)

    // Get current user ID if logged in
    let currentUserId: string | null = null
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
      currentUserId = user?.id || null
    }

    // Get the cell to find its deliberation, tier, and IDEAS
    const cell = await prisma.cell.findUnique({
      where: { id: cellId },
      select: {
        deliberationId: true,
        tier: true,
        ideas: {
          select: { ideaId: true },
        },
      },
    })

    if (!cell) {
      return NextResponse.json({ error: 'Cell not found' }, { status: 404 })
    }

    // Get this cell's idea IDs for batch filtering
    const cellIdeaIds = cell.ideas.map(ci => ci.ideaId)

    // Find all cells that share at least one idea with this cell (same batch)
    const cellsWithSameIdeas = await prisma.cell.findMany({
      where: {
        deliberationId: cell.deliberationId,
        id: { not: cellId },
        ideas: {
          some: { ideaId: { in: cellIdeaIds } },
        },
      },
      select: { id: true },
    })
    const sameBatchCellIds = cellsWithSameIdeas.map(c => c.id)

    // 1. Get LOCAL comments (from this cell)
    const localComments = await prisma.comment.findMany({
      where: { cellId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, name: true, image: true, status: true },
        },
        cell: {
          select: { tier: true },
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

    // 2. Get UP-POLLINATED comments
    // Two sources:
    // A) Comments linked to ideas in this cell (follow idea across tiers)
    // B) Comments from same batch cells (original behavior)

    // A) Idea-linked comments: comments that are linked to ideas in this cell,
    // from previous tiers, with sufficient reachTier
    const ideaLinkedComments = cellIdeaIds.length > 0 ? await prisma.comment.findMany({
      where: {
        ideaId: { in: cellIdeaIds }, // Linked to ideas in this cell
        cellId: { not: cellId }, // Not from this cell (those are local)
        reachTier: { gte: cell.tier }, // Has reached this tier level
      },
      orderBy: [
        { upvoteCount: 'desc' },
        { createdAt: 'asc' },
      ],
      include: {
        user: {
          select: { id: true, name: true, image: true, status: true },
        },
        cell: {
          select: { tier: true },
        },
        idea: {
          select: { id: true, text: true },
        },
        upvotes: currentUserId ? {
          where: { userId: currentUserId },
          select: { id: true },
        } : false,
      },
      take: 20,
    }) : []

    // B) Batch comments (same ideas, different cells in same tier)
    // Deterministic check if this cell should see a comment
    const shouldShowComment = (commentId: string, targetCellId: string, reachTier: number, cellTier: number) => {
      if (reachTier >= cellTier) return true // Full reach = always show
      // Probability = 5^(reachTier - cellTier)
      const probability = Math.pow(5, reachTier - cellTier)
      // Deterministic hash based on comment+cell IDs (same cell always sees same comments)
      const hash = (commentId + targetCellId).split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)
      return (Math.abs(hash) % 1000) < (probability * 1000)
    }

    // Fetch batch candidates (comments from same-tier cells with same ideas)
    const batchCandidates = sameBatchCellIds.length > 0 ? await prisma.comment.findMany({
      where: {
        cellId: { in: sameBatchCellIds },
        reachTier: { gte: 1 },
        // Exclude idea-linked comments (already fetched above)
        ideaId: null,
      },
      orderBy: [
        { reachTier: 'desc' },
        { upvoteCount: 'desc' },
        { createdAt: 'asc' },
      ],
      include: {
        user: {
          select: { id: true, name: true, image: true, status: true },
        },
        cell: {
          select: { tier: true },
        },
        upvotes: currentUserId ? {
          where: { userId: currentUserId },
          select: { id: true },
        } : false,
      },
      take: 30,
    }) : []

    // Filter batch comments based on probabilistic reach
    const batchComments = batchCandidates.filter(comment =>
      shouldShowComment(comment.id, cellId, comment.reachTier, cell.tier)
    ).slice(0, 10)

    // Combine and dedupe
    const upPollinatedComments = [...ideaLinkedComments, ...batchComments]

    // Increment view count for local comments (fire and forget)
    prisma.comment.updateMany({
      where: { cellId },
      data: { views: { increment: 1 } },
    }).catch(err => console.error('Failed to increment views:', err))

    // Transform local comments
    const localWithStatus = localComments.map(comment => ({
      ...comment,
      userHasUpvoted: currentUserId ? (comment.upvotes && Array.isArray(comment.upvotes) && comment.upvotes.length > 0) : false,
      upvotes: undefined,
      isUpPollinated: false,
      sourceTier: comment.cell.tier,
      linkedIdea: comment.idea ? { id: comment.idea.id, text: comment.idea.text } : null,
      cell: undefined,
      idea: undefined,
    }))

    // Transform up-pollinated comments
    const upPollinatedWithStatus = upPollinatedComments.map(comment => {
      const idea = 'idea' in comment ? (comment as { idea?: { id: string; text: string } | null }).idea : null
      return {
        ...comment,
        userHasUpvoted: currentUserId ? (comment.upvotes && Array.isArray(comment.upvotes) && comment.upvotes.length > 0) : false,
        upvotes: undefined,
        isUpPollinated: true,
        sourceTier: comment.cell.tier,
        linkedIdea: idea ? { id: idea.id, text: idea.text } : null,
        cell: undefined,
        idea: undefined,
      }
    })

    // Dedupe - remove any upPollinated that are also in local
    const localIds = new Set(localWithStatus.map(c => c.id))
    const dedupedUpPollinated = upPollinatedWithStatus.filter(c => !localIds.has(c.id))

    return NextResponse.json({
      local: localWithStatus,
      upPollinated: dedupedUpPollinated,
      cellTier: cell.tier,
    })
  } catch (error) {
    console.error('Error fetching comments:', error)
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
  }
}

// POST /api/cells/[cellId]/comments - Add a comment to a cell
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cellId: string }> }
) {
  try {
    const { cellId } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const cell = await prisma.cell.findUnique({
      where: { id: cellId },
      include: { participants: true },
    })

    if (!cell) {
      return NextResponse.json({ error: 'Cell not found' }, { status: 404 })
    }

    // Check user is a participant in this cell
    const isParticipant = cell.participants.some((p: { userId: string }) => p.userId === user.id)
    if (!isParticipant) {
      return NextResponse.json({ error: 'Not a participant in this cell' }, { status: 403 })
    }

    const body = await req.json()
    const { text, replyToId, ideaId } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Comment text is required' }, { status: 400 })
    }
    if (text.trim().length > 2000) {
      return NextResponse.json({ error: 'Comment too long (max 2,000 characters)' }, { status: 400 })
    }

    // Validate ideaId if provided - must be an idea in this cell
    if (ideaId) {
      const ideaInCell = await prisma.cellIdea.findFirst({
        where: { cellId, ideaId },
      })
      if (!ideaInCell) {
        return NextResponse.json({ error: 'Idea not in this cell' }, { status: 400 })
      }
    }

    // Content moderation
    const moderation = moderateContent(text)
    if (!moderation.allowed) {
      return NextResponse.json({ error: moderation.reason }, { status: 400 })
    }

    const comment = await prisma.comment.create({
      data: {
        cellId,
        userId: user.id,
        text: text.trim(),
        replyToId: replyToId || null,
        ideaId: ideaId || null,
      },
      include: {
        user: {
          select: { id: true, name: true, image: true, status: true },
        },
        idea: ideaId ? {
          select: { id: true, text: true },
        } : false,
      },
    })

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    console.error('Error creating comment:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to create comment: ${message}` }, { status: 500 })
  }
}
