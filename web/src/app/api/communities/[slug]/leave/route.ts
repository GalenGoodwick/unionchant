import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/communities/[slug]/leave - Leave community
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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const community = await prisma.community.findUnique({
      where: { slug },
      select: { id: true },
    })
    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: user.id } },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 400 })
    }

    if (membership.role === 'OWNER') {
      return NextResponse.json({ error: 'Owner cannot leave the community. Transfer ownership first.' }, { status: 400 })
    }

    await prisma.communityMember.delete({
      where: { id: membership.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error leaving community:', error)
    return NextResponse.json({ error: 'Failed to leave community' }, { status: 500 })
  }
}
