import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { startVotingPhase, processCellResults } from '@/lib/voting'
import { createTestUsers, createTestDeliberation } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'
import { castMajorityVotes, getCellsAtTier } from '../helpers/voting-helpers'

afterEach(async () => {
  await cleanupTestData()
})

describe('final showdown backfill', () => {
  it('backfills runners-up to reach 5 ideas when 2-4 advance', async () => {
    // 15 users + 15 ideas → 3 cells of 5 people/5 ideas each
    // Each cell picks 1 winner → 3 advancing ideas (< 5)
    // Backfill should pull 2 runners-up by VP → 5 ideas in final showdown
    const users = await createTestUsers(15, 'fsb1')
    const { deliberation } = await createTestDeliberation({
      prefix: 'fsb1',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 15,
    })

    await startVotingPhase(deliberation.id)

    // Complete all Tier 1 cells
    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    expect(tier1Cells.length).toBe(3) // 15 users / 5 per cell

    for (const cell of tier1Cells) {
      // Vote for the first idea in each cell as the winner
      await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
      await processCellResults(cell.id)
    }

    // Check: tier should advance to 2 (final showdown)
    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(d?.currentTier).toBe(2)

    // Check: Tier 2 should be a final showdown with 5 ideas (3 winners + 2 backfilled)
    const tier2Cells = await getCellsAtTier(deliberation.id, 2)
    expect(tier2Cells.length).toBeGreaterThan(0)

    // All Tier 2 cells should have the same 5 ideas (final showdown)
    const ideasInFirstCell = tier2Cells[0].ideas.map(ci => ci.ideaId).sort()
    expect(ideasInFirstCell.length).toBe(5)

    // All cells should have the same ideas
    for (const cell of tier2Cells) {
      const cellIdeaIds = cell.ideas.map(ci => ci.ideaId).sort()
      expect(cellIdeaIds).toEqual(ideasInFirstCell)
    }

    // All 15 participants should be in Tier 2 cells (final showdown = everyone votes)
    const totalParticipants = tier2Cells.reduce((sum, c) => sum + c.participants.length, 0)
    expect(totalParticipants).toBe(15)

    // Verify: 3 ideas are the original winners (IN_VOTING) and 2 are backfilled runners-up
    const inVotingIdeas = await prisma.idea.findMany({
      where: { deliberationId: deliberation.id, status: 'IN_VOTING', tier: 2 },
    })
    expect(inVotingIdeas.length).toBe(5)
  })

  it('no backfill needed when exactly 5 ideas advance', async () => {
    // 25 users + 25 ideas → 5 cells of 5 people/5 ideas each
    // Each cell picks 1 winner → 5 advancing ideas = exactly 5, no backfill needed
    const users = await createTestUsers(25, 'fsb2')
    const { deliberation } = await createTestDeliberation({
      prefix: 'fsb2',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 25,
    })

    await startVotingPhase(deliberation.id)

    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    expect(tier1Cells.length).toBe(5) // 25 users / 5 per cell

    for (const cell of tier1Cells) {
      await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
      await processCellResults(cell.id)
    }

    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(d?.currentTier).toBe(2)

    // Tier 2 should have exactly 5 ideas — no backfill
    const tier2Cells = await getCellsAtTier(deliberation.id, 2)
    const ideasInFirstCell = tier2Cells[0].ideas.map(ci => ci.ideaId).sort()
    expect(ideasInFirstCell.length).toBe(5)

    // No eliminated ideas should have been revived
    const eliminatedCount = await prisma.idea.count({
      where: { deliberationId: deliberation.id, status: 'ELIMINATED' },
    })
    // 25 ideas - 5 winners = 20 eliminated
    expect(eliminatedCount).toBe(20)
  })

  it('backfill with 2 advancing ideas pulls 3 runners-up', async () => {
    // 10 users + 10 ideas → 2 cells of 5/5
    // Each cell picks 1 winner → 2 advancing ideas
    // Backfill should pull 3 runners-up → 5 total
    const users = await createTestUsers(10, 'fsb3')
    const { deliberation } = await createTestDeliberation({
      prefix: 'fsb3',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)

    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    expect(tier1Cells.length).toBe(2)

    for (const cell of tier1Cells) {
      await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
      await processCellResults(cell.id)
    }

    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(d?.currentTier).toBe(2)

    const tier2Cells = await getCellsAtTier(deliberation.id, 2)
    const ideasInFirstCell = tier2Cells[0].ideas.map(ci => ci.ideaId).sort()
    expect(ideasInFirstCell.length).toBe(5) // 2 winners + 3 backfilled

    // All 10 participants in final showdown
    const totalParticipants = tier2Cells.reduce((sum, c) => sum + c.participants.length, 0)
    expect(totalParticipants).toBe(10)
  })
})
