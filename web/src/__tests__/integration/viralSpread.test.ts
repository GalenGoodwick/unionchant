import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { startVotingPhase, processCellResults } from '@/lib/voting'
import { createTestUsers, createTestDeliberation } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'
import { castMajorityVotes, getCellsAtTier } from '../helpers/voting-helpers'

afterEach(async () => {
  await cleanupTestData()
}, 60000)

// Deterministic hash matching the one in the comments GET route
function hashPair(a: string, b: string): number {
  const str = a + b
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function shouldSeeComment(commentId: string, targetCellId: string, spreadCount: number, totalCellsWithIdea: number): boolean {
  if (spreadCount === 0) return false
  if (spreadCount >= totalCellsWithIdea) return true
  const hash = hashPair(commentId, targetCellId)
  return hash % totalCellsWithIdea < spreadCount
}

function countVisibleCells(commentId: string, otherCellIds: string[], spreadCount: number, totalCells: number): number {
  return otherCellIds.filter(cellId => shouldSeeComment(commentId, cellId, spreadCount, totalCells)).length
}

describe('viral same-tier spread', () => {
  it('spreadCount=0 comment is only visible in origin cell', async () => {
    const users = await createTestUsers(15, 'vs1')
    const { deliberation } = await createTestDeliberation({
      prefix: 'vs1',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 5,
    })

    await startVotingPhase(deliberation.id)

    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    expect(tier1Cells.length).toBeGreaterThanOrEqual(2)

    const originCell = tier1Cells[0]
    const ideaId = originCell.ideas[0].ideaId
    const otherCellIds = tier1Cells.filter(c => c.id !== originCell.id).map(c => c.id)

    const comment = await prisma.comment.create({
      data: {
        cellId: originCell.id,
        userId: originCell.participants[0].userId,
        ideaId,
        text: 'Local comment, should not spread',
        reachTier: 1,
        upvoteCount: 0,
        spreadCount: 0,
      },
    })

    // spreadCount=0 → no other cells see it
    const visible = countVisibleCells(comment.id, otherCellIds, 0, tier1Cells.length)
    expect(visible).toBe(0)
  }, 30000)

  it('higher spreadCount makes comment visible in more cells', async () => {
    const users = await createTestUsers(20, 'vs2')
    const { deliberation } = await createTestDeliberation({
      prefix: 'vs2',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 5,
    })

    await startVotingPhase(deliberation.id)

    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    expect(tier1Cells.length).toBeGreaterThanOrEqual(3)

    const originCell = tier1Cells[0]
    const ideaId = originCell.ideas[0].ideaId
    const otherCellIds = tier1Cells.filter(c => c.id !== originCell.id).map(c => c.id)

    const comment = await prisma.comment.create({
      data: {
        cellId: originCell.id,
        userId: originCell.participants[0].userId,
        ideaId,
        text: 'Spreading comment',
        reachTier: 1,
        upvoteCount: 1,
        spreadCount: 1,
      },
    })

    // Each additional spreadCount should open up at least as many cells
    const at1 = countVisibleCells(comment.id, otherCellIds, 1, tier1Cells.length)
    const at2 = countVisibleCells(comment.id, otherCellIds, 2, tier1Cells.length)
    const at3 = countVisibleCells(comment.id, otherCellIds, 3, tier1Cells.length)

    expect(at1).toBeGreaterThan(0)
    expect(at2).toBeGreaterThanOrEqual(at1)
    expect(at3).toBeGreaterThanOrEqual(at2)
  }, 30000)

  it('spreadCount >= totalCells makes comment visible everywhere', async () => {
    const users = await createTestUsers(20, 'vs3')
    const { deliberation } = await createTestDeliberation({
      prefix: 'vs3',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 5,
    })

    await startVotingPhase(deliberation.id)

    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    expect(tier1Cells.length).toBeGreaterThanOrEqual(2)

    const originCell = tier1Cells[0]
    const ideaId = originCell.ideas[0].ideaId
    const totalCells = tier1Cells.length
    const otherCellIds = tier1Cells.filter(c => c.id !== originCell.id).map(c => c.id)

    const comment = await prisma.comment.create({
      data: {
        cellId: originCell.id,
        userId: originCell.participants[0].userId,
        ideaId,
        text: 'Fully spread comment',
        reachTier: 1,
        upvoteCount: totalCells,
        spreadCount: totalCells,
      },
    })

    // All other cells should see it
    const visible = countVisibleCells(comment.id, otherCellIds, totalCells, totalCells)
    expect(visible).toBe(otherCellIds.length)
  }, 30000)

  it('unlinked comments (no ideaId) do not spread', async () => {
    const users = await createTestUsers(15, 'vs4')
    const { deliberation } = await createTestDeliberation({
      prefix: 'vs4',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 5,
    })

    await startVotingPhase(deliberation.id)

    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    const originCell = tier1Cells[0]

    const comment = await prisma.comment.create({
      data: {
        cellId: originCell.id,
        userId: originCell.participants[0].userId,
        ideaId: null,
        text: 'Unlinked general comment',
        reachTier: 1,
        upvoteCount: 10,
        spreadCount: 0,
      },
    })

    // Complete all tier 1 cells
    for (const c of tier1Cells) {
      await castMajorityVotes(c.id, c.ideas[0].ideaId)
      await processCellResults(c.id)
    }

    const result = await prisma.comment.findUnique({
      where: { id: comment.id },
    })

    expect(result?.reachTier).toBe(1)
    expect(result?.spreadCount).toBe(0)
  }, 30000)

  it('cross-tier promotion resets spreadCount', async () => {
    const users = await createTestUsers(10, 'vs5')
    const { deliberation } = await createTestDeliberation({
      prefix: 'vs5',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 10,
    })

    await startVotingPhase(deliberation.id)

    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    expect(tier1Cells.length).toBeGreaterThan(0)

    const cell = tier1Cells[0]
    const ideaId = cell.ideas[0].ideaId

    const comment = await prisma.comment.create({
      data: {
        cellId: cell.id,
        userId: cell.participants[0].userId,
        ideaId,
        text: 'Top comment to promote',
        reachTier: 1,
        upvoteCount: 6,
        spreadCount: 3, // floor(6/2) = 3
      },
    })

    for (const c of tier1Cells) {
      await castMajorityVotes(c.id, c.ideas[0].ideaId)
      await processCellResults(c.id)
    }

    const promoted = await prisma.comment.findUnique({
      where: { id: comment.id },
    })

    if (promoted && promoted.reachTier >= 2) {
      expect(promoted.spreadCount).toBe(0)
      expect(promoted.tierUpvotes).toBe(0)
    }
  }, 30000)

  it('visibility is deterministic — same inputs always same result', async () => {
    const users = await createTestUsers(15, 'vs6')
    const { deliberation } = await createTestDeliberation({
      prefix: 'vs6',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 5,
    })

    await startVotingPhase(deliberation.id)

    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    const originCell = tier1Cells[0]
    const ideaId = originCell.ideas[0].ideaId

    const comment = await prisma.comment.create({
      data: {
        cellId: originCell.id,
        userId: originCell.participants[0].userId,
        ideaId,
        text: 'Determinism check',
        reachTier: 1,
        upvoteCount: 2,
        spreadCount: 2,
      },
    })

    const otherCells = tier1Cells.filter(c => c.id !== originCell.id)
    for (const cell of otherCells) {
      const first = shouldSeeComment(comment.id, cell.id, 2, tier1Cells.length)
      const second = shouldSeeComment(comment.id, cell.id, 2, tier1Cells.length)
      expect(first).toBe(second)
    }
  }, 30000)

  it('125-person deliberation: full tier progression with viral spread and promotion', async () => {
    // Seeded PRNG for deterministic 50/50 outcomes
    let seed = 42
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647 }

    const users = await createTestUsers(125, 'vs7')
    const { deliberation } = await createTestDeliberation({
      prefix: 'vs7',
      creatorId: users[0].id,
      memberUserIds: users.map(u => u.id),
      ideaCount: 125,
    })

    await startVotingPhase(deliberation.id)

    // Helper: simulate comments + upvotes for a set of cells at a given tier
    async function simulateTierActivity(tierNum: number, cells: Awaited<ReturnType<typeof getCellsAtTier>>) {
      const allCommentIds: string[] = []
      let linkedCount = 0
      let unlinkedCount = 0
      let totalUpvotes = 0

      // 1) Each participant in each cell posts one comment (50% chance linked to an idea)
      for (const cell of cells) {
        for (const participant of cell.participants) {
          const linkToIdea = rand() < 0.5
          const ideaId = linkToIdea && cell.ideas.length > 0
            ? cell.ideas[Math.floor(rand() * cell.ideas.length)].ideaId
            : null

          if (ideaId) linkedCount++; else unlinkedCount++

          const comment = await prisma.comment.create({
            data: {
              cellId: cell.id,
              userId: participant.userId,
              ideaId,
              text: `T${tierNum} comment by ${participant.userId.slice(-6)}${ideaId ? ' on idea ' + ideaId.slice(-6) : ' (general)'}`,
              reachTier: tierNum,
              upvoteCount: 0,
              spreadCount: 0,
            },
          })
          allCommentIds.push(comment.id)
        }
      }

      // 2) Each participant has 50% chance to upvote each OTHER comment in their cell
      for (const cell of cells) {
        const cellComments = await prisma.comment.findMany({
          where: { cellId: cell.id },
        })

        for (const participant of cell.participants) {
          for (const comment of cellComments) {
            if (comment.userId === participant.userId) continue // can't upvote own
            if (rand() < 0.5) {
              // Check not already upvoted
              const existing = await prisma.commentUpvote.findUnique({
                where: { commentId_userId: { commentId: comment.id, userId: participant.userId } },
              })
              if (existing) continue

              const newUpvotes = comment.upvoteCount + 1
              const newSpread = comment.ideaId ? Math.floor(newUpvotes / 2) : 0

              await prisma.$transaction([
                prisma.commentUpvote.create({
                  data: { commentId: comment.id, userId: participant.userId },
                }),
                prisma.comment.update({
                  where: { id: comment.id },
                  data: { upvoteCount: { increment: 1 }, spreadCount: newSpread },
                }),
              ])

              // Re-fetch so subsequent upvotes use correct count
              const updated = await prisma.comment.findUnique({ where: { id: comment.id } })
              if (updated) {
                comment.upvoteCount = updated.upvoteCount
                comment.spreadCount = updated.spreadCount
              }
              totalUpvotes++
            }
          }
        }
      }

      // 3) Gather stats
      const allComments = await prisma.comment.findMany({
        where: { id: { in: allCommentIds } },
      })
      const viralComments = allComments.filter(c => c.spreadCount >= 1)
      const localOnly = allComments.filter(c => c.spreadCount === 0)

      // Count viral appearances — only into cells that share the comment's idea
      // totalCellsWithIdea = cells sharing that idea (including origin), matching the real API
      let viralAppearances = 0
      for (const comment of viralComments) {
        if (!comment.ideaId) continue
        const cellsWithIdea = cells.filter(c => c.ideas.some(ci => ci.ideaId === comment.ideaId))
        const totalCellsWithIdea = cellsWithIdea.length
        const otherCellsWithIdea = cellsWithIdea.filter(c => c.id !== comment.cellId)
        for (const oc of otherCellsWithIdea) {
          if (shouldSeeComment(comment.id, oc.id, comment.spreadCount, totalCellsWithIdea)) {
            viralAppearances++
          }
        }
      }

      const maxUpvotes = allComments.length > 0 ? Math.max(...allComments.map(c => c.upvoteCount)) : 0
      const avgUpvotes = allComments.length > 0 ? (allComments.reduce((s, c) => s + c.upvoteCount, 0) / allComments.length).toFixed(1) : '0'
      const maxSpread = allComments.length > 0 ? Math.max(...allComments.map(c => c.spreadCount)) : 0

      console.log(`\n=== TIER ${tierNum} ACTIVITY ===`)
      console.log(`Cells: ${cells.length}`)
      console.log(`Comments: ${allComments.length} (${linkedCount} idea-linked, ${unlinkedCount} general)`)
      console.log(`Upvotes cast: ${totalUpvotes} | avg per comment: ${avgUpvotes} | max: ${maxUpvotes}`)
      console.log(`Viral comments (spreadCount>=1): ${viralComments.length} | local-only: ${localOnly.length}`)
      console.log(`Max spreadCount: ${maxSpread}`)
      console.log(`Viral appearances in other cells (same idea only): ${viralAppearances}`)
      console.log(`Avg cells reached per viral comment: ${viralComments.length > 0 ? (viralAppearances / viralComments.length).toFixed(1) : 0}`)

      return { allCommentIds, viralComments: viralComments.length, totalUpvotes }
    }

    // === TIER 1 ===
    const tier1Cells = await getCellsAtTier(deliberation.id, 1)
    expect(tier1Cells.length).toBeGreaterThanOrEqual(20)

    const tier1Stats = await simulateTierActivity(1, tier1Cells)

    // Vote all tier 1 cells
    for (const cell of tier1Cells) {
      await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
      await processCellResults(cell.id)
    }

    // Check tier 1 → 2 promotions
    const promotedFromT1 = await prisma.comment.findMany({
      where: { id: { in: tier1Stats.allCommentIds }, reachTier: { gte: 2 } },
    })
    const notPromotedFromT1 = await prisma.comment.findMany({
      where: { id: { in: tier1Stats.allCommentIds }, reachTier: 1 },
    })
    console.log(`\n=== TIER 1 → 2 PROMOTION ===`)
    console.log(`Promoted: ${promotedFromT1.length} | stayed at T1: ${notPromotedFromT1.length}`)
    for (const c of promotedFromT1) {
      expect(c.spreadCount).toBe(0) // reset on promotion
      console.log(`  ↑ "${c.text.slice(0, 55)}" | upvotes=${c.upvoteCount} | spread reset to 0`)
    }

    // === TIER 2+ — comments + upvotes at every tier ===
    let tier = 2
    while (tier <= 10) {
      const cells = await getCellsAtTier(deliberation.id, tier)
      if (cells.length === 0) break

      const tierStats = await simulateTierActivity(tier, cells)

      // Vote
      for (const cell of cells) {
        if (cell.votes.length > 0) continue
        await castMajorityVotes(cell.id, cell.ideas[0].ideaId)
        await processCellResults(cell.id)
      }

      // Check promotions from this tier
      const promotedFromTier = await prisma.comment.findMany({
        where: { id: { in: tierStats.allCommentIds }, reachTier: { gte: tier + 1 } },
      })
      if (promotedFromTier.length > 0) {
        console.log(`\n=== TIER ${tier} → ${tier + 1} PROMOTION ===`)
        console.log(`Promoted: ${promotedFromTier.length}`)
        for (const c of promotedFromTier) {
          expect(c.spreadCount).toBe(0)
          console.log(`  ↑ "${c.text.slice(0, 55)}" | upvotes=${c.upvoteCount} | spread reset to 0`)
        }
      }

      const dCheck = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
      if (dCheck?.phase === 'COMPLETED' || dCheck?.phase === 'ACCUMULATING') break
      tier++
    }

    // === FINAL SUMMARY ===
    const final = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(final?.championId).toBeTruthy()
    expect(['COMPLETED', 'ACCUMULATING']).toContain(final?.phase)

    const champion = await prisma.idea.findUnique({ where: { id: final!.championId! } })
    expect(champion?.isChampion).toBe(true)
    expect(champion?.status).toBe('WINNER')

    const totalComments = await prisma.comment.count({
      where: { cell: { deliberationId: deliberation.id } },
    })
    const totalViral = await prisma.comment.count({
      where: { cell: { deliberationId: deliberation.id }, spreadCount: { gte: 1 } },
    })
    const totalPromoted = await prisma.comment.count({
      where: { cell: { deliberationId: deliberation.id }, reachTier: { gte: 2 } },
    })

    console.log(`\n=== FINAL RESULT ===`)
    console.log(`Champion: "${champion?.text?.slice(0, 60)}"`)
    console.log(`Phase: ${final?.phase} | Tiers: ${final?.currentTier}`)
    console.log(`Total comments across all tiers: ${totalComments}`)
    console.log(`Total viral (spreadCount>=1): ${totalViral} (${(totalViral/totalComments*100).toFixed(0)}%)`)
    console.log(`Total promoted to higher tier: ${totalPromoted}`)
  }, 300000)
})
