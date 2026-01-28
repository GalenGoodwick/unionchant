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

    // Increment view count (fire and forget)
    prisma.deliberation.update({
      where: { id },
      data: { views: { increment: 1 } },
    }).catch(err => console.error('Failed to increment deliberation views:', err))

    // Check if current user is a member/creator and get their submitted ideas
    let isMember = false
    let isCreator = false
    let userSubmittedIdea: { id: string; text: string } | null = null
    let userSubmittedChallenger: { id: string; text: string } | null = null

    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
      })
      if (user) {
        isCreator = user.id === deliberation.creatorId

        const membership = await prisma.deliberationMember.findUnique({
          where: {
            deliberationId_userId: {
              deliberationId: id,
              userId: user.id,
            },
          },
        })
        isMember = !!membership

        // Check if user has submitted an idea (regular submission)
        const existingIdea = await prisma.idea.findFirst({
          where: {
            deliberationId: id,
            authorId: user.id,
            isNew: false,
          },
          select: { id: true, text: true },
        })
        if (existingIdea) {
          userSubmittedIdea = existingIdea
        }

        // Check if user has submitted a challenger (pending)
        const existingChallenger = await prisma.idea.findFirst({
          where: {
            deliberationId: id,
            authorId: user.id,
            isNew: true,
            status: 'PENDING',
          },
          select: { id: true, text: true },
        })
        if (existingChallenger) {
          userSubmittedChallenger = existingChallenger
        }
      }
    }

    // Only include inviteCode for members or creator
    const response = {
      ...deliberation,
      isMember,
      isCreator,
      inviteCode: (isMember || isCreator) ? deliberation.inviteCode : undefined,
      userSubmittedIdea,
      userSubmittedChallenger,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching deliberation:', error)
    return NextResponse.json({ error: 'Failed to fetch deliberation' }, { status: 500 })
  }
}
