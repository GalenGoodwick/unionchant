import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// DELETE /api/admin/communities/[id] - Delete a community and all related data
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const community = await prisma.community.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true },
    })

    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    console.log(`[DELETE] Starting delete for community ${id} (${community.name})`)

    // Nullify communityId on deliberations (onDelete: SetNull would handle this,
    // but explicit is clearer in logs)
    console.log('[DELETE] 1. Unlinking deliberations...')
    const unlinked = await prisma.deliberation.updateMany({
      where: { communityId: id },
      data: { communityId: null },
    })
    console.log(`[DELETE] Unlinked ${unlinked.count} deliberations`)

    // Delete bans (onDelete: Cascade, but explicit for safety)
    console.log('[DELETE] 2. Deleting bans...')
    await prisma.communityBan.deleteMany({
      where: { communityId: id },
    })

    // Delete chat messages
    console.log('[DELETE] 3. Deleting chat messages...')
    await prisma.groupMessage.deleteMany({
      where: { communityId: id },
    })

    // Delete members
    console.log('[DELETE] 4. Deleting members...')
    await prisma.communityMember.deleteMany({
      where: { communityId: id },
    })

    // Delete the community
    console.log('[DELETE] 5. Deleting community...')
    await prisma.community.delete({
      where: { id },
    })

    console.log(`[DELETE] Successfully deleted community ${id}`)

    return NextResponse.json({ success: true, deleted: id })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Error deleting community:', errorMessage, error)
    return NextResponse.json({ error: `Failed to delete community: ${errorMessage}` }, { status: 500 })
  }
}
