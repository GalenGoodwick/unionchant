import { NextRequest, NextResponse } from 'next/server'
import { resolveSimulatorUser } from '@/lib/simulator-auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'

// POST /api/deliberations/[id]/upvote-comment — Upvote a comment (unified auth)
// Body: { commentId }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params // validate route exists
    const auth = await resolveSimulatorUser(req)

    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json()
    const { commentId } = body

    if (!commentId) {
      return NextResponse.json({ error: 'commentId is required' }, { status: 400 })
    }

    const limited = await checkRateLimit('upvote', auth.user.id)
    if (limited) {
      return NextResponse.json({ error: 'Too many upvotes. Slow down.' }, { status: 429 })
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    })

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    const existingUpvote = await prisma.commentUpvote.findUnique({
      where: {
        commentId_userId: {
          commentId,
          userId: auth.user.id,
        },
      },
    })

    if (existingUpvote) {
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

      return NextResponse.json({ upvoted: false, upvoteCount: newUpvotes, spreadCount: newSpread })
    }

    const isIdeaLinked = !!comment.ideaId
    const newUpvotes = comment.upvoteCount + 1
    const newSpreadCount = isIdeaLinked ? Math.floor(newUpvotes / 2) : 0

    await prisma.$transaction([
      prisma.commentUpvote.create({
        data: {
          commentId,
          userId: auth.user.id,
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

    if (comment.userId !== auth.user.id) {
      const notifType = newSpreadCount > comment.spreadCount && isIdeaLinked
        ? 'COMMENT_UP_POLLINATE'
        : 'COMMENT_UPVOTE'
      const notifTitle = notifType === 'COMMENT_UP_POLLINATE'
        ? 'Your comment is spreading to another cell'
        : `${auth.user.name || 'Someone'} upvoted your comment`

      await prisma.notification.create({
        data: {
          userId: comment.userId,
          type: notifType,
          title: notifTitle,
          body: comment.text.substring(0, 100),
          commentId,
          cellId: comment.cellId,
        },
      }).catch(err => console.error('Failed to create notification:', err))
    }

    return NextResponse.json({ upvoted: true, upvoteCount: newUpvotes, spreadCount: newSpreadCount })
  } catch (error) {
    console.error('Error upvoting comment:', error)
    return NextResponse.json({ error: 'Failed to upvote' }, { status: 500 })
  }
}
