import { NextRequest, NextResponse, after } from 'next/server'
import { verifyCGAuth } from '../../../auth'
import { resolveCGUser } from '@/lib/cg-user'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'
import { Prisma } from '@prisma/client'

const FCFS_CELL_SIZE = 5

// POST /api/cg/chants/[id]/vote — Enter cell + cast vote (FCFS)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyCGAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const body = await req.json()
    const { cgUserId, cgUsername, cgImageUrl, allocations } = body

    if (!cgUserId || !cgUsername) {
      return NextResponse.json({ error: 'cgUserId and cgUsername required' }, { status: 400 })
    }

    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json({ error: 'allocations required: [{ideaId, points}]' }, { status: 400 })
    }

    const totalPoints = allocations.reduce((sum: number, a: { points: number }) => sum + a.points, 0)
    if (totalPoints !== 10) {
      return NextResponse.json({ error: `Must allocate exactly 10 XP (got ${totalPoints})` }, { status: 400 })
    }

    const user = await resolveCGUser(cgUserId, cgUsername, cgImageUrl)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
    }

    // Get cells user already voted in this tier
    const votedCellIds = await prisma.cellParticipation.findMany({
      where: {
        userId: user.id,
        status: 'VOTED',
        cell: { deliberationId: id, tier: deliberation.currentTier },
      },
      select: { cellId: true },
    }).then(ps => ps.map(p => p.cellId))

    // Normal mode: one vote per tier. Unlimited: one vote per cell, multiple cells allowed.
    if (!deliberation.multipleIdeasAllowed && votedCellIds.length > 0) {
      return NextResponse.json({ error: 'You already voted in this tier' }, { status: 400 })
    }

    // Check if user is already ACTIVE in a cell (entered but not yet voted)
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
    } else {
      // ── Batch-aware on-demand cell creation (round-robin across batches) ──
      const tierIdeas = await prisma.idea.findMany({
        where: { deliberationId: id, status: 'IN_VOTING', tier: deliberation.currentTier },
        select: { id: true, text: true },
        orderBy: { id: 'asc' },
      })

      if (tierIdeas.length === 0) {
        return NextResponse.json({ error: 'No ideas in voting at this tier.' }, { status: 400 })
      }

      // Compute batch groups deterministically
      const numBatches = Math.max(1, Math.ceil(tierIdeas.length / FCFS_CELL_SIZE))
      const batchIdeaGroups: typeof tierIdeas[] = []
      const basePer = Math.floor(tierIdeas.length / numBatches)
      const extraIdeas = tierIdeas.length % numBatches
      let bIdx = 0
      for (let b = 0; b < numBatches; b++) {
        const count = basePer + (b < extraIdeas ? 1 : 0)
        batchIdeaGroups.push(tierIdeas.slice(bIdx, bIdx + count))
        bIdx += count
      }

      // Get ALL cells at current tier for batch grouping
      const allTierCells = await prisma.cell.findMany({
        where: {
          deliberationId: id,
          tier: deliberation.currentTier,
          ...(votedCellIds.length > 0 ? { id: { notIn: votedCellIds } } : {}),
        },
        include: {
          _count: { select: { participants: true } },
          ideas: true,
        },
        orderBy: { createdAt: 'asc' },
      })

      const cellsByBatch = new Map<number, typeof allTierCells>()
      for (const cell of allTierCells) {
        const b = cell.batch ?? 0
        if (!cellsByBatch.has(b)) cellsByBatch.set(b, [])
        cellsByBatch.get(b)!.push(cell)
      }

      // Find best open cell (round-robin: least participants)
      let cellToJoin: typeof allTierCells[0] | null = null
      let minParticipants = FCFS_CELL_SIZE

      for (let b = 0; b < numBatches; b++) {
        const bCells = cellsByBatch.get(b) || []
        const open = bCells.find(c => c.status === 'VOTING' && c._count.participants < FCFS_CELL_SIZE)
        if (open && open._count.participants < minParticipants) {
          minParticipants = open._count.participants
          cellToJoin = open
        }
      }

      await prisma.deliberationMember.upsert({
        where: { deliberationId_userId: { userId: user.id, deliberationId: id } },
        create: { userId: user.id, deliberationId: id },
        update: {},
      })

      if (cellToJoin) {
        await prisma.cellParticipation.create({
          data: { cellId: cellToJoin.id, userId: user.id, status: 'ACTIVE' },
        })
        cellId = cellToJoin.id
      } else {
        // No open cell — create new cell in batch with fewest total participants
        let createBatch = 0
        let minTotal = Infinity
        for (let b = 0; b < numBatches; b++) {
          const bCells = cellsByBatch.get(b) || []
          const total = bCells.reduce((sum, c) => sum + c._count.participants, 0)
          if (total < minTotal) {
            minTotal = total
            createBatch = b
          }
        }

        // If this batch already has cells, use same ideas for consistency
        const existingBatchCells = cellsByBatch.get(createBatch) || []
        const cellIdeaIds: string[] = existingBatchCells.length > 0 && existingBatchCells[0].ideas?.length > 0
          ? existingBatchCells[0].ideas.map((ci: { ideaId: string }) => ci.ideaId)
          : batchIdeaGroups[createBatch].map(i => i.id)

        const newCell = await prisma.cell.create({
          data: {
            deliberationId: id,
            tier: deliberation.currentTier,
            batch: createBatch,
            status: 'VOTING',
            ideas: { create: cellIdeaIds.map((id: string) => ({ ideaId: id })) },
          },
        })

        await prisma.cellParticipation.create({
          data: { cellId: newCell.id, userId: user.id, status: 'ACTIVE' },
        })
        cellId = newCell.id
      }
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

      const cellIdeaIds = new Set(cell.ideas.map((ci: { ideaId: string }) => ci.ideaId))
      for (const a of allocations) {
        if (!cellIdeaIds.has(a.ideaId)) {
          throw new Error('IDEA_NOT_IN_CELL')
        }
      }

      // In unlimited mode, keep previous votes (additive XP). Otherwise replace.
      if (!deliberation.multipleIdeasAllowed) {
        await tx.$executeRaw`DELETE FROM "Vote" WHERE "cellId" = ${cellId} AND "userId" = ${user.id}`
      }

      const now = new Date()
      for (const a of allocations as { ideaId: string; points: number }[]) {
        const voteId = `vt${Date.now()}${Math.random().toString(36).slice(2, 8)}`
        await tx.$executeRaw`
          INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
          VALUES (${voteId}, ${cellId}, ${user.id}, ${a.ideaId}, ${a.points}, ${now})
        `
      }

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

      await tx.cellParticipation.updateMany({
        where: { cellId: cellId!, userId: user.id },
        data: { status: 'VOTED', votedAt: now },
      })

      const votedUserIds = await tx.$queryRaw<{ userId: string }[]>`
        SELECT DISTINCT "userId" FROM "Vote" WHERE "cellId" = ${cellId}
      `

      const allVoted = votedUserIds.length >= FCFS_CELL_SIZE

      return { allVoted, voterCount: votedUserIds.length }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000,
    })

    if (result.allVoted) {
      const GRACE_PERIOD_MS = 5_000
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
            console.error(`CG FCFS finalization failed for cell ${cellId}:`, err)
          })
        }
      })
    }

    // Tier progress
    const tierCells = await prisma.cell.findMany({
      where: { deliberationId: id, tier: deliberation.currentTier },
      select: { status: true },
    })
    const completedCells = tierCells.filter(c => c.status === 'COMPLETED').length

    return NextResponse.json({
      success: true,
      cellId,
      cellCompleted: result.allVoted,
      voterCount: result.voterCount,
      votersNeeded: FCFS_CELL_SIZE,
      progress: {
        completedCells: completedCells + (result.allVoted ? 1 : 0),
        totalCells: tierCells.length,
        tierComplete: (completedCells + (result.allVoted ? 1 : 0)) >= tierCells.length,
      },
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
    const msg = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error('Error in CG vote:', msg, stack)
    return NextResponse.json({ error: `Failed to vote: ${msg}` }, { status: 500 })
  }
}
