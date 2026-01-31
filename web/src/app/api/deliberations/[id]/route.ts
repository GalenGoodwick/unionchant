import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkAndTransitionDeliberation } from '@/lib/timer-processor'
import { checkDeliberationAccess } from '@/lib/privacy'

// GET /api/deliberations/[id] - Get a single deliberation
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    // Privacy gate: check access before returning any data
    const access = await checkDeliberationAccess(id, session?.user?.email)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

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
              select: { id: true, name: true, status: true },
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
    let followedUserIds: string[] = []

    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
      })
      if (user) {
        isCreator = user.id === deliberation.creatorId

        // Collect all relevant user IDs (creator + idea authors)
        const relevantUserIds = new Set<string>()
        relevantUserIds.add(deliberation.creatorId)
        for (const idea of deliberation.ideas) {
          if (idea.authorId) relevantUserIds.add(idea.authorId)
        }
        relevantUserIds.delete(user.id) // can't follow yourself

        const [membership, existingIdea, existingChallenger, follows] = await Promise.all([
          prisma.deliberationMember.findUnique({
            where: {
              deliberationId_userId: {
                deliberationId: id,
                userId: user.id,
              },
            },
          }),
          prisma.idea.findFirst({
            where: {
              deliberationId: id,
              authorId: user.id,
              isNew: false,
            },
            select: { id: true, text: true },
          }),
          prisma.idea.findFirst({
            where: {
              deliberationId: id,
              authorId: user.id,
              isNew: true,
              status: 'PENDING',
            },
            select: { id: true, text: true },
          }),
          relevantUserIds.size > 0
            ? prisma.follow.findMany({
                where: {
                  followerId: user.id,
                  followingId: { in: [...relevantUserIds] },
                },
                select: { followingId: true },
              })
            : Promise.resolve([]),
        ])

        isMember = !!membership
        if (existingIdea) userSubmittedIdea = existingIdea
        if (existingChallenger) userSubmittedChallenger = existingChallenger
        followedUserIds = follows.map(f => f.followingId)
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
      followedUserIds,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching deliberation:', error)
    return NextResponse.json({ error: 'Failed to fetch deliberation' }, { status: 500 })
  }
}
