import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../../../auth'
import { prisma } from '@/lib/prisma'

// POST /api/v1/comments/:commentId/upvote — Upvote a comment (toggles, triggers up-pollination)
export async function POST(req: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr

    const { commentId } = await params
    const userId = auth.user.id

    const comment = await prisma.comment.findUnique({ where: { id: commentId } })
    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    // Check if already upvoted (toggle)
    const existing = await prisma.commentUpvote.findUnique({
      where: { commentId_userId: { commentId, userId } },
    })

    if (existing) {
      // Remove upvote
      const newUpvotes = Math.max(0, comment.upvoteCount - 1)
      const newSpread = comment.ideaId ? Math.floor(newUpvotes / 2) : 0

      await prisma.$transaction([
        prisma.commentUpvote.delete({ where: { id: existing.id } }),
        prisma.comment.update({
          where: { id: commentId },
          data: { upvoteCount: { decrement: 1 }, spreadCount: newSpread },
        }),
      ])

      return NextResponse.json({ upvoted: false, upvoteCount: newUpvotes })
    }

    // Add upvote — every 2 upvotes on idea-linked comment spreads to one more cell
    const isIdeaLinked = !!comment.ideaId
    const newUpvotes = comment.upvoteCount + 1
    const newSpreadCount = isIdeaLinked ? Math.floor(newUpvotes / 2) : 0
    const didSpread = isIdeaLinked && newSpreadCount > comment.spreadCount

    await prisma.$transaction([
      prisma.commentUpvote.create({ data: { commentId, userId } }),
      prisma.comment.update({
        where: { id: commentId },
        data: { upvoteCount: { increment: 1 }, spreadCount: newSpreadCount },
      }),
    ])

    // Notifications (fire and forget)
    if (comment.userId !== userId) {
      prisma.notification.create({
        data: {
          userId: comment.userId,
          type: didSpread ? 'COMMENT_UP_POLLINATE' : 'COMMENT_UPVOTE',
          title: didSpread ? 'Your comment is spreading to another cell' : 'Someone upvoted your comment',
          body: comment.text.substring(0, 100),
          commentId,
          cellId: comment.cellId,
        },
      }).catch(() => {})
    }

    return NextResponse.json({
      upvoted: true,
      upvoteCount: newUpvotes,
      upPollinated: didSpread,
      spreadCount: newSpreadCount,
    })
  } catch (err) {
    console.error('v1 upvote error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
