import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkCommunityAccess } from '@/lib/community'
import { isAdmin } from '@/lib/admin'

// GET /api/communities/[slug] - Community detail + deliberation list
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const session = await getServerSession(authOptions)
    const { allowed, role } = await checkCommunityAccess(slug, session?.user?.email)

    if (!allowed) {
      return NextResponse.json({ error: 'Community not found or access denied' }, { status: 404 })
    }

    const community = await prisma.community.findUnique({
      where: { slug },
      include: {
        creator: { select: { id: true, name: true, image: true, status: true } },
        _count: { select: { members: true, deliberations: true } },
        members: {
          take: 20,
          orderBy: { joinedAt: 'asc' },
          include: {
            user: { select: { id: true, name: true, image: true, status: true } },
          },
        },
        deliberations: {
          orderBy: { createdAt: 'desc' },
          include: {
            creator: { select: { id: true, name: true, status: true } },
            _count: { select: { members: true, ideas: true } },
          },
        },
      },
    })

    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    return NextResponse.json({ ...community, userRole: role })
  } catch (error) {
    console.error('Error fetching community:', error)
    return NextResponse.json({ error: 'Failed to fetch community' }, { status: 500 })
  }
}

// DELETE /api/communities/[slug] - Delete community (owner or admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { role } = await checkCommunityAccess(slug, session.user.email)
    const adminUser = await isAdmin(session.user.email)

    if (role !== 'OWNER' && !adminUser) {
      return NextResponse.json({ error: 'Only the group owner can delete it' }, { status: 403 })
    }

    const community = await prisma.community.findUnique({
      where: { slug },
      select: { id: true, name: true },
    })
    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    // Unlink deliberations (they keep their own isPublic setting)
    await prisma.deliberation.updateMany({
      where: { communityId: community.id },
      data: { communityId: null },
    })
    // Delete bans, messages, members, then community
    await prisma.communityBan.deleteMany({ where: { communityId: community.id } })
    await prisma.groupMessage.deleteMany({ where: { communityId: community.id } })
    await prisma.communityMember.deleteMany({ where: { communityId: community.id } })
    await prisma.community.delete({ where: { id: community.id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting community:', error)
    return NextResponse.json({ error: 'Failed to delete community' }, { status: 500 })
  }
}
