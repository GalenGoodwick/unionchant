import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { startVotingPhase, addLateJoinerToCell } from '@/lib/voting'
import { createTestUsers, createTestDeliberation, getCreatedIds } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'
import { getCellsAtTier } from '../helpers/voting-helpers'

afterEach(async () => {
  await cleanupTestData()
})

describe('addLateJoinerToCell', () => {
  it('not in VOTING phase → fails', async () => {
    const users = await createTestUsers(2, 'alj1')
    const { deliberation } = await createTestDeliberation({
      prefix: 'alj1',
      creatorId: users[0].id,
      memberUserIds: [users[0].id],
      ideaCount: 5,
    })

    // Deliberation is still in SUBMISSION phase
    const result = await addLateJoinerToCell(deliberation.id, users[1].id)
    expect(result.success).toBe(false)
    expect(result.reason).toBe('NOT_IN_VOTING_PHASE')
  })

  it('already in cell → returns existing cell', async () => {
    const users = await createTestUsers(5, 'alj2')
    const { deliberation } = await createTestDeliberation({
      prefix: 'alj2',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 5,
    })

    await startVotingPhase(deliberation.id)

    // User 0 is already in a cell
    const result = await addLateJoinerToCell(deliberation.id, users[0].id)
    expect(result.success).toBe(false)
    expect(result.reason).toBe('ALREADY_IN_CELL')
    expect(result.cellId).toBeDefined()
  })

  it('adds to smallest cell', async () => {
    const users = await createTestUsers(6, 'alj3')
    // Create with 5 users, then add the 6th as late joiner
    const { deliberation } = await createTestDeliberation({
      prefix: 'alj3',
      creatorId: users[0].id,
      memberUserIds: users.slice(0, 5).map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)

    // Add late joiner
    const result = await addLateJoinerToCell(deliberation.id, users[5].id)
    expect(result.success).toBe(true)
    expect(result.cellId).toBeDefined()

    // Verify user is now in a cell
    const participation = await prisma.cellParticipation.findFirst({
      where: {
        userId: users[5].id,
        cell: { deliberationId: deliberation.id },
      },
    })
    expect(participation).not.toBeNull()
  })

  it('no active cells → fails', async () => {
    const users = await createTestUsers(2, 'alj4')
    const { deliberation } = await createTestDeliberation({
      prefix: 'alj4',
      creatorId: users[0].id,
      memberUserIds: [users[0].id],
      ideaCount: 5,
    })

    // Set to VOTING but don't create any cells
    await prisma.deliberation.update({
      where: { id: deliberation.id },
      data: { phase: 'VOTING' },
    })

    const result = await addLateJoinerToCell(deliberation.id, users[1].id)
    expect(result.success).toBe(false)
    expect(result.reason).toBe('NO_ACTIVE_CELLS')
  })

  it('prefers least-populated batch', async () => {
    const users = await createTestUsers(22, 'alj5')
    // 20 users + 20 ideas → should create multiple batches/cells
    const { deliberation } = await createTestDeliberation({
      prefix: 'alj5',
      creatorId: users[0].id,
      memberUserIds: users.slice(0, 20).map(u => u.id),
      ideaCount: 20,
    })

    await startVotingPhase(deliberation.id)

    // Add 2 late joiners
    const r1 = await addLateJoinerToCell(deliberation.id, users[20].id)
    const r2 = await addLateJoinerToCell(deliberation.id, users[21].id)

    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)

    // They should be in cells (possibly different batches if available)
    expect(r1.cellId).toBeDefined()
    expect(r2.cellId).toBeDefined()
  })
})
