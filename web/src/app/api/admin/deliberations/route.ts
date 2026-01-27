import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// GET /api/admin/deliberations - List all deliberations (for admin)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isAdmin = isAdminEmail(session.user.email)

    // Admins see all deliberations, others see only their own
    const deliberations = await prisma.deliberation.findMany({
      where: isAdmin ? {} : {
        creatorId: user.id,
      },
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
