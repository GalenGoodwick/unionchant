import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../../../../auth'
import { prisma } from '@/lib/prisma'

// POST /api/v1/chants/:id/cell/enter — Join an FCFS voting cell
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr

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

    // Find oldest VOTING cell with room
    const openCells = await prisma.cell.findMany({
      where: {
        deliberationId,
        tier: deliberation.currentTier,
        status: 'VOTING',
      },
      include: {
        _count: { select: { participants: true } },
        ideas: {
          include: {
            idea: { select: { id: true, text: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const cellToJoin = openCells.find(c => c._count.participants < FCFS_CELL_SIZE)

    if (!cellToJoin) {
      return NextResponse.json({
        error: 'All cells are full. Waiting for results before next round opens.',
        roundFull: true,
      }, { status: 400 })
    }

    // Ensure membership
    await prisma.deliberationMember.upsert({
      where: { deliberationId_userId: { userId, deliberationId } },
      create: { userId, deliberationId },
      update: {},
    })

    // Add to cell
    await prisma.cellParticipation.create({
      data: { cellId: cellToJoin.id, userId, status: 'ACTIVE' },
    })

    return NextResponse.json({
      entered: true,
      cell: {
        id: cellToJoin.id,
        tier: cellToJoin.tier,
        ideas: cellToJoin.ideas.map(ci => ({
          id: ci.idea.id,
          text: ci.idea.text,
        })),
        voterCount: cellToJoin._count.participants + 1,
        votersNeeded: FCFS_CELL_SIZE,
      },
    })
  } catch (err) {
    console.error('v1 cell enter error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
