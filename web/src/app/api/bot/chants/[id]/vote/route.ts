import { NextRequest, NextResponse, after } from 'next/server'
import { verifyBotAuth } from '../../../auth'
import { resolveDiscordUser } from '@/lib/bot-user'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'
import { Prisma } from '@prisma/client'

const FCFS_CELL_SIZE = 5

// POST /api/bot/chants/[id]/vote — Enter a cell + cast vote (FCFS mode)
// Body: { discordUserId, discordUsername, allocations: [{ideaId, points}] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const body = await req.json()
    const { discordUserId, discordUsername, allocations } = body

    if (!discordUserId || !discordUsername) {
      return NextResponse.json({ error: 'discordUserId and discordUsername required' }, { status: 400 })
    }

    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json({ error: 'allocations required: [{ideaId, points}]' }, { status: 400 })
    }

    const totalPoints = allocations.reduce((sum: number, a: { points: number }) => sum + a.points, 0)
    if (totalPoints !== 10) {
      return NextResponse.json({ error: `Must allocate exactly 10 XP (got ${totalPoints})` }, { status: 400 })
    }

    const user = await resolveDiscordUser(discordUserId, discordUsername)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
    }

    const isFCFS = deliberation.allocationMode === 'fcfs'

    // Check if user already voted in this tier
    const existingParticipation = await prisma.cellParticipation.findFirst({
      where: {
        userId: user.id,
        status: 'VOTED',
        cell: { deliberationId: id, tier: deliberation.currentTier },
      },
    })

    if (existingParticipation) {
      return NextResponse.json({ error: 'You already voted in this tier' }, { status: 400 })
    }

    // Check if user is already in an active cell
    let cellId: string | null = null
    const activeParticipation = await prisma.cellParticipation.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        cell: { deliberationId: id, tier: deliberation.currentTier, status: 'VOTING' },
      },
    })

    if (activeParticipation) {
      cellId = activeParticipation.cellId
    } else if (isFCFS) {
      // FCFS: auto-assign to oldest open cell
      const openCells = await prisma.cell.findMany({
        where: {
          deliberationId: id,
          tier: deliberation.currentTier,
          status: 'VOTING',
        },
        include: { _count: { select: { participants: true } } },
        orderBy: { createdAt: 'asc' },
      })

      const cellToJoin = openCells.find(c => c._count.participants < FCFS_CELL_SIZE)
      if (!cellToJoin) {
        return NextResponse.json({ error: 'All cells are full. Waiting for next round.' }, { status: 400 })
      }

      // Ensure membership
      await prisma.deliberationMember.upsert({
        where: { deliberationId_userId: { userId: user.id, deliberationId: id } },
        create: { userId: user.id, deliberationId: id },
        update: {},
      })

      await prisma.cellParticipation.create({
        data: { cellId: cellToJoin.id, userId: user.id, status: 'ACTIVE' },
      })

      cellId = cellToJoin.id
    } else {
      return NextResponse.json({ error: 'Not assigned to a cell. Use the enter endpoint first.' }, { status: 400 })
    }

    // Cast vote in a serializable transaction
    const result = await prisma.$transaction(async (tx) => {
      const cell = await tx.cell.findUnique({
        where: { id: cellId! },
        include: {
          participants: true,
          ideas: true,
          votes: true,
        },
      })

      if (!cell || cell.status !== 'VOTING') {
        throw new Error('CELL_NOT_VOTING')
      }

      // Verify all ideas are in this cell
      const cellIdeaIds = new Set(cell.ideas.map((ci: { ideaId: string }) => ci.ideaId))
      for (const a of allocations) {
        if (!cellIdeaIds.has(a.ideaId)) {
          throw new Error('IDEA_NOT_IN_CELL')
        }
      }

      // Delete existing votes
      await tx.$executeRaw`DELETE FROM "Vote" WHERE "cellId" = ${cellId} AND "userId" = ${user.id}`

      // Insert votes
      const now = new Date()
      for (const a of allocations as { ideaId: string; points: number }[]) {
        const voteId = `vt${Date.now()}${Math.random().toString(36).slice(2, 8)}`
        await tx.$executeRaw`
          INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
          VALUES (${voteId}, ${cellId}, ${user.id}, ${a.ideaId}, ${a.points}, ${now})
        `
      }

      // Recalculate idea totals across ALL cells (not just current)
      for (const ci of cell.ideas) {
        const ideaId = (ci as { ideaId: string }).ideaId
        const ideaVotes = await tx.$queryRaw<{ userId: string; xpPoints: number }[]>`
          SELECT "userId", "xpPoints" FROM "Vote" WHERE "ideaId" = ${ideaId}
        `
        const uniqueVoters = new Set(ideaVotes.map(v => v.userId)).size
        const xpSum = ideaVotes.reduce((sum, v) => sum + v.xpPoints, 0)
        await tx.$executeRaw`
          UPDATE "Idea" SET "totalVotes" = ${uniqueVoters}, "totalXP" = ${xpSum} WHERE id = ${ideaId}
        `
      }

      // Update participant status
      await tx.cellParticipation.updateMany({
        where: { cellId: cellId!, userId: user.id },
        data: { status: 'VOTED', votedAt: now },
      })

      // Check completion
      const votedUserIds = await tx.$queryRaw<{ userId: string }[]>`
        SELECT DISTINCT "userId" FROM "Vote" WHERE "cellId" = ${cellId}
      `

      let allVoted: boolean
      if (isFCFS) {
        allVoted = votedUserIds.length >= FCFS_CELL_SIZE
      } else {
        const activeCount = cell.participants.filter(
          (p: { status: string }) => p.status === 'ACTIVE' || p.status === 'VOTED'
        ).length
        allVoted = votedUserIds.length >= activeCount
      }

      return { allVoted, voterCount: votedUserIds.length }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    })

    // Handle cell completion
    if (result.allVoted) {
      const GRACE_PERIOD_MS = 5_000 // shorter grace for FCFS
      await prisma.cell.updateMany({
        where: { id: cellId!, finalizesAt: null, status: 'VOTING' },
        data: { finalizesAt: new Date(Date.now() + GRACE_PERIOD_MS) },
      })
      after(async () => {
        await new Promise(resolve => setTimeout(resolve, GRACE_PERIOD_MS))
        const cell = await prisma.cell.findUnique({
          where: { id: cellId! },
          select: { status: true, finalizesAt: true },
        })
        if (cell?.status === 'VOTING' && cell.finalizesAt && cell.finalizesAt <= new Date()) {
          await processCellResults(cellId!, false).catch(err => {
            console.error(`FCFS finalization failed for cell ${cellId}:`, err)
          })
        }
      })
    }

    // Get next open cell info (for bot to post "next cell available")
    let nextCell: { id: string; ideas: { id: string; text: string; author: string }[]; voterCount: number; votersNeeded: number } | null = null
    if (isFCFS && result.allVoted) {
      const openCells = await prisma.cell.findMany({
        where: {
          deliberationId: id,
          tier: deliberation.currentTier,
          status: 'VOTING',
          id: { not: cellId! },
        },
        include: {
          _count: { select: { participants: true } },
          ideas: {
            include: {
              idea: { select: { id: true, text: true, author: { select: { name: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      })

      const next = openCells.find(c => c._count.participants < FCFS_CELL_SIZE)
      if (next) {
        nextCell = {
          id: next.id,
          ideas: next.ideas.map(ci => ({ id: ci.idea.id, text: ci.idea.text, author: ci.idea.author?.name || 'Anonymous' })),
          voterCount: next._count.participants,
          votersNeeded: FCFS_CELL_SIZE,
        }
      }
    }

    // Current tier progress
    const tierCells = await prisma.cell.findMany({
      where: { deliberationId: id, tier: deliberation.currentTier },
      select: { status: true, _count: { select: { participants: true } } },
    })
    const completedCells = tierCells.filter(c => c.status === 'COMPLETED').length
    const totalCells = tierCells.length

    return NextResponse.json({
      success: true,
      cellId,
      cellCompleted: result.allVoted,
      voterCount: result.voterCount,
      votersNeeded: isFCFS ? FCFS_CELL_SIZE : undefined,
      progress: {
        completedCells: completedCells + (result.allVoted ? 1 : 0),
        totalCells,
        tierComplete: (completedCells + (result.allVoted ? 1 : 0)) >= totalCells,
      },
      nextCell,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof Error) {
      const errorMap: Record<string, { message: string; status: number }> = {
        'CELL_NOT_VOTING': { message: 'Cell is not in voting phase', status: 400 },
        'IDEA_NOT_IN_CELL': { message: 'Idea not in this cell', status: 400 },
      }
      const mapped = errorMap[error.message]
      if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status })
    }
    console.error('Error in bot vote:', error)
    return NextResponse.json({ error: 'Failed to vote' }, { status: 500 })
  }
}
