import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/communities/mine - List user's communities
export async function GET() {
  try {
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

    const memberships = await prisma.communityMember.findMany({
      where: { userId: user.id },
      include: {
        community: {
          include: {
            creator: { select: { name: true, status: true } },
            _count: { select: { members: true, deliberations: true } },
          },
        },
      },
      orderBy: { lastActiveAt: 'desc' },
    })

    const communities = memberships.map(m => ({
      ...m.community,
      role: m.role,
      joinedAt: m.joinedAt,
    }))

    return NextResponse.json(communities)
  } catch (error) {
    console.error('Error fetching user communities:', error)
    return NextResponse.json({ error: 'Failed to fetch communities' }, { status: 500 })
  }
}
