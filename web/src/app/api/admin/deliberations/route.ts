import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'

// GET /api/admin/deliberations - List all deliberations (for admin)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const admin = await isAdmin(session.user.email)
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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
