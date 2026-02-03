import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ONE_DAY_MS = 86400000

// POST /api/collective-chat/set-talk - Create or replace a collective Talk from a chat message
// Rate limited: free users = 1 change/day, pro users = unlimited
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Sign in to create a Talk' },
        { status: 401 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        subscriptionTier: true,
        lastCollectiveTalkChangeAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const { message, replaceExisting = false } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    if (message.trim().length > 2000) {
      return NextResponse.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 })
    }

    // Check if user already has a collective Talk
    const existingTalk = await prisma.deliberation.findFirst({
      where: { creatorId: user.id, fromCollective: true },
      select: { id: true, question: true },
    })

    if (existingTalk && !replaceExisting) {
      return NextResponse.json({
        error: 'HAS_EXISTING_TALK',
        existingTalk: { id: existingTalk.id, question: existingTalk.question },
        message: 'You already have a collective Talk. Setting a new one will delete it.',
      }, { status: 409 })
    }

    // Rate limit: free users can only change their Talk once per day
    if (user.subscriptionTier === 'free' && existingTalk) {
      if (user.lastCollectiveTalkChangeAt) {
        const timeSinceLastChange = Date.now() - user.lastCollectiveTalkChangeAt.getTime()
        if (timeSinceLastChange < ONE_DAY_MS) {
          const hoursLeft = Math.ceil((ONE_DAY_MS - timeSinceLastChange) / 3600000)
          return NextResponse.json({
            error: 'RATE_LIMITED',
            message: `Free accounts can change their Talk once per day. Try again in ${hoursLeft}h.`,
            hoursLeft,
          }, { status: 429 })
        }
      }
    }

    // If replacing, delete the old Talk first
    if (existingTalk && replaceExisting) {
      await deleteDeliberation(existingTalk.id)
      console.log(`[Set Talk] Deleted existing Talk ${existingTalk.id} for user ${user.id}`)
    }

    // Create a new Talk with default facilitation settings
    const inviteCode = Math.random().toString(36).substring(2, 10)
    const submissionDurationMs = 86400000 // 24 hours
    const newTalk = await prisma.deliberation.create({
      data: {
        creatorId: user.id,
        question: message.trim(),
        isPublic: true,
        fromCollective: true,
        phase: 'SUBMISSION',
        accumulationEnabled: true,
        submissionDurationMs,
        votingTimeoutMs: 3600000,
        secondVoteTimeoutMs: 900000,
        accumulationTimeoutMs: 86400000,
        inviteCode,
        submissionEndsAt: new Date(Date.now() + submissionDurationMs),
      },
    })

    // Add creator as member
    await prisma.deliberationMember.create({
      data: {
        deliberationId: newTalk.id,
        userId: user.id,
        role: 'CREATOR',
      },
    })

    // Update rate limit timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastCollectiveTalkChangeAt: new Date() },
    })

    console.log(`[Set Talk] Created Talk ${newTalk.id} for user ${user.id}`)

    return NextResponse.json({
      talk: { id: newTalk.id, question: newTalk.question },
    })
  } catch (error) {
    console.error('[Set Talk] POST error:', error)
    return NextResponse.json({ error: 'Failed to create Talk' }, { status: 500 })
  }
}

// ── Deliberation deletion (same pattern as admin endpoint) ────

async function deleteDeliberation(deliberationId: string) {
  const cells = await prisma.cell.findMany({
    where: { deliberationId },
    select: { id: true },
  })
  const cellIds = cells.map(c => c.id)

  const ideas = await prisma.idea.findMany({
    where: { deliberationId },
    select: { id: true },
  })
  const ideaIds = ideas.map(i => i.id)

  if (cellIds.length > 0) {
    await prisma.commentUpvote.deleteMany({ where: { comment: { cellId: { in: cellIds } } } })
    await prisma.comment.updateMany({
      where: { cellId: { in: cellIds }, replyToId: { not: null } },
      data: { replyToId: null },
    })
    await prisma.comment.deleteMany({ where: { cellId: { in: cellIds } } })
    await prisma.vote.deleteMany({ where: { cellId: { in: cellIds } } })
    await prisma.prediction.deleteMany({ where: { cellId: { in: cellIds } } })
    await prisma.cellParticipation.deleteMany({ where: { cellId: { in: cellIds } } })
    await prisma.cellIdea.deleteMany({ where: { cellId: { in: cellIds } } })
    await prisma.cell.deleteMany({ where: { id: { in: cellIds } } })
  }

  if (ideaIds.length > 0) {
    await prisma.notification.deleteMany({ where: { ideaId: { in: ideaIds } } })
  }

  await prisma.notification.deleteMany({ where: { deliberationId } })
  await prisma.prediction.deleteMany({ where: { deliberationId } })
  await prisma.watch.deleteMany({ where: { deliberationId } })
  await prisma.aIAgent.deleteMany({ where: { deliberationId } })
  await prisma.idea.deleteMany({ where: { deliberationId } })
  await prisma.deliberationMember.deleteMany({ where: { deliberationId } })
  await prisma.deliberation.delete({ where: { id: deliberationId } })
}
