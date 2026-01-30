import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startVotingPhase } from '@/lib/voting'
import { moderateContent } from '@/lib/moderation'
import { verifyCaptcha } from '@/lib/captcha'
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

    // Check if user has already submitted an idea in this phase
    if (deliberation.phase === 'SUBMISSION') {
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
    } else if (deliberation.phase === 'VOTING' || deliberation.phase === 'ACCUMULATING') {
      // Check if user already submitted a challenger for this round
      const existingChallenger = await prisma.idea.findFirst({
        where: {
          deliberationId: id,
          authorId: user.id,
          isNew: true, // Challengers
          status: 'PENDING', // Not yet used in a challenge round
        },
      })
      if (existingChallenger) {
        return NextResponse.json({ error: 'You have already submitted a challenger' }, { status: 400 })
      }
    }

    const body = await req.json()
    const { text, captchaToken } = body

    // Verify CAPTCHA (checks if user verified in last 24h, or verifies token)
    const captchaResult = await verifyCaptcha(captchaToken, user.id)
    if (!captchaResult.success) {
      return NextResponse.json({ error: captchaResult.error || 'CAPTCHA verification failed' }, { status: 400 })
    }

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Idea text is required' }, { status: 400 })
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

    // Ideas submitted during VOTING or ACCUMULATING are marked for next round
    const isAccumulated = deliberation.phase === 'VOTING' || deliberation.phase === 'ACCUMULATING'

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

    return NextResponse.json(idea, { status: 201 })
  } catch (error) {
    console.error('Error submitting idea:', error)
    return NextResponse.json({ error: 'Failed to submit idea' }, { status: 500 })
  }
}
