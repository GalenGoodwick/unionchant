import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'

// POST /api/communities/[slug]/join - Join a public community
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

    const limited = await checkRateLimit('join', session.user.email)
    if (limited) {
      return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const community = await prisma.community.findUnique({
      where: { slug },
      select: { id: true, isPublic: true },
    })
    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    if (!community.isPublic) {
      return NextResponse.json({ error: 'This community is private. Use an invite link to join.' }, { status: 403 })
    }

    // Check if banned
    const ban = await prisma.communityBan.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: user.id } },
    })
    if (ban) {
      return NextResponse.json({ error: 'You have been banned from this group' }, { status: 403 })
    }

    // Check if already a member
    const existing = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: user.id } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Already a member' }, { status: 400 })
    }

    const member = await prisma.communityMember.create({
      data: {
        communityId: community.id,
        userId: user.id,
        role: 'MEMBER',
      },
    })

    return NextResponse.json(member, { status: 201 })
  } catch (error) {
    console.error('Error joining community:', error)
    return NextResponse.json({ error: 'Failed to join community' }, { status: 500 })
  }
}
