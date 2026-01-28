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
        upvotes: currentUserId ? {
          where: { userId: currentUserId },
          select: { id: true },
        } : false,
      },
    })

    // 2. Get UP-POLLINATED comments (from OTHER cells in SAME BATCH - sharing ideas)
    // Comments are shown to a % of CELLS based on reach tier vs deliberation tier
    // Formula: 5^(reachTier - cellTier) = probability this cell sees it
    // T2 comment at T3: 5^(2-3) = 5^-1 = 0.2 = 20% of T3 cells
    // T3 comment at T3: 5^(3-3) = 5^0 = 1 = 100% of T3 cells
    // T3 comment at T4: 5^(3-4) = 5^-1 = 0.2 = 20% of T4 cells

    // Deterministic check if this cell should see a comment
    const shouldShowComment = (commentId: string, targetCellId: string, reachTier: number, cellTier: number) => {
      if (reachTier >= cellTier) return true // Full reach = always show
      // Probability = 5^(reachTier - cellTier)
      const probability = Math.pow(5, reachTier - cellTier)
      // Deterministic hash based on comment+cell IDs (same cell always sees same comments)
      const hash = (commentId + targetCellId).split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)
      return (Math.abs(hash) % 1000) < (probability * 1000)
    }

    // Fetch candidates (comments that COULD be shown based on batch)
    const upPollinatedCandidates = sameBatchCellIds.length > 0 ? await prisma.comment.findMany({
      where: {
        cellId: { in: sameBatchCellIds }, // Only from cells with same ideas
        reachTier: { gte: 1 }, // Any promoted comment is a candidate
      },
      orderBy: [
        { reachTier: 'desc' }, // Higher reach first
        { upvoteCount: 'desc' }, // Then by popularity
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
      take: 50, // Fetch more candidates, filter down
    }) : []

    // Filter based on probabilistic reach
    const upPollinatedComments = upPollinatedCandidates.filter(comment =>
      shouldShowComment(comment.id, cellId, comment.reachTier, cell.tier)
    ).slice(0, 20) // Limit final results

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
      cell: undefined,
    }))

    // Transform up-pollinated comments
    const upPollinatedWithStatus = upPollinatedComments.map(comment => ({
      ...comment,
      userHasUpvoted: currentUserId ? (comment.upvotes && Array.isArray(comment.upvotes) && comment.upvotes.length > 0) : false,
      upvotes: undefined,
      isUpPollinated: true,
      sourceTier: comment.cell.tier,
      cell: undefined,
    }))

    return NextResponse.json({
      local: localWithStatus,
      upPollinated: upPollinatedWithStatus,
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
    const { text, replyToId } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Comment text is required' }, { status: 400 })
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
      },
      include: {
        user: {
          select: { id: true, name: true, image: true, status: true },
        },
      },
    })

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    console.error('Error creating comment:', error)
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
  }
}
