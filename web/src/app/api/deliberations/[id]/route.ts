import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkAndTransitionDeliberation } from '@/lib/timer-processor'

// GET /api/deliberations/[id] - Get a single deliberation
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    // Lazy evaluation: check for any pending timer transitions
    await checkAndTransitionDeliberation(id)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, name: true, status: true },
        },
        ideas: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: {
              select: { name: true, status: true },
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

    // Only include inviteCode for members or creator
    const response = {
      ...deliberation,
      isMember,
      inviteCode: isMember ? deliberation.inviteCode : undefined,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching deliberation:', error)
    return NextResponse.json({ error: 'Failed to fetch deliberation' }, { status: 500 })
  }
}
