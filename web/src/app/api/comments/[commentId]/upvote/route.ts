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
    // Threshold: needs upvotes from X% of cell participants
    const cellParticipantCount = comment.cell.participants.length
    const currentUpvotes = comment.upvoteCount + 1 // +1 for the new upvote
    const currentTier = comment.reachTier

    // Up-pollinate threshold: 60% of current reach level
    // Tier 1 = 5 people, need 3 upvotes (60%)
    // Tier 2 = 25 people, need 15 upvotes
    // etc.
    const tierSizes = [5, 25, 125, 625, 3125, 15625, 78125, 390625, 1953125]
    const currentTierSize = tierSizes[currentTier - 1] || 5
    const threshold = Math.ceil(currentTierSize * 0.6)

    // Allow comments to up-pollinate one tier beyond their cell's tier
    // so they're ready when the next tier's cells load comments
    const maxReachTier = comment.cell.deliberation.currentTier + 1

    if (currentUpvotes >= threshold && currentTier < 9 && currentTier < maxReachTier) {
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
