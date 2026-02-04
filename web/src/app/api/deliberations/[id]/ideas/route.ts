import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startVotingPhase, tryCreateContinuousFlowCell } from '@/lib/voting'
import { moderateContent } from '@/lib/moderation'
import { checkDeliberationAccess } from '@/lib/privacy'
import { checkRateLimit } from '@/lib/rate-limit'

// POST /api/deliberations/[id]/ideas - Submit a new idea
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Privacy gate
    const access = await checkDeliberationAccess(id, session.user.email)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Check if user is a member
    const membership = await prisma.deliberationMember.findUnique({
      where: {
        deliberationId_userId: {
          deliberationId: id,
          userId: user.id,
        },
      },
    })

    if (!membership) {
      return NextResponse.json({ error: 'Must be a member to submit ideas' }, { status: 403 })
    }

    // Email verification gate
    if (!user.emailVerified && user.passwordHash) {
      return NextResponse.json({
        error: 'Please verify your email before submitting ideas',
        code: 'EMAIL_NOT_VERIFIED',
      }, { status: 403 })
    }

    // Rate limit
    const limited = await checkRateLimit('idea', user.id)
    if (limited) {
      return NextResponse.json({ error: 'Too many submissions. Slow down.' }, { status: 429 })
    }

    // Check if deliberation is accepting submissions
    // Allow during SUBMISSION, VOTING (for accumulation), or ACCUMULATING phase
    if (deliberation.phase === 'COMPLETED') {
      return NextResponse.json({ error: 'Deliberation has ended' }, { status: 400 })
    }

    // Continuous flow: idea submission is open during voting
    const isContinuousFlow = deliberation.continuousFlow && deliberation.phase === 'VOTING'
    const isContinuousFlowTier1 = isContinuousFlow && deliberation.currentTier === 1

    // Check if user has already submitted an idea in this phase
    if (deliberation.phase === 'SUBMISSION' || isContinuousFlowTier1) {
      // Regular idea submission — one per user
      const existingIdea = await prisma.idea.findFirst({
        where: {
          deliberationId: id,
          authorId: user.id,
          isNew: false, // Regular submissions, not challengers
        },
      })
      if (existingIdea) {
        return NextResponse.json({ error: 'You have already submitted an idea' }, { status: 400 })
      }
    } else if (isContinuousFlow && deliberation.currentTier > 1) {
      // Continuous flow tier 2+: ideas pool for next round
      const existingChallenger = await prisma.idea.findFirst({
        where: {
          deliberationId: id,
          authorId: user.id,
          isNew: true,
          status: 'PENDING',
        },
      })
      if (existingChallenger) {
        return NextResponse.json({ error: 'You have already submitted an idea for the next round' }, { status: 400 })
      }
    } else if (deliberation.phase === 'VOTING' || deliberation.phase === 'ACCUMULATING') {
      // Non-continuous-flow: challenger submission pools for next round
      const existingChallenger = await prisma.idea.findFirst({
        where: {
          deliberationId: id,
          authorId: user.id,
          isNew: true,
          status: 'PENDING',
        },
      })
      if (existingChallenger) {
        return NextResponse.json({ error: 'You have already submitted a challenger' }, { status: 400 })
      }
    }

    const body = await req.json()
    const { text } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Idea text is required' }, { status: 400 })
    }
    if (text.trim().length > 500) {
      return NextResponse.json({ error: 'Idea too long (max 500 characters)' }, { status: 400 })
    }

    // Content moderation
    const moderation = moderateContent(text)
    if (!moderation.allowed) {
      return NextResponse.json({ error: moderation.reason }, { status: 400 })
    }

    // Check for duplicate idea text (case-insensitive)
    const normalizedText = text.trim().toLowerCase()
    const existingIdeas = await prisma.idea.findMany({
      where: { deliberationId: id },
      select: { text: true },
    })
    const isDuplicate = existingIdeas.some(
      idea => idea.text.trim().toLowerCase() === normalizedText
    )
    if (isDuplicate) {
      return NextResponse.json({ error: 'This idea has already been submitted' }, { status: 400 })
    }

    // Continuous flow tier 1: regular idea (SUBMITTED). Tier 2+ or non-CF: challenger (PENDING).
    const isAccumulated = (deliberation.phase === 'VOTING' || deliberation.phase === 'ACCUMULATING') && !isContinuousFlowTier1

    const idea = await prisma.idea.create({
      data: {
        deliberationId: id,
        authorId: user.id,
        text: text.trim(),
        isNew: isAccumulated,
        status: isAccumulated ? 'PENDING' : 'SUBMITTED',
      },
    })

    // Check if idea goal is met and auto-start voting
    if (deliberation.phase === 'SUBMISSION' && deliberation.ideaGoal) {
      const ideaCount = await prisma.idea.count({
        where: { deliberationId: id, status: 'SUBMITTED' }
      })

      if (ideaCount >= deliberation.ideaGoal) {
        try {
          await startVotingPhase(id)
        } catch (err) {
          console.error('Failed to auto-start voting on idea goal:', err)
        }
      }
    }

    // Continuous flow: try to create a new tier 1 cell from unassigned ideas
    if (isContinuousFlowTier1) {
      try {
        await tryCreateContinuousFlowCell(id)
      } catch (err) {
        console.error('Failed to create continuous flow cell:', err)
      }
    }

    return NextResponse.json(idea, { status: 201 })
  } catch (error) {
    console.error('Error submitting idea:', error)
    return NextResponse.json({ error: 'Failed to submit idea' }, { status: 500 })
  }
}
