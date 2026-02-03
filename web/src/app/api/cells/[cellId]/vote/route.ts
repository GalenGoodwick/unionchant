import { NextRequest, NextResponse, after } from 'next/server'
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
    const { allocations } = body as {
      allocations: { ideaId: string; points: number }[]
    }

    // Validate allocations
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json({ error: 'Allocations are required (array of { ideaId, points })' }, { status: 400 })
    }

    const totalPoints = allocations.reduce((sum, a) => sum + a.points, 0)
    if (totalPoints !== 10) {
      return NextResponse.json({ error: `Must allocate exactly 10 XP (got ${totalPoints})` }, { status: 400 })
    }

    for (const a of allocations) {
      if (!a.ideaId || typeof a.points !== 'number' || a.points < 1 || !Number.isInteger(a.points)) {
        return NextResponse.json({ error: 'Each allocation needs ideaId and points >= 1 (integer)' }, { status: 400 })
      }
    }

    // Check for duplicate ideaIds
    const ideaIds = allocations.map(a => a.ideaId)
    if (new Set(ideaIds).size !== ideaIds.length) {
      return NextResponse.json({ error: 'Duplicate ideaId in allocations' }, { status: 400 })
    }

    // Use a transaction with serializable isolation to prevent race conditions
    const result = await prisma.$transaction(async (tx) => {
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

      // Check voting deadline — use cell-level deadline if set, otherwise deliberation-level
      if (cell.votingDeadline) {
        if (new Date(cell.votingDeadline) < new Date()) {
          throw new Error('DEADLINE_PASSED')
        }
      } else if (cell.deliberation.currentTierStartedAt && cell.deliberation.votingTimeoutMs > 0) {
        const deadline = new Date(
          cell.deliberation.currentTierStartedAt.getTime() + cell.deliberation.votingTimeoutMs
        )
        if (deadline < new Date()) {
          throw new Error('DEADLINE_PASSED')
        }
      }

      // Check all ideas are in this cell
      const cellIdeaIds = new Set(cell.ideas.map((ci: { ideaId: string }) => ci.ideaId))
      for (const a of allocations) {
        if (!cellIdeaIds.has(a.ideaId)) {
          throw new Error('IDEA_NOT_IN_CELL')
        }
      }

      // Check if this is a change (user already voted)
      const existingVotes = cell.votes.filter(
        (v: { userId: string }) => v.userId === user.id
      )
      const wasChange = existingVotes.length > 0

      // Delete existing votes for this user in this cell
      if (wasChange) {
        await tx.vote.deleteMany({
          where: { cellId, userId: user.id },
        })
      }

      // Create new vote records (one per allocation)
      const now = new Date()
      await tx.vote.createMany({
        data: allocations.map(a => ({
          cellId,
          userId: user.id,
          ideaId: a.ideaId,
          xpPoints: a.points,
          votedAt: now,
        })),
      })

      // Recalculate totalVotes and totalXP for all ideas in this cell
      for (const ci of cell.ideas) {
        const ideaId = (ci as { ideaId: string }).ideaId
        const ideaVotes = await tx.vote.findMany({
          where: { cellId, ideaId },
          select: { xpPoints: true, userId: true },
        })
        const uniqueVoters = new Set(ideaVotes.map(v => v.userId)).size
        const xpSum = ideaVotes.reduce((sum, v) => sum + v.xpPoints, 0)

        await tx.idea.update({
          where: { id: ideaId },
          data: { totalVotes: uniqueVoters, totalXP: xpSum },
        })
      }

      // Update participant status
      await tx.cellParticipation.updateMany({
        where: { cellId, userId: user.id },
        data: { status: 'VOTED', votedAt: now },
      })

      // Check if all participants have voted
      const votedUserIds = await tx.vote.findMany({
        where: { cellId },
        select: { userId: true },
        distinct: ['userId'],
      })

      const activeParticipantCount = cell.participants.filter(
        (p: { status: string }) => p.status === 'ACTIVE' || p.status === 'VOTED'
      ).length

      const allVoted = votedUserIds.length >= activeParticipantCount

      return { allocations, allVoted, wasChange }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    })

    // When all votes are in, start a 10-second grace period before finalizing.
    // Users can change their vote during this window but it doesn't extend it.
    if (result.allVoted) {
      const GRACE_PERIOD_MS = 10_000
      // Only set finalizesAt if not already set (first time all votes land)
      await prisma.cell.updateMany({
        where: { id: cellId, finalizesAt: null, status: 'VOTING' },
        data: { finalizesAt: new Date(Date.now() + GRACE_PERIOD_MS) },
      })
      // Schedule finalization after grace period using Next.js after() —
      // runs after the response is sent, keeps the function alive on Vercel.
      after(async () => {
        await new Promise(resolve => setTimeout(resolve, GRACE_PERIOD_MS))
        // Re-check the cell is still VOTING (hasn't been processed by timer-processor)
        const cell = await prisma.cell.findUnique({
          where: { id: cellId },
          select: { status: true, finalizesAt: true },
        })
        if (cell?.status === 'VOTING' && cell.finalizesAt && cell.finalizesAt <= new Date()) {
          await processCellResults(cellId, false).catch(err => {
            console.error(`after() finalization failed for cell ${cellId}:`, err)
          })
        }
      })
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
      allocations: result.allocations,
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
