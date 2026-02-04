import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCommunityMemberRole } from '@/lib/community'

// DELETE /api/communities/[slug]/ban/[userId] — Unban a user
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  try {
    const { slug, userId: targetUserId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const role = await getCommunityMemberRole(slug, user.id)
    if (role !== 'OWNER' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only owners and admins can unban users' }, { status: 403 })
    }

    const community = await prisma.community.findUnique({ where: { slug }, select: { id: true } })
    if (!community) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const ban = await prisma.communityBan.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: targetUserId } },
    })
    if (!ban) {
      return NextResponse.json({ error: 'User is not banned' }, { status: 404 })
    }

    await prisma.communityBan.delete({ where: { id: ban.id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unban user error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
