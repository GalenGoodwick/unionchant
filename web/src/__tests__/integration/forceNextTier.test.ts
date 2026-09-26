import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { startVotingPhase, processCellResults, forcePartialBatchResolution, checkTierCompletion } from '@/lib/voting'
import { createTestUsers, createTestDeliberation } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'
import { castVote, getCellsAtTier } from '../helpers/voting-helpers'

afterEach(async () => {
  await cleanupTestData()
})

/**
 * Regression for the live Sep 26 failure: a small chant with MORE IDEAS THAN
 * PARTICIPANTS stalled (tiny cells can't complete), and Force Next Tier then
 * advanced the whole pool without eliminating anything, creating extra cells.
 * Force = the exact sequence the force-next-tier route runs:
 *   processCellResults(cell, true) for every active cell
 *   → forcePartialBatchResolution → checkTierCompletion
 */
describe('force next tier — more ideas than participants', () => {
  it('eliminates losers and reduces the field instead of ballooning', async () => {
    // 4 people, 12 ideas → tier 1 = 3 cells of ~4 ideas, 1-2 members each.
    // Tiny cells = the stall regime from the live test.
    const users = await createTestUsers(4, 'fnt1')
    const { deliberation } = await createTestDeliberation({
      prefix: 'fnt1',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 12,
    })

    await startVotingPhase(deliberation.id)
    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    expect(tier1Cells.length).toBeGreaterThan(1)
    const tier1IdeaCount = 12

    // Partial engagement: only ONE member of ONE cell votes. Everyone else
    // is idle — the "not enough people to complete the cells" state.
    const votedCell = tier1Cells[0]
    const voter = await prisma.cellParticipation.findFirst({
      where: { cellId: votedCell.id }, select: { userId: true },
    })
    expect(voter).not.toBeNull()
    await castVote(votedCell.id, voter!.userId, votedCell.ideas[0].ideaId)

    // ── FORCE (mirrors the force-next-tier route) ──
    const activeCells = await prisma.cell.findMany({
      where: { deliberationId: deliberation.id, status: { in: ['VOTING', 'DELIBERATING'] } },
    })
    for (const cell of activeCells) {
      await processCellResults(cell.id, true, true)
    }
    await forcePartialBatchResolution(deliberation.id, 1)
    await checkTierCompletion(deliberation.id, 1)

    // 1) Losers were actually eliminated
    const eliminated = await prisma.idea.count({
      where: { deliberationId: deliberation.id, status: 'ELIMINATED' },
    })
    expect(eliminated).toBeGreaterThan(0)

    // 2) The funnel reduced: surviving pool is strictly smaller than the field
    const survivors = await prisma.idea.count({
      where: {
        deliberationId: deliberation.id,
        status: { in: ['IN_VOTING', 'ADVANCING', 'WINNER'] },
      },
    })
    expect(survivors).toBeLessThan(tier1IdeaCount)
    // At most ~1-2 per tier-1 cell (winner + rare 2-way tie), never the full pool
    expect(survivors).toBeLessThanOrEqual(tier1Cells.length * 2)

    // 3) The chant moved forward: either a champion or a smaller tier 2
    const delib = await prisma.deliberation.findUnique({
      where: { id: deliberation.id },
      select: { phase: true, currentTier: true, championId: true },
    })
    if (delib?.phase === 'COMPLETED') {
      expect(delib.championId).not.toBeNull()
    } else {
      expect(delib?.currentTier).toBe(2)
      const tier2Cells = await getCellsAtTier(deliberation.id, 2)
      const tier2IdeaIds = new Set(tier2Cells.flatMap(c => c.ideas.map(i => i.ideaId)))
      expect(tier2IdeaIds.size).toBeLessThan(tier1IdeaCount)
    }
  })
})
