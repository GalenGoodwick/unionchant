import { NextRequest, NextResponse } from 'next/server'
import { verifyCGAuth } from '../../../auth'
import { resolveCGUser } from '@/lib/cg-user'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'

// POST /api/cg/chants/[id]/upvote — Toggle upvote on a comment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyCGAuth(req)
    if (!auth.authenticated) return auth.response

    await params // chant id not needed, just the comment
    const body = await req.json()
    const { cgUserId, cgUsername, cgImageUrl, commentId } = body

    if (!cgUserId || !cgUsername) {
      return NextResponse.json({ error: 'cgUserId and cgUsername required' }, { status: 400 })
    }

    if (!commentId) {
      return NextResponse.json({ error: 'commentId required' }, { status: 400 })
    }

    const user = await resolveCGUser(cgUserId, cgUsername, cgImageUrl)

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
      // Remove upvote (toggle off)
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

      return NextResponse.json({
        upvoted: false,
        upvoteCount: newUpvotes,
        upPollinated: false,
        spreadCount: newSpread,
      })
    }

    // Add upvote
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

    return NextResponse.json({
      upvoted: true,
      upvoteCount: newUpvotes,
      upPollinated: didSpread,
      spreadCount: newSpreadCount,
    })
  } catch (error) {
    console.error('Error upvoting CG comment:', error)
    return NextResponse.json({ error: 'Failed to upvote' }, { status: 500 })
  }
}
