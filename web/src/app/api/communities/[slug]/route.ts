import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkCommunityAccess } from '@/lib/community'

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
