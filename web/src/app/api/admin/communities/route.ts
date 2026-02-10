import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminVerified } from '@/lib/admin'

// GET /api/admin/communities - List all communities
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const communities = await prisma.community.findMany({
      include: {
        creator: {
          select: { id: true, name: true, email: true, image: true },
        },
        _count: {
          select: {
            members: true,
            deliberations: true,
            chatMessages: true,
            bans: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(communities)
  } catch (error) {
    console.error('Error fetching communities:', error)
    return NextResponse.json({ error: 'Failed to fetch communities' }, { status: 500 })
  }
}
