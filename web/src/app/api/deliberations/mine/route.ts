import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/deliberations/mine - List deliberations created by the current user
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

    const deliberations = await prisma.deliberation.findMany({
      where: { creatorId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        question: true,
        phase: true,
        isPublic: true,
        organization: true,
        currentTier: true,
        createdAt: true,
        _count: {
          select: {
            members: true,
            ideas: true,
          },
        },
      },
    })

    return NextResponse.json(deliberations)
  } catch (error) {
    console.error('Error fetching creator deliberations:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}
