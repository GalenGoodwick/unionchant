import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { startVotingPhase, processCellResults } from '@/lib/voting'
import { createTestUsers, createTestDeliberation } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'
import { castMajorityVotes, getCellsAtTier } from '../helpers/voting-helpers'

afterEach(async () => {
  await cleanupTestData()
}, 60000)

describe('fullTierProgression', () => {
  it('20 ideas + 20 members → vote through all tiers → champion declared', async () => {
    const users = await createTestUsers(20, 'ftp1')
    const { deliberation } = await createTestDeliberation({
      prefix: 'ftp1',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 20,
    })

    await startVotingPhase(deliberation.id)

    let tier = 1
    const maxTiers = 10 // Safety limit

    while (tier <= maxTiers) {
      const cells = await getCellsAtTier(deliberation.id, tier)
      if (cells.length === 0) break

      // Vote in every cell — pick first idea as winner
      for (const cell of cells) {
        if (cell.status === 'COMPLETED') continue
        await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
        await processCellResults(cell.id)
      }

      // Check if deliberation is done
      const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
      if (d?.phase === 'COMPLETED' || d?.phase === 'ACCUMULATING') break

      tier++
    }

    // Verify final state
    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(d?.phase).toBe('COMPLETED')
    expect(d?.championId).not.toBeNull()

    // Exactly 1 WINNER
    const winners = await prisma.idea.findMany({
      where: { deliberationId: deliberation.id, status: 'WINNER' },
    })
    expect(winners.length).toBe(1)
    expect(winners[0].isChampion).toBe(true)

    // All others eliminated or still in terminal state
    const nonWinners = await prisma.idea.findMany({
      where: { deliberationId: deliberation.id, status: { not: 'WINNER' } },
    })
    expect(nonWinners.length).toBe(19)
    for (const idea of nonWinners) {
      expect(['ELIMINATED', 'IN_VOTING']).toContain(idea.status)
    }
  }, 120000)

  it('20 ideas + 20 members with accumulation → phase=ACCUMULATING', async () => {
    const users = await createTestUsers(20, 'ftp2')
    const { deliberation } = await createTestDeliberation({
      prefix: 'ftp2',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 20,
      accumulationEnabled: true,
    })

    await startVotingPhase(deliberation.id)

    let tier = 1
    const maxTiers = 10

    while (tier <= maxTiers) {
      const cells = await getCellsAtTier(deliberation.id, tier)
      if (cells.length === 0) break

      for (const cell of cells) {
        if (cell.status === 'COMPLETED') continue
        await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
        await processCellResults(cell.id)
      }

      const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
      if (d?.phase === 'COMPLETED' || d?.phase === 'ACCUMULATING') break

      tier++
    }

    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(d?.phase).toBe('ACCUMULATING')
    expect(d?.championId).not.toBeNull()
    expect(d?.accumulationEndsAt).not.toBeNull()
  }, 120000)
})
