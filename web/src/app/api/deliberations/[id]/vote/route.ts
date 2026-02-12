import { NextRequest, NextResponse, after } from 'next/server'
import { resolveSimulatorUser } from '@/lib/simulator-auth'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'
import { invalidate } from '@/lib/cache'

const FCFS_CELL_SIZE = 5

// POST /api/deliberations/[id]/vote — Enter cell + cast vote (FCFS)
// 2 round trips: parallel reads → short write transaction
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await resolveSimulatorUser(req)

    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const userId = auth.user.id
    const body = await req.json()
    const { allocations, tier: requestedTier } = body

    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json({ error: 'allocations required: [{ideaId, points}]' }, { status: 400 })
    }

    const totalPoints = allocations.reduce((sum: number, a: { points: number }) => sum + a.points, 0)
    if (totalPoints !== 10) {
      return NextResponse.json({ error: `Must allocate exactly 10 XP (got ${totalPoints})` }, { status: 400 })
    }

    const submittedIdeaIds = allocations.map((a: { ideaId: string }) => a.ideaId) as string[]
    const submittedSet = new Set(submittedIdeaIds)

    // === ROUND TRIP 1: All reads in parallel ===
    const [deliberation, votedCheck, activeParticipation, allTierCellsRaw] = await Promise.all([
      prisma.deliberation.findUnique({ where: { id } }),
      prisma.cellParticipation.findFirst({
        where: { userId, status: 'VOTED', cell: { deliberationId: id } },
        select: { cell: { select: { tier: true } } },
      }),
      prisma.cellParticipation.findFirst({
        where: { userId, status: 'ACTIVE', cell: { deliberationId: id, status: 'VOTING' } },
        include: { cell: { include: { ideas: true } } },
      }),
      prisma.cell.findMany({
        where: { deliberationId: id },
        include: { _count: { select: { participants: true } }, ideas: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }
    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
    }

    const targetTier = requestedTier ?? deliberation.currentTier

    // Check already voted
    if (!deliberation.multipleIdeasAllowed && votedCheck && votedCheck.cell.tier === targetTier) {
      return NextResponse.json({ error: 'You already voted in this tier' }, { status: 400 })
    }

    // Filter cells to target tier
    const tierCells = allTierCellsRaw.filter(c => c.tier === targetTier)

    // Determine which cell to target
    let targetCellId: string | null = null
    let needsNewCell = false
    let newCellIdeaIds: string[] | null = null
    let newCellBatch = 0

    // Check active participation
    if (activeParticipation && activeParticipation.cell.tier === targetTier) {
      const cellIdeaSet = new Set(activeParticipation.cell.ideas.map(ci => ci.ideaId))
      if (submittedIdeaIds.every(sid => cellIdeaSet.has(sid))) {
        targetCellId = activeParticipation.cellId
      }
      // If wrong cell, we'll clean it up in the transaction
    }

    if (!targetCellId) {
      // Find best open cell
      let best: typeof tierCells[0] | null = null
      let bestP = FCFS_CELL_SIZE

      // Prefer cell with matching ideas
      for (const cell of tierCells) {
        if (cell.status !== 'VOTING' || cell._count.participants >= FCFS_CELL_SIZE) continue
        const ids = new Set(cell.ideas.map(ci => ci.ideaId))
        if (submittedIdeaIds.every(sid => ids.has(sid)) && cell._count.participants < bestP) {
          bestP = cell._count.participants
          best = cell
        }
      }
      // Fallback: any open cell
      if (!best) {
        for (const cell of tierCells) {
          if (cell.status !== 'VOTING' || cell._count.participants >= FCFS_CELL_SIZE) continue
          if (cell._count.participants < bestP) { bestP = cell._count.participants; best = cell }
        }
      }

      if (best) {
        targetCellId = best.id
      } else {
        // Need to create a new cell
        needsNewCell = true
        for (const cell of tierCells) {
          const ids = new Set(cell.ideas.map(ci => ci.ideaId))
          if (submittedIdeaIds.every(sid => ids.has(sid))) {
            newCellIdeaIds = cell.ideas.map(ci => ci.ideaId)
            newCellBatch = cell.batch ?? 0
            break
          }
        }
        if (!newCellIdeaIds) newCellIdeaIds = [...submittedSet]
      }
    }

    // === ROUND TRIP 2: Short write transaction (lock + vote) ===
    const now = new Date()
    // Pre-transaction: membership + stale cleanup (non-critical, can run outside tx)
    const preOps: Promise<unknown>[] = [
      prisma.deliberationMember.upsert({
        where: { deliberationId_userId: { userId, deliberationId: id } },
        create: { userId, deliberationId: id },
        update: {},
      }),
    ]
    if (activeParticipation && !targetCellId) {
      preOps.push(prisma.cellParticipation.deleteMany({
        where: { cellId: activeParticipation.cellId, userId, status: 'ACTIVE' },
      }))
    }
    await Promise.all(preOps)

    // Cell creation (outside tx — no lock needed for new cells)
    let cellId = targetCellId
    if (needsNewCell) {
      const newCell = await prisma.cell.create({
        data: {
          deliberationId: id, tier: targetTier, batch: newCellBatch, status: 'VOTING',
          ideas: { create: newCellIdeaIds!.map(ideaId => ({ ideaId })) },
        },
      })
      await prisma.cellParticipation.create({ data: { cellId: newCell.id, userId, status: 'ACTIVE' } })
      cellId = newCell.id
    }

    // === TRANSACTION: lock + join + vote + count ===
    const result = await prisma.$transaction(async (tx) => {
      // If joining existing cell: atomic lock + count check
      if (cellId && cellId !== activeParticipation?.cellId && !needsNewCell) {
        await tx.$queryRaw`SELECT id FROM "Cell" WHERE id = ${cellId} FOR UPDATE`
        const count = await tx.cellParticipation.count({ where: { cellId } })
        if (count >= FCFS_CELL_SIZE) {
          // Race: cell filled — create fallback cell
          const fallback = await tx.cell.create({
            data: {
              deliberationId: id, tier: targetTier, batch: 0, status: 'VOTING',
              ideas: { create: (newCellIdeaIds || [...submittedSet]).map(ideaId => ({ ideaId })) },
            },
          })
          await tx.cellParticipation.create({ data: { cellId: fallback.id, userId, status: 'ACTIVE' } })
          cellId = fallback.id
        } else {
          await tx.cellParticipation.create({ data: { cellId, userId, status: 'ACTIVE' } })
        }
      }

      // Validate cell ideas
      const cell = await tx.cell.findUnique({
        where: { id: cellId! },
        select: { status: true, ideas: { select: { ideaId: true } } },
      })
      if (!cell || cell.status !== 'VOTING') throw new Error('CELL_NOT_VOTING')
      const cellIdeaIds = new Set(cell.ideas.map(ci => ci.ideaId))
      for (const a of allocations as { ideaId: string }[]) {
        if (!cellIdeaIds.has(a.ideaId)) throw new Error('IDEA_NOT_IN_CELL')
      }

      // Delete old votes + insert new ones in single raw SQL
      if (!deliberation.multipleIdeasAllowed) {
        await tx.$executeRaw`DELETE FROM "Vote" WHERE "cellId" = ${cellId} AND "userId" = ${userId}`
      }
      const voteValues = (allocations as { ideaId: string; points: number }[])
        .map(a => `('vt${Date.now()}${Math.random().toString(36).slice(2, 8)}', '${cellId}', '${userId}', '${a.ideaId}', ${a.points}, '${now.toISOString()}')`)
        .join(', ')
      await tx.$executeRawUnsafe(
        `INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt") VALUES ${voteValues}`
      )

      // Mark voted + count in one go
      await tx.$executeRaw`UPDATE "CellParticipation" SET status = 'VOTED', "votedAt" = ${now} WHERE "cellId" = ${cellId} AND "userId" = ${userId}`
      const votedUserIds = await tx.$queryRaw<{ userId: string }[]>`
        SELECT DISTINCT "userId" FROM "Vote" WHERE "cellId" = ${cellId}
      `

      return { cellId: cellId!, voterCount: votedUserIds.length }
    }, { timeout: 15000 })

    // Invalidate status cache
    invalidate(`status:${id}`)

    const allVoted = result.voterCount >= FCFS_CELL_SIZE

    // Background: XP tally + cell completion
    after(async () => {
      await prisma.$executeRaw`
        UPDATE "Idea" SET "totalVotes" = sub.voters::int, "totalXP" = sub.xp::int
        FROM (
          SELECT "ideaId", COUNT(DISTINCT "userId") as voters, COALESCE(SUM("xpPoints"), 0) as xp
          FROM "Vote" WHERE "cellId" = ${result.cellId} GROUP BY "ideaId"
        ) sub WHERE "Idea".id = sub."ideaId"
      `
      if (allVoted) {
        const GRACE_PERIOD_MS = 5_000
        await prisma.cell.updateMany({
          where: { id: result.cellId, finalizesAt: null, status: 'VOTING' },
          data: { finalizesAt: new Date(Date.now() + GRACE_PERIOD_MS) },
        })
        await new Promise(resolve => setTimeout(resolve, GRACE_PERIOD_MS))
        const c = await prisma.cell.findUnique({
          where: { id: result.cellId },
          select: { status: true, finalizesAt: true },
        })
        if (c?.status === 'VOTING' && c.finalizesAt && c.finalizesAt <= new Date()) {
          await processCellResults(result.cellId, false).catch(err => {
            console.error(`FCFS finalization failed for cell ${result.cellId}:`, err)
          })
        }
        invalidate(`status:${id}`)
      }
    })

    return NextResponse.json({
      success: true,
      cellId: result.cellId,
      cellCompleted: allVoted,
      voterCount: result.voterCount,
      votersNeeded: FCFS_CELL_SIZE,
      progress: { completedCells: 0, totalCells: 0, tierComplete: false },
    }, { status: 201 })
  } catch (error) {
    if (error instanceof Error) {
      const errorMap: Record<string, { message: string; status: number }> = {
        'NOT_FOUND': { message: 'Chant not found', status: 404 },
        'NOT_VOTING': { message: 'Chant is not in voting phase', status: 400 },
        'ALREADY_VOTED': { message: 'You already voted in this tier', status: 400 },
        'CELL_NOT_VOTING': { message: 'Cell is not in voting phase', status: 400 },
        'IDEA_NOT_IN_CELL': { message: 'Idea not in this cell', status: 400 },
      }
      const mapped = errorMap[error.message]
      if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status })
    }
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error in vote:', msg)
    return NextResponse.json({ error: `Failed to vote: ${msg}` }, { status: 500 })
  }
}
