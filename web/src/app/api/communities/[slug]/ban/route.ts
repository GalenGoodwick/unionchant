import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCommunityMemberRole } from '@/lib/community'
import { checkRateLimit } from '@/lib/rate-limit'

// GET /api/communities/[slug]/ban — List banned users (owner/admin only)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const role = await getCommunityMemberRole(slug, user.id)
    if (role !== 'OWNER' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const community = await prisma.community.findUnique({ where: { slug }, select: { id: true } })
    if (!community) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const bans = await prisma.communityBan.findMany({
      where: { communityId: community.id },
      include: {
        user: { select: { id: true, name: true, image: true } },
        bannedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(bans)
  } catch (error) {
    console.error('List bans error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/communities/[slug]/ban — Ban a user from the group
// Body: { userId, reason? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const role = await getCommunityMemberRole(slug, user.id)
    if (role !== 'OWNER' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only owners and admins can ban users' }, { status: 403 })
    }

    // Rate limit ban actions (reuse 'join' config: 20/min)
    if (await checkRateLimit('join', user.id)) {
      return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 })
    }

    const { userId: targetUserId, reason } = await req.json()
    if (!targetUserId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const community = await prisma.community.findUnique({ where: { slug }, select: { id: true, creatorId: true } })
    if (!community) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    // Can't ban the owner
    if (targetUserId === community.creatorId) {
      return NextResponse.json({ error: 'Cannot ban the group owner' }, { status: 400 })
    }

    // Admin can't ban another admin
    const targetRole = await getCommunityMemberRole(slug, targetUserId)
    if (role === 'ADMIN' && targetRole === 'ADMIN') {
      return NextResponse.json({ error: 'Admins cannot ban other admins' }, { status: 403 })
    }

    // Already banned?
    const existingBan = await prisma.communityBan.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: targetUserId } },
    })
    if (existingBan) {
      return NextResponse.json({ error: 'User is already banned' }, { status: 400 })
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { name: true } })

    // Create ban + remove membership in a transaction
    await prisma.$transaction([
      prisma.communityBan.create({
        data: {
          communityId: community.id,
          userId: targetUserId,
          bannedById: user.id,
          reason: reason || null,
        },
      }),
      prisma.communityMember.deleteMany({
        where: { communityId: community.id, userId: targetUserId },
      }),
      // Notify the admin/owner who performed the ban
      prisma.notification.create({
        data: {
          userId: user.id,
          type: 'COMMUNITY_BAN',
          title: 'User banned',
          body: `${targetUser?.name || 'A user'} was banned from the group${reason ? `: ${reason}` : ''}`,
        },
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Ban user error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
