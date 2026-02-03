import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyCaptcha } from '@/lib/captcha'
import { sendEmail } from '@/lib/email'
import { followedNewDelibEmail } from '@/lib/email-templates'

// GET /api/deliberations - List all public deliberations
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const { searchParams } = new URL(req.url)
    const tag = searchParams.get('tag')

    let userId: string | null = null
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
      userId = user?.id ?? null
    }

    const deliberations = await prisma.deliberation.findMany({
      where: {
        isPublic: true,
        ...(tag ? { tags: { has: tag } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: { name: true, status: true },
        },
        ideas: {
          where: { status: 'WINNER' },
          select: { text: true },
          take: 1,
        },
        _count: {
          select: { members: true, ideas: true },
        },
        podiums: {
          select: { id: true, title: true },
          take: 1,
          orderBy: { createdAt: 'desc' as const },
        },
      },
    })

    // Check which deliberations the user has upvoted
    let upvotedIds = new Set<string>()
    if (userId) {
      const userUpvotes = await prisma.deliberationUpvote.findMany({
        where: {
          userId,
          deliberationId: { in: deliberations.map(d => d.id) },
        },
        select: { deliberationId: true },
      })
      upvotedIds = new Set(userUpvotes.map(u => u.deliberationId))
    }

    const result = deliberations.map(d => ({
      ...d,
      userHasUpvoted: upvotedIds.has(d.id),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching deliberations:', error)
    return NextResponse.json({ error: 'Failed to fetch deliberations' }, { status: 500 })
  }
}

// POST /api/deliberations - Create a new deliberation
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const {
      question,
      description,
      organization,
      isPublic = true,
      tags = [],
      submissionDurationMs,
      votingTimeoutMs,
      discussionDurationMs,
      accumulationEnabled,
      accumulationTimeoutMs,
      ideaGoal,
      captchaToken,
      // Community integration
      communityId,
      communityOnly,
    } = body

    // Verify CAPTCHA (checks if user verified in last 24h, or verifies token)
    const captchaResult = await verifyCaptcha(captchaToken, user.id)
    if (!captchaResult.success) {
      return NextResponse.json({ error: captchaResult.error || 'CAPTCHA verification failed' }, { status: 400 })
    }

    if (!question?.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    // Verify community membership and posting permission if communityId provided
    if (communityId) {
      const [membership, community] = await Promise.all([
        prisma.communityMember.findUnique({
          where: { communityId_userId: { communityId, userId: user.id } },
        }),
        prisma.community.findUnique({
          where: { id: communityId },
          select: { postingPermission: true },
        }),
      ])
      if (!membership) {
        return NextResponse.json({ error: 'You must be a member of this community' }, { status: 403 })
      }
      if (community?.postingPermission === 'admins' && membership.role === 'MEMBER') {
        return NextResponse.json({ error: 'Only community admins and owners can create deliberations in this community' }, { status: 403 })
      }
    }

    // Clean and validate tags
    const cleanTags = Array.isArray(tags)
      ? tags.map((t: string) => t.trim().toLowerCase()).filter((t: string) => t.length > 0).slice(0, 5)
      : []

    // Generate a short, readable invite code
    const inviteCode = Math.random().toString(36).substring(2, 10)

    // Calculate submission end time if duration provided
    const submissionEndsAt = submissionDurationMs
      ? new Date(Date.now() + submissionDurationMs)
      : null

    const deliberation = await prisma.deliberation.create({
      data: {
        question: question.trim(),
        description: description?.trim() || null,
        organization: organization?.trim() || null,
        isPublic,
        inviteCode,
        tags: cleanTags,
        creatorId: user.id,
        submissionEndsAt,
        ...(submissionDurationMs && { submissionDurationMs }),
        ...(votingTimeoutMs !== undefined && { votingTimeoutMs }),
        ...(discussionDurationMs !== undefined && { discussionDurationMs }),
        ...(accumulationEnabled !== undefined && { accumulationEnabled }),
        ...(accumulationTimeoutMs && { accumulationTimeoutMs }),
        // Goal-based auto-start
        ...(ideaGoal && { ideaGoal }),
        // Community integration
        ...(communityId && { communityId }),
        ...(communityOnly && communityId && { isPublic: false }),
        members: {
          create: {
            userId: user.id,
            role: 'CREATOR',
          },
        },
      },
    })

    // Notify followers (fire-and-forget)
    prisma.follow.findMany({
      where: { followingId: user.id },
      select: { followerId: true, follower: { select: { email: true } } },
    }).then(async (followers) => {
      if (followers.length === 0) return
      const userName = user.name || 'Someone'

      // Create in-app notifications
      await prisma.notification.createMany({
        data: followers.map(f => ({
          userId: f.followerId,
          type: 'FOLLOWED_NEW_DELIB',
          title: `${userName} created a new deliberation`,
          body: deliberation.question,
          deliberationId: deliberation.id,
        })),
      })

      // Send emails
      const template = followedNewDelibEmail({
        userName,
        question: deliberation.question,
        deliberationId: deliberation.id,
      })
      await Promise.allSettled(
        followers.map(f => sendEmail({ to: f.follower.email, ...template }))
      )
    }).catch(() => {})

    return NextResponse.json(deliberation, { status: 201 })
  } catch (error) {
    console.error('Error creating deliberation:', error)
    return NextResponse.json({ error: 'Failed to create deliberation' }, { status: 500 })
  }
}
