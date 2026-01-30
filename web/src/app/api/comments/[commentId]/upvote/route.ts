import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/comments/[commentId]/upvote - Upvote a comment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId } = await params
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

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        cell: {
          include: {
            participants: true,
            deliberation: {
              select: { currentTier: true },
            },
          },
        },
      },
    })

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    // Check if already upvoted
    const existingUpvote = await prisma.commentUpvote.findUnique({
      where: {
        commentId_userId: {
          commentId,
          userId: user.id,
        },
      },
    })

    if (existingUpvote) {
      // Remove upvote (toggle)
      await prisma.$transaction([
        prisma.commentUpvote.delete({
          where: { id: existingUpvote.id },
        }),
        prisma.comment.update({
          where: { id: commentId },
          data: { upvoteCount: { decrement: 1 } },
        }),
      ])

      return NextResponse.json({ upvoted: false })
    }

    // Add upvote (increment both total and tier-specific counts)
    await prisma.$transaction([
      prisma.commentUpvote.create({
        data: {
          commentId,
          userId: user.id,
        },
      }),
      prisma.comment.update({
        where: { id: commentId },
        data: {
          upvoteCount: { increment: 1 },
          tierUpvotes: { increment: 1 },
        },
      }),
    ])

    // Check if comment should up-pollinate (reach new tier)
    // Uses tierUpvotes (fresh per-tier engagement) not lifetime upvoteCount
    const currentTierUpvotes = comment.tierUpvotes + 1 // +1 for the new upvote
    const currentTier = comment.reachTier

    // Decreasing thresholds: comment already proved quality at lower tiers
    const thresholds = [3, 2, 2, 1, 1, 1, 1, 1, 1]
    const threshold = thresholds[currentTier - 1] || 1

    // Allow comments to up-pollinate one tier beyond their cell's tier
    // so they're ready when the next tier's cells load comments
    const maxReachTier = comment.cell.deliberation.currentTier + 1

    if (currentTierUpvotes >= threshold && currentTier < 9 && currentTier < maxReachTier) {
      // Up-pollinate to next tier!
      const newTier = Math.min(currentTier + 1, maxReachTier)
      await prisma.comment.update({
        where: { id: commentId },
        data: {
          reachTier: newTier,
          tierUpvotes: 0, // Reset tier upvotes for the new level
        },
      })

      // Create notification for comment author
      if (comment.userId !== user.id) {
        await prisma.notification.create({
          data: {
            userId: comment.userId,
            type: 'COMMENT_UP_POLLINATE',
            title: `Your comment reached Tier ${newTier}!`,
            body: comment.text.substring(0, 100),
            commentId,
            cellId: comment.cellId,
          },
        }).catch(err => console.error('Failed to create notification:', err))
      }

      return NextResponse.json({ upvoted: true, upPollinated: true, newTier })
    }

    // Create notification for comment author (if not self)
    if (comment.userId !== user.id) {
      await prisma.notification.create({
        data: {
          userId: comment.userId,
          type: 'COMMENT_UPVOTE',
          title: `${user.name || 'Someone'} upvoted your comment`,
          body: comment.text.substring(0, 100),
          commentId,
          cellId: comment.cellId,
        },
      }).catch(err => console.error('Failed to create notification:', err))
    }

    return NextResponse.json({ upvoted: true })
  } catch (error) {
    console.error('Error upvoting comment:', error)
    return NextResponse.json({ error: 'Failed to upvote' }, { status: 500 })
  }
}
