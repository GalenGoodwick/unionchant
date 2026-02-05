import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { startVotingPhase, processCellResults } from '@/lib/voting'
import { createTestUsers, createTestDeliberation } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'
import { castMajorityVotes, getCellsAtTier } from '../helpers/voting-helpers'

afterEach(async () => {
  await cleanupTestData()
}, 60000)

describe('up-pollination', () => {
  it('top comment per idea is promoted when tier completes', async () => {
    const users = await createTestUsers(10, 'up1')
    const { deliberation, ideas } = await createTestDeliberation({
      prefix: 'up1',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)

    // Get tier 1 cells
    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    expect(tier1Cells.length).toBeGreaterThan(0)

    // Add comments with upvotes to tier 1 cells
    const commentsCreated: string[] = []
    for (const cell of tier1Cells) {
      const ideaId = cell.ideas[0]?.ideaId
      if (!ideaId) continue

      // Create a comment on this idea with 2 upvotes
      const comment = await prisma.comment.create({
        data: {
          cellId: cell.id,
          userId: cell.participants[0].userId,
          ideaId,
          text: `Great point about idea ${ideaId}`,
          reachTier: 1,
          upvoteCount: 2,
          tierUpvotes: 2,
        },
      })
      commentsCreated.push(comment.id)

      // Create a weaker comment on the same idea (should NOT be promoted)
      const weakComment = await prisma.comment.create({
        data: {
          cellId: cell.id,
          userId: cell.participants.length > 1 ? cell.participants[1].userId : cell.participants[0].userId,
          ideaId,
          text: `Meh comment about idea ${ideaId}`,
          reachTier: 1,
          upvoteCount: 0,
          tierUpvotes: 0,
        },
      })
      commentsCreated.push(weakComment.id)
    }

    // Vote in all tier 1 cells to complete the tier
    for (const cell of tier1Cells) {
      await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
      await processCellResults(cell.id)
    }

    // Check deliberation advanced
    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(d?.currentTier).toBeGreaterThanOrEqual(2)

    // Check that top comments were promoted to tier 2
    const promotedComments = await prisma.comment.findMany({
      where: {
        id: { in: commentsCreated },
        reachTier: { gte: 2 },
      },
    })

    // At least one comment should have been promoted
    expect(promotedComments.length).toBeGreaterThan(0)

    // All promoted comments should have had upvotes
    for (const c of promotedComments) {
      expect(c.upvoteCount).toBeGreaterThanOrEqual(1)
    }

    // Promoted comments should have spreadCount and tierUpvotes reset for fresh start at new tier
    for (const c of promotedComments) {
      expect(c.spreadCount).toBe(0)
      expect(c.tierUpvotes).toBe(0)
    }

    // Weak comments (0 upvotes) should NOT be promoted
    const weakComments = await prisma.comment.findMany({
      where: {
        id: { in: commentsCreated },
        upvoteCount: 0,
      },
    })
    for (const c of weakComments) {
      expect(c.reachTier).toBe(1)
    }
  }, 30000)

  it('tied comments both get promoted', async () => {
    const users = await createTestUsers(10, 'up2')
    const { deliberation } = await createTestDeliberation({
      prefix: 'up2',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)

    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    const cell = tier1Cells[0]
    const ideaId = cell.ideas[0].ideaId

    // Create two comments with same upvote count (tied)
    const comment1 = await prisma.comment.create({
      data: {
        cellId: cell.id,
        userId: cell.participants[0].userId,
        ideaId,
        text: 'Tied comment A',
        reachTier: 1,
        upvoteCount: 3,
        tierUpvotes: 3,
      },
    })

    const comment2 = await prisma.comment.create({
      data: {
        cellId: cell.id,
        userId: cell.participants.length > 1 ? cell.participants[1].userId : cell.participants[0].userId,
        ideaId,
        text: 'Tied comment B',
        reachTier: 1,
        upvoteCount: 3,
        tierUpvotes: 3,
      },
    })

    // Complete all tier 1 cells
    for (const c of tier1Cells) {
      await castMajorityVotes(c.id, c.ideas[0].ideaId)
      await processCellResults(c.id)
    }

    // Both tied comments should be promoted
    const promoted = await prisma.comment.findMany({
      where: {
        id: { in: [comment1.id, comment2.id] },
        reachTier: { gte: 2 },
      },
    })

    expect(promoted.length).toBe(2)
  }, 30000)

  it('unlinked comments (no ideaId) are NOT promoted', async () => {
    const users = await createTestUsers(10, 'up3')
    const { deliberation } = await createTestDeliberation({
      prefix: 'up3',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)

    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    const cell = tier1Cells[0]

    // Create an unlinked comment with upvotes
    const unlinkedComment = await prisma.comment.create({
      data: {
        cellId: cell.id,
        userId: cell.participants[0].userId,
        ideaId: null,
        text: 'General discussion point',
        reachTier: 1,
        upvoteCount: 2,
        tierUpvotes: 2,
      },
    })

    // Complete all tier 1 cells
    for (const c of tier1Cells) {
      await castMajorityVotes(c.id, c.ideas[0].ideaId)
      await processCellResults(c.id)
    }

    // Unlinked comment should NOT be promoted (only idea-linked comments spread now)
    const result = await prisma.comment.findUnique({
      where: { id: unlinkedComment.id },
    })

    expect(result?.reachTier).toBe(1)
  }, 30000)

  it('comments with 0 upvotes are never promoted', async () => {
    const users = await createTestUsers(10, 'up4')
    const { deliberation } = await createTestDeliberation({
      prefix: 'up4',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)

    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    const cell = tier1Cells[0]
    const ideaId = cell.ideas[0].ideaId

    // Create comment with 0 upvotes
    const zeroComment = await prisma.comment.create({
      data: {
        cellId: cell.id,
        userId: cell.participants[0].userId,
        ideaId,
        text: 'Nobody liked this',
        reachTier: 1,
        upvoteCount: 0,
        tierUpvotes: 0,
      },
    })

    // Complete all tier 1 cells
    for (const c of tier1Cells) {
      await castMajorityVotes(c.id, c.ideas[0].ideaId)
      await processCellResults(c.id)
    }

    const result = await prisma.comment.findUnique({
      where: { id: zeroComment.id },
    })

    expect(result?.reachTier).toBe(1)
  }, 30000)

  it('comments already at next tier are not re-promoted', async () => {
    const users = await createTestUsers(10, 'up5')
    const { deliberation } = await createTestDeliberation({
      prefix: 'up5',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)

    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    const cell = tier1Cells[0]
    const ideaId = cell.ideas[0].ideaId

    // Create comment already at tier 2 (manually promoted earlier)
    const alreadyPromoted = await prisma.comment.create({
      data: {
        cellId: cell.id,
        userId: cell.participants[0].userId,
        ideaId,
        text: 'Already promoted',
        reachTier: 2,
        upvoteCount: 5,
        tierUpvotes: 0,
      },
    })

    // Complete all tier 1 cells
    for (const c of tier1Cells) {
      await castMajorityVotes(c.id, c.ideas[0].ideaId)
      await processCellResults(c.id)
    }

    // Should still be at tier 2, not bumped further
    const result = await prisma.comment.findUnique({
      where: { id: alreadyPromoted.id },
    })

    expect(result?.reachTier).toBe(2)
  }, 30000)
})
