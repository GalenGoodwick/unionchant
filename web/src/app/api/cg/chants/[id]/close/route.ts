import { NextRequest, NextResponse } from 'next/server'
import { verifyCGAuth } from '../../../auth'
import { resolveCGUser } from '@/lib/cg-user'
import { prisma } from '@/lib/prisma'
import { processCellResults, checkTierCompletion } from '@/lib/voting'
import { tryAdvanceContinuousFlowTier } from '@/lib/continuous-flow'

// POST /api/cg/chants/[id]/close — Facilitator: close submissions + force-complete cells
// Creator-only. Mirrors v1 close logic.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyCGAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const body = await req.json()
    const { cgUserId, cgUsername, cgImageUrl } = body

    if (!cgUserId || !cgUsername) {
      return NextResponse.json({ error: 'cgUserId and cgUsername are required' }, { status: 400 })
    }

    const user = await resolveCGUser(cgUserId, cgUsername, cgImageUrl)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can close' }, { status: 403 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
    }

    // 1. Close submissions flag
    await prisma.deliberation.update({
      where: { id },
      data: { submissionsClosed: true },
    })

    // 2. Force-complete any open cells
    const openCells = await prisma.cell.findMany({
      where: { deliberationId: id, status: { in: ['VOTING', 'DELIBERATING'] } },
      select: { id: true, tier: true },
    })

    let closedCells = 0
    for (const cell of openCells) {
      await processCellResults(cell.id, true)
      closedCells++
    }

    // 3. Try to advance tiers (continuous flow)
    if (deliberation.continuousFlow) {
      const maxTier = deliberation.currentTier
      for (let t = 1; t <= maxTier; t++) {
        await tryAdvanceContinuousFlowTier(id, t)
      }

      // If advancing ideas remain but not enough for a standard cell, create final showdown
      const cellSize = deliberation.cellSize || 5
      const advancingIdeas = await prisma.idea.findMany({
        where: { deliberationId: id, status: 'ADVANCING' },
        select: { id: true, text: true, tier: true },
      })

      const remainingOpenCells = await prisma.cell.count({
        where: { deliberationId: id, status: { in: ['VOTING', 'DELIBERATING'] } },
      })

      if (advancingIdeas.length > 0 && advancingIdeas.length < cellSize && remainingOpenCells === 0) {
        const nextTier = Math.max(...advancingIdeas.map(i => i.tier)) + 1

        await prisma.idea.updateMany({
          where: { id: { in: advancingIdeas.map(i => i.id) } },
          data: { status: 'IN_VOTING', tier: nextTier },
        })

        // FCFS: cells created on-demand when voters enter, not upfront
        await prisma.deliberation.update({
          where: { id },
          data: { currentTier: nextTier, currentTierStartedAt: new Date() },
        })

        const updated = await prisma.deliberation.findUnique({
          where: { id },
          select: { currentTier: true, phase: true },
        })

        return NextResponse.json({
          success: true,
          closedCells,
          finalShowdown: true,
          advancingIdeas: advancingIdeas.map(i => ({ id: i.id, text: i.text })),
          currentTier: updated?.currentTier,
          phase: updated?.phase,
        })
      }
    }

    // 4. Standard tier completion check
    await checkTierCompletion(id, deliberation.currentTier)

    const updated = await prisma.deliberation.findUnique({
      where: { id },
      select: { currentTier: true, phase: true },
    })

    return NextResponse.json({
      success: true,
      closedCells,
      currentTier: updated?.currentTier,
      phase: updated?.phase,
    })
  } catch (error) {
    console.error('Error in CG close:', error)
    return NextResponse.json({ error: 'Failed to close' }, { status: 500 })
  }
}
