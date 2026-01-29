import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyCaptcha } from '@/lib/captcha'

// GET /api/deliberations - List all public deliberations
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tag = searchParams.get('tag')

    const deliberations = await prisma.deliberation.findMany({
      where: {
        isPublic: true,
        // Exclude test deliberations that may have large data
        NOT: {
          OR: [
            { id: 'cmkyta0sm0000gwrq75mdepb3' },
            { question: { contains: '[TEST]' } },
          ],
        },
        ...(tag ? { tags: { has: tag } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: { name: true, status: true },
        },
        _count: {
          select: { members: true, ideas: true },
        },
      },
    })

    return NextResponse.json(deliberations)
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
      accumulationEnabled,
      accumulationTimeoutMs,
      ideaGoal,
      captchaToken,
      // Deliberation type
      type,
      // Spawn deliberation settings
      spawnsDeliberation,
      spawnedStartMode,
      spawnedSubmissionHours,
      spawnedIdeaGoal,
    } = body

    // Verify CAPTCHA (checks if user verified in last 24h, or verifies token)
    const captchaResult = await verifyCaptcha(captchaToken, user.id)
    if (!captchaResult.success) {
      return NextResponse.json({ error: captchaResult.error || 'CAPTCHA verification failed' }, { status: 400 })
    }

    if (!question?.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 })
    }

    // Validate mutual exclusivity
    if (spawnsDeliberation && accumulationEnabled) {
      return NextResponse.json({ error: 'Cannot enable both spawns deliberation and rolling mode' }, { status: 400 })
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
        ...(votingTimeoutMs && { votingTimeoutMs }),
        ...(accumulationEnabled !== undefined && { accumulationEnabled }),
        ...(accumulationTimeoutMs && { accumulationTimeoutMs }),
        // Goal-based auto-start
        ...(ideaGoal && { ideaGoal }),
        // Deliberation type
        ...(type && { type }),
        // Spawn deliberation settings
        ...(spawnsDeliberation !== undefined && { spawnsDeliberation }),
        ...(spawnedStartMode && { spawnedStartMode }),
        ...(spawnedSubmissionHours && { spawnedSubmissionHours }),
        ...(spawnedIdeaGoal && { spawnedIdeaGoal }),
        members: {
          create: {
            userId: user.id,
            role: 'CREATOR',
          },
        },
      },
    })

    return NextResponse.json(deliberation, { status: 201 })
  } catch (error) {
    console.error('Error creating deliberation:', error)
    return NextResponse.json({ error: 'Failed to create deliberation' }, { status: 500 })
  }
}
