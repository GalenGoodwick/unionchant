import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../../../../auth'
import { v1RateLimit } from '../../../../rate-limit'
import { prisma } from '@/lib/prisma'
import { atomicJoinCell } from '@/lib/voting'
import { recordTaskCompletion } from '@/lib/rate-limit'

// POST /api/v1/chants/:id/cell/enter — Join an FCFS voting cell
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr
    const rateErr = v1RateLimit('v1_write', auth.user.id)
    if (rateErr) return rateErr

    const { id: deliberationId } = await params
    const userId = auth.user.id

    const deliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
    }

    const FCFS_CELL_SIZE = deliberation.cellSize || 5

    // Check if already in an active cell at current tier
    const existing = await prisma.cellParticipation.findFirst({
      where: {
        userId,
        cell: {
          deliberationId,
          tier: deliberation.currentTier,
          status: { in: ['VOTING', 'DELIBERATING'] },
        },
      },
      include: {
        cell: {
          include: {
            ideas: {
              include: {
                idea: { select: { id: true, text: true, status: true } },
              },
            },
            _count: { select: { participants: true } },
          },
        },
      },
    })

    if (existing) {
      return NextResponse.json({
        alreadyInCell: true,
        cell: {
          id: existing.cell.id,
          tier: existing.cell.tier,
          ideas: existing.cell.ideas.map(ci => ({
            id: ci.idea.id,
            text: ci.idea.text,
          })),
          voterCount: existing.cell._count.participants,
          votersNeeded: FCFS_CELL_SIZE,
        },
      })
    }

    // Check if already voted at this tier (completed cell)
    const alreadyVoted = await prisma.cellParticipation.findFirst({
      where: {
        userId,
        cell: {
          deliberationId,
          tier: deliberation.currentTier,
          status: 'COMPLETED',
        },
      },
    })

    if (alreadyVoted) {
      return NextResponse.json({
        error: 'You have already voted in this tier. Wait for the next tier.',
      }, { status: 400 })
    }

    // ── Batch-aware on-demand cell creation ──
    // Compute batches deterministically from IN_VOTING ideas.
    // Round-robin across batches: join the least-filled open cell,
    // or create a new cell in the batch with fewest total participants.

    const tierIdeas = await prisma.idea.findMany({
      where: { deliberationId, status: 'IN_VOTING', tier: deliberation.currentTier },
      select: { id: true, text: true },
      orderBy: { id: 'asc' }, // deterministic ordering
    })

    if (tierIdeas.length === 0) {
      return NextResponse.json({
        error: 'No ideas in voting at this tier.',
        roundFull: true,
      }, { status: 400 })
    }

    // Compute batch groups
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

    // Get ALL cells at current tier (VOTING + COMPLETED) for batch totals
    const allTierCells = await prisma.cell.findMany({
      where: { deliberationId, tier: deliberation.currentTier },
      include: {
        _count: { select: { participants: true } },
        ideas: {
          include: { idea: { select: { id: true, text: true, status: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Group cells by batch
    const cellsByBatch = new Map<number, typeof allTierCells>()
    for (const cell of allTierCells) {
      const b = cell.batch ?? 0
      if (!cellsByBatch.has(b)) cellsByBatch.set(b, [])
      cellsByBatch.get(b)!.push(cell)
    }

    // Find best open cell (round-robin: least participants across all batches)
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

    if (cellToJoin) {
      // Atomically join existing cell (prevents race where two agents
      // both see room and both enter, overflowing the cell)
      const joined = await atomicJoinCell(cellToJoin.id, userId, FCFS_CELL_SIZE)
      if (!joined) {
        // Race lost — cell filled between read and lock. Fall through to create new cell.
      } else {
        await prisma.deliberationMember.upsert({
          where: { deliberationId_userId: { userId, deliberationId } },
          create: { userId, deliberationId },
          update: {},
        })

        recordTaskCompletion(userId)
        return NextResponse.json({
          entered: true,
          cell: {
            id: cellToJoin.id,
            tier: cellToJoin.tier,
            batch: cellToJoin.batch,
            ideas: cellToJoin.ideas.map(ci => ({
              id: ci.idea.id,
              text: ci.idea.text,
            })),
            voterCount: cellToJoin._count.participants + 1,
            votersNeeded: FCFS_CELL_SIZE,
          },
        })
      }
    }

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

    // If this batch already has cells (e.g., seed cells from continuous flow),
    // use the same ideas as existing cells for batch consistency.
    // Otherwise, use the computed batch ideas.
    const existingBatchCells = cellsByBatch.get(createBatch) || []
    const cellIdeaIds = existingBatchCells.length > 0
      ? existingBatchCells[0].ideas.map(ci => ci.idea.id)
      : batchIdeaGroups[createBatch].map(i => i.id)

    const newCell = await prisma.cell.create({
      data: {
        deliberationId,
        tier: deliberation.currentTier,
        batch: createBatch,
        status: 'VOTING',
        ideas: {
          create: cellIdeaIds.map(id => ({ ideaId: id })),
        },
      },
      include: {
        ideas: {
          include: { idea: { select: { id: true, text: true, status: true } } },
        },
      },
    })

    await prisma.deliberationMember.upsert({
      where: { deliberationId_userId: { userId, deliberationId } },
      create: { userId, deliberationId },
      update: {},
    })

    await prisma.cellParticipation.create({
      data: { cellId: newCell.id, userId, status: 'ACTIVE' },
    })

    recordTaskCompletion(userId)
    return NextResponse.json({
      entered: true,
      cell: {
        id: newCell.id,
        tier: newCell.tier,
        batch: createBatch,
        ideas: newCell.ideas.map(ci => ({
          id: ci.idea.id,
          text: ci.idea.text,
        })),
        voterCount: 1,
        votersNeeded: FCFS_CELL_SIZE,
      },
    })
  } catch (err) {
    console.error('v1 cell enter error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
