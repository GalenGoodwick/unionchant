import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processCellResults, checkTierCompletion } from '@/lib/voting'
import { tryAdvanceContinuousFlowTier } from '@/lib/continuous-flow'

// POST /api/deliberations/[id]/force-next-tier
// Allow creator to force process all active voting cells and advance tier
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        cells: {
          where: { status: { in: ['VOTING', 'DELIBERATING'] } },
        },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    const isCreator = deliberation.creatorId === user.id
    const isAdmin = user.role === 'ADMIN'

    if (!isCreator && !isAdmin) {
      return NextResponse.json({ error: 'Only the creator can advance tiers' }, { status: 403 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Deliberation is not in voting phase' }, { status: 400 })
    }

    if (deliberation.cells.length === 0) {
      return NextResponse.json({ error: 'No active voting cells' }, { status: 400 })
    }

    // Process all active cells with timeout=true to force completion
    let cellsProcessed = 0
    for (const cell of deliberation.cells) {
      await processCellResults(cell.id, true)
      cellsProcessed++
    }

    // Advance tier for continuous flow chants
    if (deliberation.continuousFlow) {
      for (let t = 1; t <= deliberation.currentTier; t++) {
        await tryAdvanceContinuousFlowTier(id, t)
      }

      // Handle remaining advancing ideas that don't fill a full cell
      const cellSize = deliberation.cellSize || 5
      const advancingIdeas = await prisma.idea.findMany({
        where: { deliberationId: id, status: 'ADVANCING' },
        select: { id: true, tier: true },
      })
      const remainingOpen = await prisma.cell.count({
        where: { deliberationId: id, status: { in: ['VOTING', 'DELIBERATING'] } },
      })

      if (advancingIdeas.length > 0 && advancingIdeas.length < cellSize && remainingOpen === 0) {
        const nextTier = Math.max(...advancingIdeas.map(i => i.tier)) + 1
        await prisma.idea.updateMany({
          where: { id: { in: advancingIdeas.map(i => i.id) } },
          data: { status: 'IN_VOTING', tier: nextTier },
        })
        await prisma.deliberation.update({
          where: { id },
          data: { currentTier: nextTier, currentTierStartedAt: new Date() },
        })
      }
    }

    // Check tier completion (creates next tier cells or declares winner)
    await checkTierCompletion(id, deliberation.currentTier)

    const updated = await prisma.deliberation.findUnique({
      where: { id },
      select: { currentTier: true, phase: true },
    })

    return NextResponse.json({
      success: true,
      cellsProcessed,
      tier: deliberation.currentTier,
      currentTier: updated?.currentTier,
      phase: updated?.phase,
    })
  } catch (error) {
    console.error('Error force processing tier:', error)
    return NextResponse.json({ error: 'Failed to advance tier' }, { status: 500 })
  }
}
