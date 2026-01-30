import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { startVotingPhase, processCellResults } from '@/lib/voting'
import { createTestUsers, createTestDeliberation } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'
import { castMajorityVotes, getCellsAtTier } from '../helpers/voting-helpers'

afterEach(async () => {
  await cleanupTestData()
}, 120000)

describe('up-pollination stress', () => {
  it('5000 users, 10000 ideas — full scale test', async () => {
    console.log('Creating 5000 users...')
    const users = await createTestUsers(5000, 'stress')

    console.log('Creating deliberation with 10000 ideas...')
    const { deliberation } = await createTestDeliberation({
      prefix: 'stress',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10000,
    })

    console.log('Starting voting phase...')
    await startVotingPhase(deliberation.id)

    // Seed comments at tier 1
    const seededCommentIds: string[] = []
    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    console.log(`Tier 1: ${tier1Cells.length} cells`)

    // Seed a comment on every 5th cell to keep it manageable
    for (let i = 0; i < tier1Cells.length; i += 5) {
      const cell = tier1Cells[i]
      const ideaId = cell.ideas[0]?.ideaId
      if (!ideaId) continue

      const comment = await prisma.comment.create({
        data: {
          cellId: cell.id,
          userId: cell.participants[0].userId,
          ideaId,
          text: `Stress comment ${i}`,
          reachTier: 1,
          upvoteCount: 3,
          tierUpvotes: 3,
        },
      })
      seededCommentIds.push(comment.id)
    }
    console.log(`Seeded ${seededCommentIds.length} comments`)

    let tier = 1
    const maxTiers = 15

    while (tier <= maxTiers) {
      const cells = await getCellsAtTier(deliberation.id, tier)
      if (cells.length === 0) break

      console.log(`Tier ${tier}: ${cells.length} cells, voting...`)

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

    console.log(`\n=== 10k IDEAS STRESS TEST ===`)
    console.log(`  Tiers traversed: ${tier}`)
    console.log(`  Tier 1 cells: ${tier1Cells.length}`)
    console.log(`  Seeded comments: ${seededCommentIds.length}`)
    console.log(`  Promoted: ${promoted.length}`)
    console.log(`  Max reachTier: ${maxReach}`)
    for (let t = 1; t <= maxReach; t++) {
      console.log(`    Tier ${t}: ${finalComments.filter(c => c.reachTier === t).length}`)
    }

    expect(maxReach).toBeGreaterThanOrEqual(2)
    expect(promoted.length).toBeGreaterThan(0)
  }, 600000)
})
