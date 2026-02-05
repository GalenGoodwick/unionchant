import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/communities/invite/[code]/join - Join community via invite code
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
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

    const community = await prisma.community.findUnique({
      where: { inviteCode: code },
      select: { id: true, slug: true, isPublic: true, creatorId: true },
    })
    if (!community) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
    }

    // Check if already a member
    const existing = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: user.id } },
    })
    if (existing) {
      return NextResponse.json({ communitySlug: community.slug, alreadyMember: true })
    }

    // Enforce member cap for private groups based on creator's tier
    if (!community.isPublic) {
      const creator = await prisma.user.findUnique({
        where: { id: community.creatorId },
        select: { subscriptionTier: true },
      })
      const creatorTier = creator?.subscriptionTier || 'free'
      const memberCaps: Record<string, number> = { pro: 500, business: 5000 }
      if (creatorTier in memberCaps) {
        const memberCount = await prisma.communityMember.count({
          where: { communityId: community.id },
        })
        if (memberCount >= memberCaps[creatorTier]) {
          return NextResponse.json({
            error: 'MEMBER_LIMIT',
            message: `This group has reached its member limit of ${memberCaps[creatorTier].toLocaleString()}.`,
          }, { status: 403 })
        }
      }
    }

    await prisma.communityMember.create({
      data: {
        communityId: community.id,
        userId: user.id,
        role: 'MEMBER',
      },
    })

    return NextResponse.json({ communitySlug: community.slug }, { status: 201 })
  } catch (error) {
    console.error('Error joining community via invite:', error)
    return NextResponse.json({ error: 'Failed to join community' }, { status: 500 })
  }
}
