import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'
import { checkRateLimit } from '@/lib/rate-limit'
import { Prisma } from '@prisma/client'

// POST /api/cells/[cellId]/vote - Cast a vote
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cellId: string }> }
) {
  const { cellId } = await params

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

    // Email verification gate: OAuth users auto-verified, password users must verify
    if (!user.emailVerified && user.passwordHash) {
      return NextResponse.json({
        error: 'Please verify your email before voting',
        code: 'EMAIL_NOT_VERIFIED',
      }, { status: 403 })
    }

    // Rate limit
    const limited = await checkRateLimit('vote', user.id)
    if (limited) {
      return NextResponse.json({ error: 'Too many votes. Slow down.' }, { status: 429 })
    }

    const body = await req.json()
    const { ideaId } = body

    if (!ideaId) {
      return NextResponse.json({ error: 'Idea ID is required' }, { status: 400 })
    }

    // Use a transaction with serializable isolation to prevent race conditions
    // This ensures that concurrent votes are processed sequentially
    const result = await prisma.$transaction(async (tx) => {
      // Lock the cell row by selecting it within the transaction
      const cell = await tx.cell.findUnique({
        where: { id: cellId },
        include: {
          participants: true,
          ideas: true,
          votes: true,
          deliberation: {
            select: {
              currentTierStartedAt: true,
              votingTimeoutMs: true,
            },
          },
        },
      })

      if (!cell) {
        throw new Error('CELL_NOT_FOUND')
      }

      // Check user is a participant
      const isParticipant = cell.participants.some((p: { userId: string }) => p.userId === user.id)
      if (!isParticipant) {
        throw new Error('NOT_PARTICIPANT')
      }

      // Check cell is in voting status
      if (cell.status !== 'VOTING') {
        throw new Error('CELL_NOT_VOTING')
      }

      // Check voting deadline (calculated from tier start + timeout)
      if (cell.deliberation.currentTierStartedAt) {
        const deadline = new Date(
          cell.deliberation.currentTierStartedAt.getTime() + cell.deliberation.votingTimeoutMs
        )
        if (deadline < new Date()) {
          throw new Error('DEADLINE_PASSED')
        }
      }

      // Check idea is in this cell
      const ideaInCell = cell.ideas.some((ci: { ideaId: string }) => ci.ideaId === ideaId)
      if (!ideaInCell) {
        throw new Error('IDEA_NOT_IN_CELL')
      }

      // Check if already voted - allow changing vote
      const existingVote = cell.votes.find(
        (v: { userId: string; id: string; ideaId: string }) => v.userId === user.id
      )

      let vote
      if (existingVote) {
        // Changing vote - update existing
        const oldIdeaId = existingVote.ideaId

        vote = await tx.vote.update({
          where: { id: existingVote.id },
          data: { ideaId, votedAt: new Date() },
        })

        // Update idea vote counts
        if (oldIdeaId !== ideaId) {
          await tx.idea.update({
            where: { id: oldIdeaId },
            data: { totalVotes: { decrement: 1 } },
          })
          await tx.idea.update({
            where: { id: ideaId },
            data: { totalVotes: { increment: 1 } },
          })
        }
      } else {
        // New vote
        vote = await tx.vote.create({
          data: {
            cellId,
            userId: user.id,
            ideaId,
          },
        })

        // Update idea vote count
        await tx.idea.update({
          where: { id: ideaId },
          data: { totalVotes: { increment: 1 } },
        })
      }

      // Update participant status
      await tx.cellParticipation.updateMany({
        where: { cellId, userId: user.id },
        data: { status: 'VOTED', votedAt: new Date() },
      })

      // Check if all participants have voted (within same transaction)
      const voteCount = await tx.vote.count({
        where: { cellId },
      })

      const activeParticipantCount = cell.participants.filter(
        (p: { status: string }) => p.status === 'ACTIVE' || p.status === 'VOTED'
      ).length

      const allVoted = voteCount >= activeParticipantCount

      const wasChange = !!existingVote
      return { vote, allVoted, wasChange }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000, // 10 second timeout
    })

    // When all votes are in, start a 10-second grace period before finalizing.
    // Users can change their vote during this window but it doesn't extend it.
    // Timer processor will pick up cells with finalizesAt <= now and finalize them.
    if (result.allVoted) {
      const GRACE_PERIOD_MS = 10_000
      // Only set finalizesAt if not already set (first time all votes land)
      await prisma.cell.updateMany({
        where: { id: cellId, finalizesAt: null, status: 'VOTING' },
        data: { finalizesAt: new Date(Date.now() + GRACE_PERIOD_MS) },
      })
      // Note: No setTimeout — Vercel serverless functions terminate after response.
      // Timer processor (cron + feed request throttle) handles finalization.
    }

    // Notify followers about the vote (fire-and-forget, no email)
    prisma.cell.findUnique({
      where: { id: cellId },
      select: { deliberationId: true, deliberation: { select: { question: true } } },
    }).then(async (cellData) => {
      if (!cellData) return
      const followers = await prisma.follow.findMany({
        where: { followingId: user.id },
        select: { followerId: true },
      })
      if (followers.length === 0) return

      // Get deliberation members to exclude
      const memberIds = new Set(
        (await prisma.deliberationMember.findMany({
          where: { deliberationId: cellData.deliberationId },
          select: { userId: true },
        })).map(m => m.userId)
      )

      const userName = user.name || 'Someone'
      const question = cellData.deliberation.question
      const shortQuestion = question.length > 50 ? question.slice(0, 50) + '...' : question

      // For each follower not in the deliberation, check rate limit and create notification
      const toNotify = followers.filter(f => !memberIds.has(f.followerId))
      if (toNotify.length === 0) return

      // Rate limit: skip if already notified for this deliberation
      const existing = await prisma.notification.findMany({
        where: {
          userId: { in: toNotify.map(f => f.followerId) },
          type: 'FOLLOWED_VOTED',
          deliberationId: cellData.deliberationId,
        },
        select: { userId: true },
      })
      const alreadyNotified = new Set(existing.map(e => e.userId))
      const newNotifications = toNotify.filter(f => !alreadyNotified.has(f.followerId))

      if (newNotifications.length > 0) {
        await prisma.notification.createMany({
          data: newNotifications.map(f => ({
            userId: f.followerId,
            type: 'FOLLOWED_VOTED',
            title: `${userName} voted in "${shortQuestion}"`,
            deliberationId: cellData.deliberationId,
          })),
        })
      }
    }).catch(() => {})

    return NextResponse.json({
      ...result.vote,
      allVoted: result.allVoted,
    }, { status: 201 })
  } catch (error) {
    // Handle known errors
    if (error instanceof Error) {
      const errorMap: Record<string, { message: string; status: number }> = {
        'CELL_NOT_FOUND': { message: 'Cell not found', status: 404 },
        'NOT_PARTICIPANT': { message: 'Not a participant in this cell', status: 403 },
        'CELL_NOT_VOTING': { message: 'Cell is not in voting phase', status: 400 },
        'DEADLINE_PASSED': { message: 'Voting deadline has passed', status: 400 },
        'IDEA_NOT_IN_CELL': { message: 'Idea is not in this cell', status: 400 },
        'ALREADY_VOTED': { message: 'Already voted', status: 400 },
      }

      const mapped = errorMap[error.message]
      if (mapped) {
        // Process cell on deadline if someone tries to vote late
        if (error.message === 'DEADLINE_PASSED') {
          await processCellResults(cellId, true)
        }
        return NextResponse.json({ error: mapped.message }, { status: mapped.status })
      }

      // Handle Prisma unique constraint violation (double-click protection)
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json({ error: 'Already voted' }, { status: 400 })
      }
    }

    // Handle serialization failures (concurrent transaction conflicts) - these are retryable
    if (error instanceof Error &&
        (error.message.includes('could not serialize') ||
         error.message.includes('deadlock') ||
         error.message.includes('concurrent'))) {
      console.log('Vote transaction conflict, client should retry:', error.message)
      return NextResponse.json({ error: 'Busy, please retry', retryable: true }, { status: 409 })
    }

    console.error('Error casting vote:', error)
    return NextResponse.json({ error: 'Failed to cast vote' }, { status: 500 })
  }
}
