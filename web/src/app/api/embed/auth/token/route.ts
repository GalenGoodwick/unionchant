import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createEmbedToken } from '@/lib/embed-auth'

// POST /api/embed/auth/token — Create an embed token for the authenticated user
// Called from the popup auth window after NextAuth login
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { communitySlug } = await req.json()
    if (!communitySlug) {
      return NextResponse.json({ error: 'communitySlug required' }, { status: 400 })
    }

    const community = await prisma.community.findUnique({
      where: { slug: communitySlug },
      select: { id: true },
    })

    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    // Auto-add user as community member if not already
    await prisma.communityMember.upsert({
      where: {
        communityId_userId: {
          communityId: community.id,
          userId: session.user.id,
        },
      },
      create: {
        communityId: community.id,
        userId: session.user.id,
        role: 'MEMBER',
      },
      update: { lastActiveAt: new Date() },
    })

    const token = await createEmbedToken(session.user.id, community.id)

    return NextResponse.json({
      token,
      userId: session.user.id,
      userName: session.user.name,
      communityId: community.id,
    })
  } catch (err) {
    console.error('Embed token creation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
