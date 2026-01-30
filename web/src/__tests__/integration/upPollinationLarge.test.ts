import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { startVotingPhase, processCellResults } from '@/lib/voting'
import { createTestUsers, createTestDeliberation } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'
import { castMajorityVotes, getCellsAtTier } from '../helpers/voting-helpers'

afterEach(async () => {
  await cleanupTestData()
}, 60000)

describe('up-pollination at scale', () => {
  it('100 users, 50 ideas — comments promoted through multiple tiers', async () => {
    const users = await createTestUsers(100, 'upl1')
    const { deliberation } = await createTestDeliberation({
      prefix: 'upl1',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 50,
    })

    await startVotingPhase(deliberation.id)

    // Seed comments at tier 1 on the first idea per cell
    const seededCommentIds: string[] = []
    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    for (const cell of tier1Cells) {
      const ideaId = cell.ideas[0]?.ideaId
      if (!ideaId) continue

      const comment = await prisma.comment.create({
        data: {
          cellId: cell.id,
          userId: cell.participants[0].userId,
          ideaId,
          text: `Tier 1 insight on ${ideaId.slice(-6)}`,
          reachTier: 1,
          upvoteCount: 3,
          tierUpvotes: 3,
        },
      })
      seededCommentIds.push(comment.id)
    }

    // Run through all tiers
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
    expect(d?.phase).toBe('COMPLETED')
    expect(d?.championId).not.toBeNull()

    // Check promotion results
    const finalComments = await prisma.comment.findMany({
      where: { id: { in: seededCommentIds } },
      orderBy: { reachTier: 'desc' },
    })

    const promoted = finalComments.filter(c => c.reachTier > 1)
    const maxReach = Math.max(...finalComments.map(c => c.reachTier))

    console.log(`100-user test:`)
    console.log(`  Tiers traversed: ${tier}`)
    console.log(`  Seeded comments: ${seededCommentIds.length}`)
    console.log(`  Promoted: ${promoted.length}`)
    console.log(`  Max reachTier: ${maxReach}`)
    for (let t = 1; t <= maxReach; t++) {
      console.log(`    Tier ${t}: ${finalComments.filter(c => c.reachTier === t).length}`)
    }

    // Core assertions
    expect(promoted.length).toBeGreaterThan(0)
    expect(maxReach).toBeGreaterThanOrEqual(2)

    // Votes should carry forward (not reset)
    for (const c of promoted) {
      expect(c.upvoteCount).toBeGreaterThanOrEqual(1)
    }
  }, 120000)

  it('200 users, 100 ideas — comments climb through full deliberation', async () => {
    const users = await createTestUsers(200, 'upl2')
    const { deliberation } = await createTestDeliberation({
      prefix: 'upl2',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 100,
    })

    await startVotingPhase(deliberation.id)

    // Seed one comment per cell at tier 1
    const seededCommentIds: string[] = []
    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    for (const cell of tier1Cells) {
      const ideaId = cell.ideas[0]?.ideaId
      if (!ideaId) continue

      const comment = await prisma.comment.create({
        data: {
          cellId: cell.id,
          userId: cell.participants[0].userId,
          ideaId,
          text: `Original thought on ${ideaId.slice(-6)}`,
          reachTier: 1,
          upvoteCount: 4,
          tierUpvotes: 4,
        },
      })
      seededCommentIds.push(comment.id)
    }

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
    expect(d?.phase).toBe('COMPLETED')
    expect(tier).toBeGreaterThanOrEqual(3)

    const finalComments = await prisma.comment.findMany({
      where: { id: { in: seededCommentIds } },
      orderBy: { reachTier: 'desc' },
    })

    const maxReach = Math.max(...finalComments.map(c => c.reachTier))
    const promoted = finalComments.filter(c => c.reachTier > 1)

    console.log(`200-user test:`)
    console.log(`  Tiers traversed: ${tier}`)
    console.log(`  Seeded comments: ${seededCommentIds.length}`)
    console.log(`  Promoted: ${promoted.length}`)
    console.log(`  Max reachTier: ${maxReach}`)
    for (let t = 1; t <= maxReach; t++) {
      console.log(`    Tier ${t}: ${finalComments.filter(c => c.reachTier === t).length}`)
    }

    expect(maxReach).toBeGreaterThanOrEqual(2)
    expect(promoted.length).toBeGreaterThan(0)
  }, 120000)

  it('1000 users, 200 ideas — stress test with multi-tier climbing', async () => {
    const users = await createTestUsers(1000, 'upl3')
    const { deliberation } = await createTestDeliberation({
      prefix: 'upl3',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 200,
    })

    await startVotingPhase(deliberation.id)

    // Seed comments at tier 1
    const seededCommentIds: string[] = []
    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    for (const cell of tier1Cells) {
      const ideaId = cell.ideas[0]?.ideaId
      if (!ideaId) continue

      const comment = await prisma.comment.create({
        data: {
          cellId: cell.id,
          userId: cell.participants[0].userId,
          ideaId,
          text: `Stress test comment on ${ideaId.slice(-6)}`,
          reachTier: 1,
          upvoteCount: 3,
          tierUpvotes: 3,
        },
      })
      seededCommentIds.push(comment.id)
    }

    let tier = 1
    const maxTiers = 12

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
    expect(d?.phase).toBe('COMPLETED')
    expect(d?.championId).not.toBeNull()

    const finalComments = await prisma.comment.findMany({
      where: { id: { in: seededCommentIds } },
      orderBy: { reachTier: 'desc' },
    })

    const maxReach = Math.max(...finalComments.map(c => c.reachTier))
    const promoted = finalComments.filter(c => c.reachTier > 1)

    console.log(`1000-user stress test:`)
    console.log(`  Tiers traversed: ${tier}`)
    console.log(`  Tier 1 cells: ${tier1Cells.length}`)
    console.log(`  Seeded comments: ${seededCommentIds.length}`)
    console.log(`  Promoted: ${promoted.length}`)
    console.log(`  Max reachTier: ${maxReach}`)
    for (let t = 1; t <= maxReach; t++) {
      console.log(`    Tier ${t}: ${finalComments.filter(c => c.reachTier === t).length}`)
    }

    // Comments should climb multiple tiers now
    expect(maxReach).toBeGreaterThanOrEqual(2)
    expect(promoted.length).toBeGreaterThan(0)
  }, 300000)
})
