import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'
import { checkRateLimit, incrementChatStrike } from '@/lib/rate-limit'


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

    // Get this cell's idea IDs for filtering
    const cellIdeaIds = cell.ideas.map(ci => ci.ideaId)

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

    // 2. Get UP-POLLINATED comments (idea-linked only)
    // Two paths:
    // A) Cross-tier: comments promoted via promoteTopComments (reachTier >= cell.tier)
    // B) Same-tier: comments spreading virally via spreadCount

    // Deterministic hash for spread visibility
    const hashPair = (a: string, b: string): number => {
      const str = a + b
      let hash = 0
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
      }
      return Math.abs(hash)
    }

    const shouldSeeComment = (commentId: string, targetCellId: string, spreadCount: number, totalCellsWithIdea: number): boolean => {
      if (spreadCount === 0) return false // origin cell only
      if (spreadCount >= totalCellsWithIdea) return true // reached all cells
      // Each upvote opens one more cell — deterministic hash picks which ones
      const hash = hashPair(commentId, targetCellId)
      return hash % totalCellsWithIdea < spreadCount
    }

    let upPollinatedComments: typeof localComments = []

    if (cellIdeaIds.length > 0) {
      // A) Cross-tier promoted comments: reachTier >= this cell's tier, from a different cell
      const crossTierComments = await prisma.comment.findMany({
        where: {
          ideaId: { in: cellIdeaIds },
          cellId: { not: cellId },
          reachTier: { gte: cell.tier },
          cell: { tier: { lt: cell.tier } }, // originated from a lower tier
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
      })

      // B) Same-tier viral spread: comments from other same-tier cells with shared ideas
      // Count total same-tier cells per idea (for spread calculation)
      const sameTierCellsWithIdeas = await prisma.cell.findMany({
        where: {
          deliberationId: cell.deliberationId,
          tier: cell.tier,
          id: { not: cellId },
          ideas: { some: { ideaId: { in: cellIdeaIds } } },
        },
        select: { id: true },
      })
      const totalSameTierCells = sameTierCellsWithIdeas.length + 1 // +1 for this cell

      // Fetch same-tier candidates: idea-linked, from other cells at same tier, with spreadCount > 0
      const sameTierCandidates = sameTierCellsWithIdeas.length > 0 ? await prisma.comment.findMany({
        where: {
          ideaId: { in: cellIdeaIds },
          cellId: { not: cellId },
          cell: { tier: cell.tier },
          spreadCount: { gte: 1 },
        },
        orderBy: [
          { spreadCount: 'desc' },
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
        take: 30,
      }) : []

      // Filter same-tier comments by spread radius
      const sameTierComments = sameTierCandidates.filter(comment =>
        shouldSeeComment(comment.id, cellId, comment.spreadCount, totalSameTierCells)
      )

      // Combine cross-tier and same-tier
      upPollinatedComments = [...crossTierComments, ...sameTierComments]
    }

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

    const body = await req.json()
    const { text, replyToId, ideaId } = body

    const limited = await checkRateLimit('comment', user.id)
    if (limited) {
      const { strike, mutedUntil } = incrementChatStrike(user.id)
      // Trigger challenge on spam
      prisma.user.update({ where: { id: user.id }, data: { lastChallengePassedAt: null } }).catch(() => {})
      if (mutedUntil) {
        return NextResponse.json({
          error: 'MUTED',
          mutedUntil,
          message: 'You have been temporarily muted.',
        }, { status: 429 })
      }
      return NextResponse.json({
        error: 'RATE_LIMITED',
        strike,
        message: 'Too many comments. Please slow down.',
      }, { status: 429 })
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
