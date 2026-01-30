import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { startVotingPhase, processCellResults, checkTierCompletion } from '@/lib/voting'
import { createTestUsers, createTestDeliberation } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'
import { castMajorityVotes, getCellsAtTier } from '../helpers/voting-helpers'

afterEach(async () => {
  await cleanupTestData()
})

describe('checkTierCompletion', () => {
  it('not all cells complete → no action', async () => {
    const users = await createTestUsers(10, 'ctc1')
    const { deliberation } = await createTestDeliberation({
      prefix: 'ctc1',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)
    const cells = await getCellsAtTier(deliberation.id, 1)

    // Only complete the first cell
    await castMajorityVotes(cells[0].id, cells[0].ideas[0].ideaId)
    await processCellResults(cells[0].id)

    // Manually call checkTierCompletion — should do nothing because not all cells done
    await checkTierCompletion(deliberation.id, 1)

    // Deliberation should still be tier 1
    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(d?.currentTier).toBe(1)
    expect(d?.phase).toBe('VOTING')
  })

  it('>1 advancing idea → next tier cells created', async () => {
    const users = await createTestUsers(10, 'ctc2')
    const { deliberation } = await createTestDeliberation({
      prefix: 'ctc2',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)
    const cells = await getCellsAtTier(deliberation.id, 1)

    // Complete all cells — each picks a winner
    for (const cell of cells) {
      await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
      await processCellResults(cell.id)
    }

    // Check tier 2 cells were created
    const tier2Cells = await getCellsAtTier(deliberation.id, 2)
    expect(tier2Cells.length).toBeGreaterThan(0)

    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(d?.currentTier).toBe(2)
  })

  it('1 advancing idea → champion declared', async () => {
    const users = await createTestUsers(5, 'ctc3')
    const { deliberation } = await createTestDeliberation({
      prefix: 'ctc3',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 5,
    })

    await startVotingPhase(deliberation.id)
    const cells = await getCellsAtTier(deliberation.id, 1)

    // With 5 ideas in 1 cell, 1 winner should be champion
    const cell = cells[0]
    const winnerId = cell.ideas[0].ideaId
    await castMajorityVotes(cell.id, winnerId)
    await processCellResults(cell.id)

    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(d?.phase).toBe('COMPLETED')
    expect(d?.championId).toBe(winnerId)

    const winner = await prisma.idea.findUnique({ where: { id: winnerId } })
    expect(winner?.status).toBe('WINNER')
    expect(winner?.isChampion).toBe(true)
  })

  it('accumulation enabled → phase=ACCUMULATING', async () => {
    const users = await createTestUsers(5, 'ctc4')
    const { deliberation } = await createTestDeliberation({
      prefix: 'ctc4',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 5,
      accumulationEnabled: true,
    })

    await startVotingPhase(deliberation.id)
    const cells = await getCellsAtTier(deliberation.id, 1)

    const cell = cells[0]
    await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
    await processCellResults(cell.id)

    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(d?.phase).toBe('ACCUMULATING')
    expect(d?.championId).toBe(cell.ideas[0].ideaId)
    expect(d?.accumulationEndsAt).not.toBeNull()
  })

  it('idempotency: already advanced tier → no action', async () => {
    const users = await createTestUsers(10, 'ctc5')
    const { deliberation } = await createTestDeliberation({
      prefix: 'ctc5',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)
    const cells = await getCellsAtTier(deliberation.id, 1)

    for (const cell of cells) {
      await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
      await processCellResults(cell.id)
    }

    // Tier should now be 2
    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(d?.currentTier).toBe(2)

    const tier2Before = await getCellsAtTier(deliberation.id, 2)
    const countBefore = tier2Before.length

    // Call again — should be idempotent
    await checkTierCompletion(deliberation.id, 1)

    const tier2After = await getCellsAtTier(deliberation.id, 2)
    expect(tier2After.length).toBe(countBefore) // No extra cells
  })

  it('idempotency: phase already COMPLETED → no action', async () => {
    const users = await createTestUsers(5, 'ctc6')
    const { deliberation } = await createTestDeliberation({
      prefix: 'ctc6',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 5,
    })

    await startVotingPhase(deliberation.id)
    const cells = await getCellsAtTier(deliberation.id, 1)

    const cell = cells[0]
    await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
    await processCellResults(cell.id)

    // Phase should be COMPLETED now
    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(d?.phase).toBe('COMPLETED')

    // Call again — should not throw or create anything
    await checkTierCompletion(deliberation.id, 1)

    // Still completed, no extra cells
    const tier2 = await getCellsAtTier(deliberation.id, 2)
    expect(tier2.length).toBe(0)
  })
})
