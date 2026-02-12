import { NextRequest, NextResponse, after } from 'next/server'
import { verifyApiKey, requireScope } from '../../../auth'
import { v1RateLimit } from '../../../rate-limit'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'
import { Prisma } from '@prisma/client'
import { fireWebhookEvent } from '@/lib/webhooks'
import { recordTaskCompletion } from '@/lib/rate-limit'

// POST /api/v1/chants/:id/vote — Cast XP vote in your current cell
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr
    const rateErr = v1RateLimit('v1_write', auth.user.id)
    if (rateErr) return rateErr

    const { id } = await params
    const userId = auth.user.id

    const body = await req.json()
    const { allocations } = body as {
      allocations: { ideaId: string; points: number }[]
    }

    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json({ error: 'allocations required: [{ ideaId, points }]. Must total 10.' }, { status: 400 })
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

    const ideaIds = allocations.map(a => a.ideaId)
    if (new Set(ideaIds).size !== ideaIds.length) {
      return NextResponse.json({ error: 'Duplicate ideaId in allocations' }, { status: 400 })
    }

    // Find user's active cell in this deliberation
    const userCell = await prisma.cell.findFirst({
      where: {
        deliberationId: id,
        status: 'VOTING',
        participants: { some: { userId } },
      },
      select: { id: true },
    })

    if (!userCell) {
      return NextResponse.json({ error: 'No active voting cell found. You may not be assigned to a cell yet, or voting may not have started.' }, { status: 404 })
    }

    const cellId = userCell.id

    const result = await prisma.$transaction(async (tx) => {
      const cell = await tx.cell.findUnique({
        where: { id: cellId },
        include: {
          participants: true,
          ideas: true,
          votes: true,
          deliberation: {
            select: { currentTierStartedAt: true, votingTimeoutMs: true, allocationMode: true, cellSize: true },
          },
        },
      })

      if (!cell) throw new Error('CELL_NOT_FOUND')
      if (cell.status !== 'VOTING') throw new Error('CELL_NOT_VOTING')

      // Check deadline
      if (cell.votingDeadline && new Date(cell.votingDeadline) < new Date()) {
        throw new Error('DEADLINE_PASSED')
      }

      // Check all ideas are in this cell
      const cellIdeaIds = new Set(cell.ideas.map((ci: { ideaId: string }) => ci.ideaId))
      for (const a of allocations) {
        if (!cellIdeaIds.has(a.ideaId)) throw new Error('IDEA_NOT_IN_CELL')
      }

      // Delete existing votes
      const existingVotes = cell.votes.filter((v: { userId: string }) => v.userId === userId)
      if (existingVotes.length > 0) {
        await tx.$executeRaw`DELETE FROM "Vote" WHERE "cellId" = ${cellId} AND "userId" = ${userId}`
      }

      // Create votes via raw SQL (xpPoints invisible to Prisma runtime)
      const now = new Date()
      for (const a of allocations) {
        const voteId = `vt${Date.now()}${Math.random().toString(36).slice(2, 8)}`
        await tx.$executeRaw`
          INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
          VALUES (${voteId}, ${cellId}, ${userId}, ${a.ideaId}, ${a.points}, ${now})
        `
      }

      // Recalculate totalVotes and totalXP
      for (const ci of cell.ideas) {
        const ideaId = (ci as { ideaId: string }).ideaId
        const ideaVotes = await tx.$queryRaw<{ userId: string; xpPoints: number }[]>`
          SELECT "userId", "xpPoints" FROM "Vote" WHERE "cellId" = ${cellId} AND "ideaId" = ${ideaId}
        `
        const uniqueVoters = new Set(ideaVotes.map(v => v.userId)).size
        const xpSum = ideaVotes.reduce((sum, v) => sum + v.xpPoints, 0)
        await tx.$executeRaw`
          UPDATE "Idea" SET "totalVotes" = ${uniqueVoters}, "totalXP" = ${xpSum} WHERE id = ${ideaId}
        `
      }

      // Update participant status
      await tx.cellParticipation.updateMany({
        where: { cellId, userId },
        data: { status: 'VOTED', votedAt: now },
      })

      // Check completion
      const votedUserIds = await tx.$queryRaw<{ userId: string }[]>`
        SELECT DISTINCT "userId" FROM "Vote" WHERE "cellId" = ${cellId}
      `

      const isFCFS = cell.deliberation.allocationMode === 'fcfs'
      const fcfsCellSize = cell.deliberation.cellSize || 5

      let allVoted: boolean
      if (isFCFS) {
        allVoted = votedUserIds.length >= fcfsCellSize
      } else {
        const activeCount = cell.participants.filter(
          (p: { status: string }) => p.status === 'ACTIVE' || p.status === 'VOTED'
        ).length
        allVoted = votedUserIds.length >= activeCount
      }

      return { allocations, allVoted, isFCFS, voterCount: votedUserIds.length }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    })

    // Grace period + finalization
    if (result.allVoted) {
      const GRACE_PERIOD_MS = 10_000
      await prisma.cell.updateMany({
        where: { id: cellId, finalizesAt: null, status: 'VOTING' },
        data: { finalizesAt: new Date(Date.now() + GRACE_PERIOD_MS) },
      })
      after(async () => {
        await new Promise(resolve => setTimeout(resolve, GRACE_PERIOD_MS))
        const cell = await prisma.cell.findUnique({
          where: { id: cellId },
          select: { status: true, finalizesAt: true },
        })
        if (cell?.status === 'VOTING' && cell.finalizesAt && cell.finalizesAt <= new Date()) {
          await processCellResults(cellId, false).catch(err => {
            console.error(`v1 vote finalization failed for cell ${cellId}:`, err)
          })
        }
      })
    }

    // Fire webhook (fire-and-forget)
    fireWebhookEvent('vote_cast', {
      deliberationId: id,
      cellId,
      userId,
      allocations: result.allocations,
      allVoted: result.allVoted,
    })

    // For continuous flow: find next available cell across all tiers
    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: { continuousFlow: true, cellSize: true },
    })

    let nextCell: { id: string; tier: number; ideas: { id: string; text: string }[] } | null = null
    if (deliberation?.continuousFlow) {
      const fcfsSize = deliberation.cellSize || 5
      const votedParticipations = await prisma.cellParticipation.findMany({
        where: {
          userId,
          status: 'VOTED',
          cell: { deliberationId: id },
        },
        select: { cell: { select: { tier: true } } },
      })
      const votedTiers = new Set(votedParticipations.map(p => p.cell.tier))

      const openCells = await prisma.cell.findMany({
        where: {
          deliberationId: id,
          status: 'VOTING',
          ...(votedTiers.size > 0 ? { tier: { notIn: [...votedTiers] } } : {}),
        },
        include: {
          _count: { select: { participants: true } },
          ideas: {
            include: {
              idea: { select: { id: true, text: true } },
            },
          },
        },
        orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }],
      })

      const available = openCells.find(c => c._count.participants < fcfsSize)
      if (available) {
        nextCell = {
          id: available.id,
          tier: available.tier,
          ideas: available.ideas.map(ci => ({
            id: ci.idea.id,
            text: ci.idea.text,
          })),
        }
      }
    }

    recordTaskCompletion(userId)
    return NextResponse.json({
      voted: true,
      cellId,
      allocations: result.allocations,
      allVoted: result.allVoted,
      voterCount: result.voterCount,
      ...(nextCell ? { nextCell } : {}),
    }, { status: 201 })
  } catch (error) {
    if (error instanceof Error) {
      const map: Record<string, { msg: string; code: number }> = {
        'CELL_NOT_FOUND': { msg: 'Cell not found', code: 404 },
        'CELL_NOT_VOTING': { msg: 'Cell not in voting phase', code: 400 },
        'DEADLINE_PASSED': { msg: 'Voting deadline passed', code: 400 },
        'IDEA_NOT_IN_CELL': { msg: 'Idea not in your cell', code: 400 },
      }
      const m = map[error.message]
      if (m) return NextResponse.json({ error: m.msg }, { status: m.code })

      if (error.message.includes('could not serialize') || error.message.includes('deadlock')) {
        return NextResponse.json({ error: 'Busy, please retry', retryable: true }, { status: 409 })
      }
    }
    console.error('v1 vote error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
