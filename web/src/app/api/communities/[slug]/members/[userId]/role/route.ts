import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCommunityMemberRole } from '@/lib/community'

// POST /api/communities/[slug]/members/[userId]/role - Change member role
export async function POST(
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
    if (role !== 'OWNER') {
      return NextResponse.json({ error: 'Only owners can change roles' }, { status: 403 })
    }

    const body = await req.json()
    const { role: newRole } = body

    if (newRole !== 'ADMIN' && newRole !== 'MEMBER') {
      return NextResponse.json({ error: 'Role must be ADMIN or MEMBER' }, { status: 400 })
    }

    const community = await prisma.community.findUnique({
      where: { slug },
      select: { id: true },
    })
    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    // Cannot change owner's role
    if (targetUserId === user.id) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
    }

    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: targetUserId } },
    })
    if (!membership) {
      return NextResponse.json({ error: 'User is not a member' }, { status: 404 })
    }

    if (membership.role === 'OWNER') {
      return NextResponse.json({ error: 'Cannot change owner role' }, { status: 400 })
    }

    const updated = await prisma.communityMember.update({
      where: { id: membership.id },
      data: { role: newRole },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error changing role:', error)
    return NextResponse.json({ error: 'Failed to change role' }, { status: 500 })
  }
}
