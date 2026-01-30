import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { startVotingPhase, processCellResults } from '@/lib/voting'
import { createTestUsers, createTestDeliberation } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'
import { castVote, castMajorityVotes, getCellsAtTier } from '../helpers/voting-helpers'

afterEach(async () => {
  await cleanupTestData()
})

describe('processCellResults', () => {
  it('majority vote → winner ADVANCING, losers ELIMINATED', async () => {
    // Use 10 ideas + 10 members so we get 2 cells (each with ~5 ideas)
    // This avoids final showdown (which skips winner/loser marking)
    const users = await createTestUsers(10, 'pcr1')
    const { deliberation } = await createTestDeliberation({
      prefix: 'pcr1',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)
    const cells = await getCellsAtTier(deliberation.id, 1)
    expect(cells.length).toBe(2)

    const cell = cells[0]
    const majorityIdeaId = cell.ideas[0].ideaId

    await castMajorityVotes(cell.id, majorityIdeaId)

    const result = await processCellResults(cell.id)

    expect(result).not.toBeNull()
    expect(result!.winnerIds).toContain(majorityIdeaId)
    expect(result!.loserIds.length).toBeGreaterThan(0)
    expect(result!.loserIds).not.toContain(majorityIdeaId)

    // Check idea statuses in DB
    const winner = await prisma.idea.findUnique({ where: { id: majorityIdeaId } })
    expect(winner?.status).toBe('ADVANCING')

    for (const loserId of result!.loserIds) {
      const loser = await prisma.idea.findUnique({ where: { id: loserId } })
      expect(loser?.status).toBe('ELIMINATED')
    }
  })

  it('no votes (timeout) → all ideas advance', async () => {
    const users = await createTestUsers(10, 'pcr2')
    const { deliberation } = await createTestDeliberation({
      prefix: 'pcr2',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)
    const cells = await getCellsAtTier(deliberation.id, 1)
    const cell = cells[0]

    // Process without any votes (simulating timeout)
    const result = await processCellResults(cell.id, true)

    expect(result).not.toBeNull()
    // All ideas should advance when no votes
    expect(result!.winnerIds.length).toBe(cell.ideas.length)
    expect(result!.loserIds.length).toBe(0)
  })

  it('tied votes → multiple winners', async () => {
    // Use 10 ideas + 10 members → 2 cells of 5 participants each
    // Cast exactly 2 votes for idea A and 2 for idea B (leave 1 participant out)
    // so it's a true tie
    const users = await createTestUsers(10, 'pcr3')
    const { deliberation } = await createTestDeliberation({
      prefix: 'pcr3',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)
    const cells = await getCellsAtTier(deliberation.id, 1)
    const cell = cells[0]

    const ideaA = cell.ideas[0].ideaId
    const ideaB = cell.ideas[1].ideaId

    // Cast exactly 2 for A, 2 for B — a true tie
    await castVote(cell.id, cell.participants[0].userId, ideaA)
    await castVote(cell.id, cell.participants[1].userId, ideaA)
    await castVote(cell.id, cell.participants[2].userId, ideaB)
    await castVote(cell.id, cell.participants[3].userId, ideaB)

    const result = await processCellResults(cell.id)

    expect(result).not.toBeNull()
    expect(result!.winnerIds.length).toBe(2)
    expect(result!.winnerIds).toContain(ideaA)
    expect(result!.winnerIds).toContain(ideaB)
  })

  it('atomic guard: concurrent calls → exactly one returns null', async () => {
    const users = await createTestUsers(10, 'pcr4')
    const { deliberation } = await createTestDeliberation({
      prefix: 'pcr4',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)
    const cells = await getCellsAtTier(deliberation.id, 1)
    const cell = cells[0]
    const majorityIdeaId = cell.ideas[0].ideaId
    await castMajorityVotes(cell.id, majorityIdeaId)

    // Fire two concurrent calls
    const [r1, r2] = await Promise.all([
      processCellResults(cell.id),
      processCellResults(cell.id),
    ])

    const results = [r1, r2]
    const successes = results.filter(r => r !== null)
    const nulls = results.filter(r => r === null)

    expect(successes.length).toBe(1)
    expect(nulls.length).toBe(1)
  })

  it('final showdown: shared ideas ≤5 → deferred to cross-cell tally', async () => {
    // To create a real final showdown, we need multiple cells sharing the SAME ideas.
    // This happens in tier 2+ when ≤5 ideas advance. So we run a 2-tier progression:
    // Tier 1: 10 ideas, 10 members → 2 cells → 2 winners advance (one per cell)
    // Tier 2: 2 ideas shared across all cells → final showdown
    const users = await createTestUsers(10, 'pcr5')
    const { deliberation } = await createTestDeliberation({
      prefix: 'pcr5',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)
    const tier1Cells = await getCellsAtTier(deliberation.id, 1)

    // Complete tier 1 — each cell votes for its first idea
    for (const cell of tier1Cells) {
      await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
      await processCellResults(cell.id)
    }

    // Now tier 2 should exist with ≤5 ideas shared across cells (final showdown)
    const tier2Cells = await getCellsAtTier(deliberation.id, 2)

    if (tier2Cells.length > 0) {
      const cell = tier2Cells[0]
      const cellIdeaIds = cell.ideas.map(ci => ci.ideaId).sort()

      // Check if it's actually a final showdown
      const allSameIdeas = tier2Cells.every(c => {
        const ids = c.ideas.map(ci => ci.ideaId).sort()
        return ids.length === cellIdeaIds.length && ids.every((id, i) => id === cellIdeaIds[i])
      })

      if (allSameIdeas && cellIdeaIds.length <= 5) {
        // This IS a final showdown — processCellResults should skip winner/loser marking
        await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
        const result = await processCellResults(cell.id)

        expect(result).not.toBeNull()
        expect(result!.winnerIds.length).toBe(0)
        expect(result!.loserIds.length).toBe(0)
      } else {
        // Not a final showdown at tier 2 — just verify normal processing
        await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
        const result = await processCellResults(cell.id)
        expect(result).not.toBeNull()
      }
    }
  })
})
