import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// DELETE /api/admin/deliberations/[id] - Delete a deliberation
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: { creator: true },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Check if user is admin or the creator
    const isAdmin = isAdminEmail(session.user.email)
    const isCreator = deliberation.creator.email === session.user.email

    if (!isAdmin && !isCreator) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete in order due to foreign key constraints
    // Delete notifications (no FK, but clean up to prevent orphans)
    await prisma.notification.deleteMany({
      where: { deliberationId: id },
    })

    // Delete predictions
    await prisma.prediction.deleteMany({
      where: { deliberationId: id },
    })

    // Delete watches
    await prisma.watch.deleteMany({
      where: { deliberationId: id },
    })

    // Delete votes
    await prisma.vote.deleteMany({
      where: { cell: { deliberationId: id } },
    })

    // Delete comment upvotes (before comments)
    await prisma.commentUpvote.deleteMany({
      where: { comment: { cell: { deliberationId: id } } },
    })

    // Delete comments
    await prisma.comment.deleteMany({
      where: { cell: { deliberationId: id } },
    })

    // Delete cell ideas
    await prisma.cellIdea.deleteMany({
      where: { cell: { deliberationId: id } },
    })

    // Delete cell participations
    await prisma.cellParticipation.deleteMany({
      where: { cell: { deliberationId: id } },
    })

    // Delete cells
    await prisma.cell.deleteMany({
      where: { deliberationId: id },
    })

    // Delete ideas
    await prisma.idea.deleteMany({
      where: { deliberationId: id },
    })

    // Delete memberships
    await prisma.deliberationMember.deleteMany({
      where: { deliberationId: id },
    })

    // Delete the deliberation
    await prisma.deliberation.delete({
      where: { id },
    })

    return NextResponse.json({ success: true, deleted: id })
  } catch (error) {
    console.error('Error deleting deliberation:', error)
    return NextResponse.json({ error: 'Failed to delete deliberation' }, { status: 500 })
  }
}
