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
    console.log(`[DELETE] Starting delete for deliberation ${id}`)

    // Clear spawnedFromId references (other deliberations spawned from this one)
    console.log('[DELETE] 1. Clearing spawnedFromId refs...')
    await prisma.deliberation.updateMany({
      where: { spawnedFromId: id },
      data: { spawnedFromId: null },
    })

    // Delete notifications
    console.log('[DELETE] 2. Deleting notifications...')
    await prisma.notification.deleteMany({
      where: { deliberationId: id },
    })

    // Delete predictions
    console.log('[DELETE] 3. Deleting predictions...')
    await prisma.prediction.deleteMany({
      where: { deliberationId: id },
    })

    // Delete watches
    console.log('[DELETE] 4. Deleting watches...')
    await prisma.watch.deleteMany({
      where: { deliberationId: id },
    })

    // Delete votes
    console.log('[DELETE] 5. Deleting votes...')
    await prisma.vote.deleteMany({
      where: { cell: { deliberationId: id } },
    })

    // Delete comment upvotes (before comments) - both cell-based and idea-based
    console.log('[DELETE] 6. Deleting comment upvotes...')
    await prisma.commentUpvote.deleteMany({
      where: {
        OR: [
          { comment: { cell: { deliberationId: id } } },
          { comment: { idea: { deliberationId: id } } },
        ]
      },
    })

    // Clear comment reply references (self-referencing FK) before deleting
    console.log('[DELETE] 7. Clearing comment replyToId refs...')
    await prisma.comment.updateMany({
      where: {
        OR: [
          { cell: { deliberationId: id } },
          { idea: { deliberationId: id } },
        ]
      },
      data: { replyToId: null },
    })

    // Delete comments (both cell-based and idea-based)
    console.log('[DELETE] 8. Deleting comments...')
    await prisma.comment.deleteMany({
      where: {
        OR: [
          { cell: { deliberationId: id } },
          { idea: { deliberationId: id } },
        ]
      },
    })

    // Delete cell ideas
    console.log('[DELETE] 9. Deleting cell ideas...')
    await prisma.cellIdea.deleteMany({
      where: { cell: { deliberationId: id } },
    })

    // Delete cell participations
    console.log('[DELETE] 10. Deleting cell participations...')
    await prisma.cellParticipation.deleteMany({
      where: { cell: { deliberationId: id } },
    })

    // Delete cells
    console.log('[DELETE] 11. Deleting cells...')
    await prisma.cell.deleteMany({
      where: { deliberationId: id },
    })

    // Delete ideas in batches to avoid timeout
    console.log('[DELETE] 12. Deleting ideas in batches...')
    let deletedIdeas = 0
    while (true) {
      const batch = await prisma.idea.findMany({
        where: { deliberationId: id },
        take: 100,
        select: { id: true },
      })
      if (batch.length === 0) break
      await prisma.idea.deleteMany({
        where: { id: { in: batch.map(i => i.id) } },
      })
      deletedIdeas += batch.length
      console.log(`[DELETE] Deleted ${deletedIdeas} ideas...`)
    }

    // Delete memberships
    console.log('[DELETE] 13. Deleting memberships...')
    await prisma.deliberationMember.deleteMany({
      where: { deliberationId: id },
    })

    // Delete the deliberation
    console.log('[DELETE] 14. Deleting deliberation...')
    await prisma.deliberation.delete({
      where: { id },
    })

    console.log(`[DELETE] Successfully deleted deliberation ${id}`)

    return NextResponse.json({ success: true, deleted: id })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : ''
    console.error('Error deleting deliberation:', errorMessage, error)
    // Write to file for debugging
    const fs = require('fs')
    fs.writeFileSync('/tmp/delete-error.log', `${new Date().toISOString()}\n${errorMessage}\n${errorStack}\n`)
    return NextResponse.json({ error: `Failed to delete deliberation: ${errorMessage}` }, { status: 500 })
  }
}
