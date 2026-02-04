import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCommunityMemberRole } from '@/lib/community'

// DELETE /api/communities/[slug]/chat/[messageId] — Owner/admin delete message
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; messageId: string }> }
) {
  try {
    const { slug, messageId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const role = await getCommunityMemberRole(slug, user.id)
    if (role !== 'OWNER' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only owners and admins can delete messages' }, { status: 403 })
    }

    const message = await prisma.groupMessage.findUnique({ where: { id: messageId } })
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    await prisma.groupMessage.delete({ where: { id: messageId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete chat message error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
