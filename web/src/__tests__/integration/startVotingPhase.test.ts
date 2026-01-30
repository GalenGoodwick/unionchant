import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { startVotingPhase } from '@/lib/voting'
import { createTestUsers, createTestDeliberation } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'
import { getCellsAtTier } from '../helpers/voting-helpers'

afterEach(async () => {
  await cleanupTestData()
})

describe('startVotingPhase', () => {
  it('0 ideas → phase=COMPLETED, reason=NO_IDEAS', async () => {
    const [creator] = await createTestUsers(1, 'sv0')
    const { deliberation } = await createTestDeliberation({
      prefix: 'sv0',
      creatorId: creator.id,
      memberUserIds: [creator.id],
      ideaCount: 0,
    })

    const result = await startVotingPhase(deliberation.id)

    expect(result.success).toBe(false)
    expect(result.reason).toBe('NO_IDEAS')

    const updated = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(updated?.phase).toBe('COMPLETED')
  })

  it('1 idea → WINNER + champion, phase=COMPLETED', async () => {
    const [creator] = await createTestUsers(1, 'sv1')
    const { deliberation, ideas } = await createTestDeliberation({
      prefix: 'sv1',
      creatorId: creator.id,
      memberUserIds: [creator.id],
      ideaCount: 1,
    })

    const result = await startVotingPhase(deliberation.id)

    expect(result.success).toBe(true)
    expect(result.reason).toBe('SINGLE_IDEA')
    expect(result.championId).toBe(ideas[0].id)

    const updated = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(updated?.phase).toBe('COMPLETED')
    expect(updated?.championId).toBe(ideas[0].id)

    const idea = await prisma.idea.findUnique({ where: { id: ideas[0].id } })
    expect(idea?.status).toBe('WINNER')
    expect(idea?.isChampion).toBe(true)
  })

  it('1 idea + accumulation → phase=ACCUMULATING', async () => {
    const [creator] = await createTestUsers(1, 'sv1a')
    const { deliberation, ideas } = await createTestDeliberation({
      prefix: 'sv1a',
      creatorId: creator.id,
      memberUserIds: [creator.id],
      ideaCount: 1,
      accumulationEnabled: true,
    })

    const result = await startVotingPhase(deliberation.id)

    expect(result.success).toBe(true)
    expect(result.reason).toBe('SINGLE_IDEA')

    const updated = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(updated?.phase).toBe('ACCUMULATING')
    expect(updated?.championId).toBe(ideas[0].id)
  })

  it('0 participants → reason=INSUFFICIENT_PARTICIPANTS', async () => {
    const [creator] = await createTestUsers(1, 'sv0p')
    // Create deliberation but remove creator member so 0 CREATOR/PARTICIPANT members
    const { deliberation } = await createTestDeliberation({
      prefix: 'sv0p',
      creatorId: creator.id,
      memberUserIds: [creator.id],
      ideaCount: 5,
    })

    // Remove all members to simulate 0 participants
    await prisma.deliberationMember.deleteMany({
      where: { deliberationId: deliberation.id },
    })

    const result = await startVotingPhase(deliberation.id)
    expect(result.success).toBe(false)
    expect(result.reason).toBe('INSUFFICIENT_PARTICIPANTS')
  })

  it('10 ideas + 10 members → 2 cells, correct distribution', async () => {
    const users = await createTestUsers(10, 'sv10')
    const { deliberation } = await createTestDeliberation({
      prefix: 'sv10',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    const result = await startVotingPhase(deliberation.id)

    expect(result.success).toBe(true)
    expect(result.reason).toBe('VOTING_STARTED')
    expect(result.cellsCreated).toBe(2)

    const cells = await getCellsAtTier(deliberation.id, 1)
    expect(cells.length).toBe(2)

    // Every idea in exactly 1 cell
    const allIdeaIds = cells.flatMap(c => c.ideas.map(ci => ci.ideaId))
    expect(new Set(allIdeaIds).size).toBe(10)
    expect(allIdeaIds.length).toBe(10)

    // Every member in exactly 1 cell
    const allUserIds = cells.flatMap(c => c.participants.map(p => p.userId))
    expect(new Set(allUserIds).size).toBe(10)
    expect(allUserIds.length).toBe(10)
  })

  it('40 ideas + 40 members → 8 cells, every idea/member in exactly 1 cell', async () => {
    const users = await createTestUsers(40, 'sv40')
    const { deliberation } = await createTestDeliberation({
      prefix: 'sv40',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 40,
    })

    const result = await startVotingPhase(deliberation.id)

    expect(result.success).toBe(true)
    expect(result.cellsCreated).toBe(8)

    const cells = await getCellsAtTier(deliberation.id, 1)

    const allIdeaIds = cells.flatMap(c => c.ideas.map(ci => ci.ideaId))
    expect(new Set(allIdeaIds).size).toBe(40)
    expect(allIdeaIds.length).toBe(40)

    const allUserIds = cells.flatMap(c => c.participants.map(p => p.userId))
    expect(new Set(allUserIds).size).toBe(40)
    expect(allUserIds.length).toBe(40)

    // Each cell should have 3-7 participants
    cells.forEach(cell => {
      expect(cell.participants.length).toBeGreaterThanOrEqual(3)
      expect(cell.participants.length).toBeLessThanOrEqual(7)
    })
  })

  it('non-SUBMISSION phase → throws error', async () => {
    const [creator] = await createTestUsers(1, 'svph')
    const { deliberation } = await createTestDeliberation({
      prefix: 'svph',
      creatorId: creator.id,
      memberUserIds: [creator.id],
      ideaCount: 5,
    })

    // Manually set phase to VOTING
    await prisma.deliberation.update({
      where: { id: deliberation.id },
      data: { phase: 'VOTING' },
    })

    await expect(startVotingPhase(deliberation.id)).rejects.toThrow(
      'Deliberation is not in submission phase'
    )
  })
})
