import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/communities/[slug]/preview — Public preview of a private group (name, description, member count)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    const community = await prisma.community.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        creator: { select: { name: true } },
        _count: { select: { members: true, deliberations: true } },
      },
    })

    if (!community) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Only return preview for private groups — public groups use the full endpoint
    if (community.isPublic) {
      return NextResponse.json({ error: 'Use the full endpoint for public groups' }, { status: 400 })
    }

    return NextResponse.json({
      id: community.id,
      name: community.name,
      description: community.description,
      creator: community.creator,
      _count: community._count,
    })
  } catch (error) {
    console.error('Error fetching community preview:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
