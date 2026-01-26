import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/deliberations/[id] - Get a single deliberation
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, name: true },
        },
        ideas: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: {
              select: { name: true },
            },
          },
        },
        _count: {
          select: { members: true },
        },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Check if current user is a member
    let isMember = false
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
      })
      if (user) {
        const membership = await prisma.deliberationMember.findUnique({
          where: {
            deliberationId_userId: {
              deliberationId: id,
              userId: user.id,
            },
          },
        })
        isMember = !!membership
      }
    }

    return NextResponse.json({ ...deliberation, isMember })
  } catch (error) {
    console.error('Error fetching deliberation:', error)
    return NextResponse.json({ error: 'Failed to fetch deliberation' }, { status: 500 })
  }
}
