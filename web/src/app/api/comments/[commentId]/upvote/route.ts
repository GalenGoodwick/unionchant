import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { notifyAgentOwner } from '@/lib/agent-notifications'

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

    const limited = await checkRateLimit('upvote', user.id)
    if (limited) {
      return NextResponse.json({ error: 'Too many upvotes. Slow down.' }, { status: 429 })
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
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
      // Recalculate spreadCount: floor((upvoteCount - 1) / 2) for idea-linked comments
      const newUpvotes = Math.max(0, comment.upvoteCount - 1)
      const newSpread = comment.ideaId ? Math.floor(newUpvotes / 2) : 0

      await prisma.$transaction([
        prisma.commentUpvote.delete({
          where: { id: existingUpvote.id },
        }),
        prisma.comment.update({
          where: { id: commentId },
          data: {
            upvoteCount: { decrement: 1 },
            spreadCount: newSpread,
          },
        }),
      ])

      return NextResponse.json({ upvoted: false })
    }

    // Add upvote — every 2 upvotes on an idea-linked comment spreads it to one more cell
    const isIdeaLinked = !!comment.ideaId
    const newUpvotes = comment.upvoteCount + 1
    const newSpreadCount = isIdeaLinked ? Math.floor(newUpvotes / 2) : 0
    const didSpread = isIdeaLinked && newSpreadCount > comment.spreadCount

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
          spreadCount: newSpreadCount,
        },
      }),
    ])

    // Notify comment author about spread (idea-linked only, on new spread)
    if (didSpread && comment.userId !== user.id) {
      await prisma.notification.create({
        data: {
          userId: comment.userId,
          type: 'COMMENT_UP_POLLINATE',
          title: 'Your comment is spreading to another cell',
          body: comment.text.substring(0, 100),
          commentId,
          cellId: comment.cellId,
        },
      }).catch(err => console.error('Failed to create notification:', err))

      // Notify agent owner if comment author is an AI agent
      const cell = await prisma.cell.findUnique({ where: { id: comment.cellId }, select: { deliberationId: true } })
      if (cell) {
        notifyAgentOwner({ type: 'comment_spread', commentId, agentId: comment.userId, deliberationId: cell.deliberationId })
      }

      return NextResponse.json({ upvoted: true, upPollinated: true, spreadCount: newSpreadCount })
    }

    // Regular upvote notification
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
