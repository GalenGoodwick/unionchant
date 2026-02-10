import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../auth'
import { resolveDiscordUser } from '@/lib/bot-user'
import { prisma } from '@/lib/prisma'

// DELETE /api/bot/chants/[id] — Delete a deliberation. Creator-only.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const body = await req.json()
    const { discordUserId, discordUsername } = body

    if (!discordUserId || !discordUsername) {
      return NextResponse.json({ error: 'discordUserId and discordUsername are required' }, { status: 400 })
    }

    const user = await resolveDiscordUser(discordUserId, discordUsername)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: { id: true, question: true, creatorId: true, isPinned: true },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.isPinned) {
      return NextResponse.json({ error: 'Cannot delete a pinned chant' }, { status: 403 })
    }

    // Block deletion if other users have submitted 5+ ideas
    const otherUserIdeas = await prisma.idea.count({
      where: { deliberationId: id, authorId: { not: deliberation.creatorId } },
    })
    if (otherUserIdeas >= 5) {
      return NextResponse.json({ error: `Cannot delete — ${otherUserIdeas} ideas submitted by other users` }, { status: 403 })
    }

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can delete this chant' }, { status: 403 })
    }

    // Full cascading delete (same as admin delete)
    console.log(`[Bot] Deleting deliberation ${id} (${deliberation.question})`)

    await prisma.notification.deleteMany({ where: { deliberationId: id } })
    await prisma.prediction.deleteMany({ where: { deliberationId: id } })
    await prisma.watch.deleteMany({ where: { deliberationId: id } })
    await prisma.vote.deleteMany({ where: { cell: { deliberationId: id } } })
    await prisma.commentUpvote.deleteMany({
      where: { OR: [{ comment: { cell: { deliberationId: id } } }, { comment: { idea: { deliberationId: id } } }] },
    })
    await prisma.comment.updateMany({
      where: { OR: [{ cell: { deliberationId: id } }, { idea: { deliberationId: id } }] },
      data: { replyToId: null },
    })
    await prisma.comment.deleteMany({
      where: { OR: [{ cell: { deliberationId: id } }, { idea: { deliberationId: id } }] },
    })
    await prisma.cellIdea.deleteMany({ where: { cell: { deliberationId: id } } })
    await prisma.cellParticipation.deleteMany({ where: { cell: { deliberationId: id } } })
    await prisma.cell.deleteMany({ where: { deliberationId: id } })
    await prisma.idea.deleteMany({ where: { deliberationId: id } })
    await prisma.deliberationMember.deleteMany({ where: { deliberationId: id } })
    await prisma.deliberation.delete({ where: { id } })

    console.log(`[Bot] Successfully deleted deliberation ${id}`)

    return NextResponse.json({ success: true, deleted: id })
  } catch (error) {
    console.error('Error deleting chant:', error)
    return NextResponse.json({ error: 'Failed to delete chant' }, { status: 500 })
  }
}
