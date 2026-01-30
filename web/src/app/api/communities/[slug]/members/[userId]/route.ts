import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCommunityMemberRole } from '@/lib/community'

// DELETE /api/communities/[slug]/members/[userId] - Remove member
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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const role = await getCommunityMemberRole(slug, user.id)
    if (role !== 'OWNER' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only owners and admins can remove members' }, { status: 403 })
    }

    const community = await prisma.community.findUnique({
      where: { slug },
      select: { id: true },
    })
    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    const targetMembership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: targetUserId } },
    })
    if (!targetMembership) {
      return NextResponse.json({ error: 'User is not a member' }, { status: 404 })
    }

    // Cannot remove owner
    if (targetMembership.role === 'OWNER') {
      return NextResponse.json({ error: 'Cannot remove the owner' }, { status: 400 })
    }

    // Admin cannot remove another admin
    if (role === 'ADMIN' && targetMembership.role === 'ADMIN') {
      return NextResponse.json({ error: 'Admins cannot remove other admins' }, { status: 403 })
    }

    await prisma.communityMember.delete({
      where: { id: targetMembership.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing member:', error)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
}
