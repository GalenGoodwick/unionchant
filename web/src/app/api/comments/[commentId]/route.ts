import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isModerator } from '@/lib/admin'

// DELETE /api/comments/[commentId] - Soft-delete a comment
export async function DELETE(
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
      select: { id: true, email: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        cell: {
          include: {
            deliberation: { select: { id: true, creatorId: true } },
          },
        },
      },
    })

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    if (comment.isRemoved) {
      return NextResponse.json({ error: 'Comment already removed' }, { status: 400 })
    }

    // Permission check: comment author, deliberation creator, or moderator/admin
    const isAuthor = comment.userId === user.id
    const isDelibCreator = comment.cell.deliberation.creatorId === user.id
    const isMod = await isModerator(user.email)

    if (!isAuthor && !isDelibCreator && !isMod) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Soft-delete: replace text, mark as removed
    await prisma.comment.update({
      where: { id: commentId },
      data: {
        text: '[removed]',
        isRemoved: true,
        removedAt: new Date(),
        removedBy: user.id,
      },
    })

    // Remove upvotes on this comment
    await prisma.commentUpvote.deleteMany({
      where: { commentId },
    })

    // Reset upvote counts
    await prisma.comment.update({
      where: { id: commentId },
      data: {
        upvoteCount: 0,
        tierUpvotes: 0,
      },
    })

    // Notify comment author if removed by someone else
    if (!isAuthor) {
      await prisma.notification.create({
        data: {
          userId: comment.userId,
          type: 'CONTENT_REMOVED',
          title: 'Comment removed',
          body: 'Your comment was removed by a moderator.',
          deliberationId: comment.cell.deliberation.id,
          cellId: comment.cellId,
          commentId: comment.id,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting comment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
