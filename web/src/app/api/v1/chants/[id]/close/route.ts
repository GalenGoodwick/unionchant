import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey, requireScope } from '../../../auth'
import { v1RateLimit } from '../../../rate-limit'
import { prisma } from '@/lib/prisma'
import { processCellResults, checkTierCompletion } from '@/lib/voting'
import { tryAdvanceContinuousFlowTier } from '@/lib/continuous-flow'
import { fireWebhookEvent } from '@/lib/webhooks'

/**
 * POST /api/v1/chants/:id/close — Facilitator actions
 *
 * Only the chant creator can call this.
 *
 * Body: { "action": "advance" | "end" }
 *
 * "advance" (default):
 *   1. Force-complete any open cells at the current tier
 *   2. Recalculate priority (highest XP across completed cells at highest tier)
 *   3. Trigger tier advancement → next tier cells created (FCFS)
 *
 * "end":
 *   1. Force-complete all open cells
 *   2. Recalculate final priority from highest completed tier
 *   3. Mark deliberation COMPLETED — no more ideas/votes accepted
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const scopeErr = requireScope(auth.scopes, 'write')
    if (scopeErr) return scopeErr
    const rateErr = v1RateLimit('v1_admin', auth.user.id)
    if (rateErr) return rateErr

    const { id } = await params
    const userId = auth.user.id

    const body = await req.json().catch(() => ({}))
    const action = body.action || 'advance'

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.creatorId !== userId) {
      return NextResponse.json({ error: 'Only the creator (facilitator) can close' }, { status: 403 })
    }

    if (deliberation.phase === 'COMPLETED') {
      return NextResponse.json({ error: 'Chant is already completed' }, { status: 400 })
    }

    // ── Force-complete open cells at current tier ──
    const openCells = await prisma.cell.findMany({
      where: { deliberationId: id, status: { in: ['VOTING', 'DELIBERATING'] } },
      select: { id: true, tier: true },
    })

    let closedCells = 0
    for (const cell of openCells) {
      await processCellResults(cell.id, true)
      closedCells++
    }

    // Close submissions
    await prisma.deliberation.update({
      where: { id },
      data: { submissionsClosed: true },
    })

    // ── Recalculate priority from highest completed tier ──
    const highestTier = deliberation.currentTier
    const completedCells = await prisma.cell.findMany({
      where: { deliberationId: id, tier: highestTier, status: 'COMPLETED' },
      select: { id: true },
    })
    const cellIds = completedCells.map(c => c.id)

    let priority: { id: string; text: string; xp: number } | null = null
    const tally: Record<string, number> = {}

    if (cellIds.length > 0) {
      const votes = await prisma.vote.findMany({
        where: { cellId: { in: cellIds } },
        select: { ideaId: true, xpPoints: true },
      })
      for (const v of votes) {
        tally[v.ideaId] = (tally[v.ideaId] || 0) + v.xpPoints
      }
      const sorted = Object.entries(tally).sort(([, a], [, b]) => b - a)

      if (sorted.length > 0) {
        const [priorityId, xp] = sorted[0]
        const idea = await prisma.idea.findUnique({
          where: { id: priorityId },
          select: { id: true, text: true },
        })
        if (idea) {
          priority = { id: idea.id, text: idea.text, xp }

          // Update champion pointer
          await prisma.idea.updateMany({
            where: { deliberationId: id, isChampion: true },
            data: { isChampion: false },
          })
          await prisma.idea.update({
            where: { id: priorityId },
            data: { isChampion: true },
          })
          await prisma.deliberation.update({
            where: { id },
            data: { championId: priorityId },
          })
        }
      }
    }

    // ── Action: end ──
    if (action === 'end') {
      if (priority) {
        await prisma.idea.update({
          where: { id: priority.id },
          data: { status: 'WINNER' },
        })
      }
      await prisma.deliberation.update({
        where: { id },
        data: { phase: 'COMPLETED', completedAt: new Date() },
      })

      fireWebhookEvent('winner_declared', {
        deliberationId: id,
        winnerId: priority?.id,
        winnerText: priority?.text || '',
        totalTiers: highestTier,
      })

      return NextResponse.json({
        action: 'end',
        closedCells,
        phase: 'COMPLETED',
        priority: priority ? {
          ideaId: priority.id,
          text: priority.text,
          xp: priority.xp,
        } : null,
        message: 'Deliberation ended. Final priority declared.',
      })
    }

    // ── Action: advance ──
    // Try continuous flow advancement first
    if (deliberation.continuousFlow) {
      for (let t = 1; t <= highestTier; t++) {
        await tryAdvanceContinuousFlowTier(id, t)
      }

      // Check for advancing ideas that need a final showdown cell
      const cellSize = deliberation.cellSize || 5
      const advancingIdeas = await prisma.idea.findMany({
        where: { deliberationId: id, status: 'ADVANCING' },
        select: { id: true, text: true, tier: true },
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

        fireWebhookEvent('tier_complete', {
          deliberationId: id,
          completedTier: highestTier,
          nextTier,
          advancingIdeas: advancingIdeas.map(i => ({ id: i.id, text: i.text })),
          advancingCount: advancingIdeas.length,
        })

        return NextResponse.json({
          action: 'advance',
          closedCells,
          currentTier: nextTier,
          phase: 'VOTING',
          priority: priority ? { ideaId: priority.id, text: priority.text, xp: priority.xp } : null,
          advancingIdeas: advancingIdeas.map(i => ({ id: i.id, text: i.text })),
          message: `Tier ${highestTier} closed. ${advancingIdeas.length} ideas advance to tier ${nextTier}. Agents: POST /cell/enter to join.`,
        })
      }
    }

    // Standard tier completion
    await checkTierCompletion(id, highestTier)

    const updated = await prisma.deliberation.findUnique({
      where: { id },
      select: { currentTier: true, phase: true },
    })

    // Get advancing ideas for response
    const advancingIdeas = await prisma.idea.findMany({
      where: { deliberationId: id, status: { in: ['ADVANCING', 'IN_VOTING'] }, tier: { gt: highestTier } },
      select: { id: true, text: true },
    })

    return NextResponse.json({
      action: 'advance',
      closedCells,
      currentTier: updated?.currentTier,
      phase: updated?.phase,
      priority: priority ? { ideaId: priority.id, text: priority.text, xp: priority.xp } : null,
      advancingIdeas: advancingIdeas.length > 0
        ? advancingIdeas.map(i => ({ id: i.id, text: i.text }))
        : undefined,
      message: updated?.phase === 'COMPLETED'
        ? 'Deliberation complete. Priority declared.'
        : `Tier ${highestTier} closed. Now at tier ${updated?.currentTier}. Agents: POST /cell/enter to join.`,
    })
  } catch (err) {
    console.error('v1 close error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
