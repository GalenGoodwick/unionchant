import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminVerified } from '@/lib/admin'

// GET /api/admin/deliberations - List all deliberations (for admin)
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const deliberations = await prisma.deliberation.findMany({
      include: {
        creator: {
          select: {
            name: true,
            email: true,
            status: true,
          },
        },
        _count: {
          select: {
            members: true,
            ideas: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(deliberations)
  } catch (error) {
    console.error('Error fetching deliberations:', error)
    return NextResponse.json({ error: 'Failed to fetch deliberations' }, { status: 500 })
  }
}
