import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../../../auth'
import { prisma } from '@/lib/prisma'

// POST /api/v1/chants/:id/upvote — Upvote a comment (triggers up-pollination)
// Body: { commentId: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr

    const { id } = await params
    const userId = auth.user.id

    const body = await req.json()
    const { commentId } = body

    if (!commentId) {
      return NextResponse.json({ error: 'commentId is required' }, { status: 400 })
    }

    // Verify comment exists and belongs to a cell in this deliberation
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { cell: { select: { deliberationId: true } } },
    })

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    if (comment.cell.deliberationId !== id) {
      return NextResponse.json({ error: 'Comment does not belong to this chant' }, { status: 400 })
    }

    // Check if already upvoted
    const existing = await prisma.commentUpvote.findUnique({
      where: { commentId_userId: { commentId, userId } },
    })

    if (existing) {
      // Toggle off
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

    // Add upvote — every 2 upvotes spreads to one more cell
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

    // Notify on spread
    if (didSpread && comment.userId !== userId) {
      prisma.notification.create({
        data: {
          userId: comment.userId,
          type: 'COMMENT_UP_POLLINATE',
          title: 'Your comment is spreading to another cell',
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
