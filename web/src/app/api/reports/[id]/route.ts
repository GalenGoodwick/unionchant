import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'

// PATCH /api/reports/[id] - Resolve a report (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email || !(await isAdmin(session.user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 })
    }

    const body = await req.json()
    const { status, resolution, action } = body

    if (!status || !['RESOLVED', 'DISMISSED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const report = await prisma.report.findUnique({
      where: { id },
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // If resolving with action, take action on the reported content
    if (status === 'RESOLVED' && action) {
      switch (action) {
        case 'remove_comment':
          if (report.targetType === 'COMMENT') {
            const comment = await prisma.comment.findUnique({
              where: { id: report.targetId },
              select: { userId: true, cellId: true, cell: { select: { deliberationId: true } } },
            })
            if (comment && comment.cell) {
              await prisma.comment.update({
                where: { id: report.targetId },
                data: {
                  text: '[removed]',
                  isRemoved: true,
                  removedAt: new Date(),
                  removedBy: admin.id,
                },
              })
              await prisma.commentUpvote.deleteMany({ where: { commentId: report.targetId } })
              await prisma.comment.update({
                where: { id: report.targetId },
                data: { upvoteCount: 0, tierUpvotes: 0 },
              })
              // Notify author
              await prisma.notification.create({
                data: {
                  userId: comment.userId,
                  type: 'CONTENT_REMOVED',
                  title: 'Comment removed',
                  body: `Your comment was removed for: ${report.reason.toLowerCase().replace('_', ' ')}.`,
                  deliberationId: comment.cell.deliberationId,
                  cellId: comment.cellId,
                  commentId: report.targetId,
                },
              })
            }
          }
          break

        case 'remove_idea':
          if (report.targetType === 'IDEA') {
            const idea = await prisma.idea.findUnique({
              where: { id: report.targetId },
              select: { authorId: true, deliberationId: true },
            })
            if (idea) {
              await prisma.idea.update({
                where: { id: report.targetId },
                data: { text: '[removed]', status: 'ELIMINATED' },
              })
              await prisma.notification.create({
                data: {
                  userId: idea.authorId,
                  type: 'CONTENT_REMOVED',
                  title: 'Idea removed',
                  body: `Your idea was removed for: ${report.reason.toLowerCase().replace('_', ' ')}.`,
                  deliberationId: idea.deliberationId,
                },
              })
            }
          }
          break

        case 'ban_user':
          if (report.targetType === 'USER') {
            await prisma.user.update({
              where: { id: report.targetId },
              data: {
                status: 'BANNED',
                bannedAt: new Date(),
                banReason: `Banned via report: ${report.reason}`,
              },
            })
            await prisma.session.deleteMany({ where: { userId: report.targetId } })
          }
          break
      }
    }

    // Mark report as resolved
    const updated = await prisma.report.update({
      where: { id },
      data: {
        status,
        resolvedById: admin.id,
        resolvedAt: new Date(),
        resolution: resolution || action || null,
      },
    })

    // Also resolve any other pending reports on the same target
    await prisma.report.updateMany({
      where: {
        targetType: report.targetType,
        targetId: report.targetId,
        status: 'PENDING',
        id: { not: id },
      },
      data: {
        status,
        resolvedById: admin.id,
        resolvedAt: new Date(),
        resolution: `Resolved with report ${id}`,
      },
    })

    return NextResponse.json({ success: true, report: updated })
  } catch (error) {
    console.error('Error resolving report:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
