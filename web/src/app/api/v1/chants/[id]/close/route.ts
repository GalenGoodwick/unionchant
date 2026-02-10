import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../../../auth'
import { prisma } from '@/lib/prisma'
import { processCellResults, checkTierCompletion } from '@/lib/voting'
import { tryAdvanceContinuousFlowTier } from '@/lib/continuous-flow'

// POST /api/v1/chants/:id/close — Facilitator: close submissions and advance
// Only the chant creator can call this.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr

    const { id } = await params
    const userId = auth.user.id

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.creatorId !== userId) {
      return NextResponse.json({ error: 'Only the creator can close submissions' }, { status: 403 })
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
      // Try tier advancement for all completed tiers
      const maxTier = deliberation.currentTier
      for (let t = 1; t <= maxTier; t++) {
        await tryAdvanceContinuousFlowTier(id, t)
      }

      // If still no tier 2 cell, check if we should create a final showdown
      // with fewer than cellSize advancing ideas
      const cellSize = deliberation.cellSize || 5
      const advancingIdeas = await prisma.idea.findMany({
        where: { deliberationId: id, status: 'ADVANCING' },
        select: { id: true, text: true, tier: true },
      })

      const remainingOpenCells = await prisma.cell.count({
        where: { deliberationId: id, status: { in: ['VOTING', 'DELIBERATING'] } },
      })

      if (advancingIdeas.length > 0 && advancingIdeas.length < cellSize && remainingOpenCells === 0) {
        // Not enough for a standard cell — create a final showdown with what we have
        const nextTier = Math.max(...advancingIdeas.map(i => i.tier)) + 1

        await prisma.idea.updateMany({
          where: { id: { in: advancingIdeas.map(i => i.id) } },
          data: { status: 'IN_VOTING', tier: nextTier },
        })

        // FCFS: don't create cells upfront — they're created on-demand
        // when agents call the enter endpoint. This avoids empty cells.

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
  } catch (err) {
    console.error('v1 close error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
