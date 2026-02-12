/**
 * Shared Foresight Score computation.
 *
 * Used by:
 * - GET /api/v1/agents/:id/reputation (API endpoint)
 * - POST /api/v1/badges/mint (badge minting)
 * - /agents/:id (agent detail page)
 * - /embed/agent/:id (embeddable badge)
 * - GET /api/embed/agent/:id (embed API)
 *
 * Formula:
 *   foresightScore = ideaViability * 0.40 + votingAccuracy * 0.35 + commentStrength * 0.25
 *
 * Pillars:
 *   Idea Viability (40%)  — How far ideas advance through tiers (exponential weighting)
 *   Voting Accuracy (35%) — XP allocated to cell winners
 *   Comment Strength (25%) — Comments that spread across cells via up-pollination
 */

import { prisma } from '@/lib/prisma'

export interface ReputationResult {
  agentId: string
  name: string | null
  isAI: boolean
  memberSince: string

  foresightScore: number
  pillars: {
    ideaViability: number
    votingAccuracy: number
    commentStrength: number
  }
  formula: string

  stats: {
    deliberationsParticipated: number
    ideasSubmitted: number
    ideasAdvanced: number
    ideasWon: number
    advancementRate: number
    winRate: number
    highestTierReached: number
    totalVotesCast: number
    votingAccuracy: number
    predictionAccuracy: number
    totalComments: number
    spreadComments: number
    totalUpvotes: number
    currentStreak: number
    bestStreak: number
    championPicks: number
  }
}

/**
 * Compute the full reputation profile for a user/agent.
 * Returns null if user not found.
 */
export async function computeReputation(userId: string): Promise<ReputationResult | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, isAI: true, createdAt: true,
      totalPredictions: true, correctPredictions: true,
      championPicks: true, currentStreak: true, bestStreak: true,
    },
  })

  if (!user) return null

  // ── Participation ──
  const deliberationsParticipated = await prisma.deliberationMember.count({
    where: { userId },
  })

  // ── Ideas ──
  const ideas = await prisma.idea.findMany({
    where: { authorId: userId },
    select: { id: true, status: true, tier: true },
  })

  const ideasSubmitted = ideas.length
  const ideasAdvanced = ideas.filter(i =>
    i.status === 'ADVANCING' || i.status === 'WINNER' || i.status === 'DEFENDING'
  ).length
  const ideasWon = ideas.filter(i => i.status === 'WINNER').length
  const highestTier = ideas.reduce((max, i) => Math.max(max, i.tier), 0)
  const advancementRate = ideasSubmitted > 0 ? ideasAdvanced / ideasSubmitted : 0
  const winRate = ideasSubmitted > 0 ? ideasWon / ideasSubmitted : 0

  // ── Idea Viability (40%) — exponential tier weighting ──
  // T1=1, T2=3, T3=9, T4=27, Winner=50
  // Normalized against max possible (if all ideas won)
  let tierScore = 0
  let maxTierScore = 0
  for (const idea of ideas) {
    const t = idea.tier
    const isWinner = idea.status === 'WINNER'
    if (isWinner) {
      tierScore += 50
    } else if (t > 0) {
      tierScore += Math.pow(3, t - 1) // 1, 3, 9, 27...
    }
    maxTierScore += 50 // best case: every idea wins
  }
  const ideaViability = maxTierScore > 0 ? Math.min(tierScore / maxTierScore, 1) : 0

  // ── Voting Accuracy (35%) — XP given to cell winners ──
  const totalVotesCastRaw = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(DISTINCT "cellId" || '-' || "userId") as count FROM "Vote" WHERE "userId" = ${userId}
  `
  const voteCount = Number(totalVotesCastRaw[0]?.count || 0)

  const completedCells = await prisma.cell.findMany({
    where: {
      status: 'COMPLETED',
      participants: { some: { userId } },
    },
    select: { id: true },
  })

  let accuracySum = 0
  let accuracyCount = 0

  if (completedCells.length > 0) {
    for (const cell of completedCells.slice(0, 50)) {
      const myVotes = await prisma.$queryRaw<{ ideaId: string; xpPoints: number }[]>`
        SELECT "ideaId", "xpPoints" FROM "Vote" WHERE "cellId" = ${cell.id} AND "userId" = ${userId}
      `
      if (myVotes.length === 0) continue

      const cellTotals = await prisma.$queryRaw<{ ideaId: string; total: bigint }[]>`
        SELECT "ideaId", SUM("xpPoints") as total FROM "Vote" WHERE "cellId" = ${cell.id}
        GROUP BY "ideaId" ORDER BY total DESC LIMIT 1
      `
      if (cellTotals.length === 0) continue

      const winnerId = cellTotals[0].ideaId
      const totalXP = myVotes.reduce((s, v) => s + v.xpPoints, 0)
      const winnerXP = myVotes.find(v => v.ideaId === winnerId)?.xpPoints || 0
      accuracySum += winnerXP / totalXP
      accuracyCount++
    }
  }

  const votingAccuracy = accuracyCount > 0 ? accuracySum / accuracyCount : 0

  // ── Comment Strength (25%) — comments that spread across cells ──
  const comments = await prisma.comment.findMany({
    where: { userId, isRemoved: false },
    select: { id: true, spreadCount: true, upvoteCount: true, reachTier: true },
  })

  const totalComments = comments.length
  const spreadComments = comments.filter(c => c.spreadCount > 0).length
  const totalUpvotes = comments.reduce((sum, c) => sum + c.upvoteCount, 0)

  // Comment strength: weighted by spread + upvotes
  // spreadCount 1 = reached ~3 cells, 2 = ~9, 3+ = all
  // Normalize: a perfect commenter would have all comments spread to 3+ with 10+ upvotes each
  let commentScore = 0
  for (const c of comments) {
    const spreadWeight = Math.min(c.spreadCount, 3) / 3 // 0-1 based on spread
    const upvoteWeight = Math.min(c.upvoteCount, 10) / 10 // 0-1 based on upvotes
    commentScore += (spreadWeight * 0.6 + upvoteWeight * 0.4)
  }
  const commentStrength = totalComments > 0 ? Math.min(commentScore / totalComments, 1) : 0

  // ── Prediction accuracy (included in stats, not in pillars) ──
  const predictionAccuracy = user.totalPredictions > 0
    ? user.correctPredictions / user.totalPredictions
    : 0

  // ── Foresight Score ──
  const foresightScore = Math.round((
    ideaViability * 0.40 +
    votingAccuracy * 0.35 +
    commentStrength * 0.25
  ) * 100) / 100

  return {
    agentId: user.id,
    name: user.name,
    isAI: user.isAI,
    memberSince: user.createdAt.toISOString(),
    foresightScore,
    pillars: {
      ideaViability: Math.round(ideaViability * 100) / 100,
      votingAccuracy: Math.round(votingAccuracy * 100) / 100,
      commentStrength: Math.round(commentStrength * 100) / 100,
    },
    formula: 'idea_viability * 0.40 + voting_accuracy * 0.35 + comment_strength * 0.25',
    stats: {
      deliberationsParticipated,
      ideasSubmitted,
      ideasAdvanced,
      ideasWon,
      advancementRate: Math.round(advancementRate * 100) / 100,
      winRate: Math.round(winRate * 100) / 100,
      highestTierReached: highestTier,
      totalVotesCast: voteCount,
      votingAccuracy: Math.round(votingAccuracy * 100) / 100,
      predictionAccuracy: Math.round(predictionAccuracy * 100) / 100,
      totalComments,
      spreadComments,
      totalUpvotes,
      currentStreak: user.currentStreak,
      bestStreak: user.bestStreak,
      championPicks: user.championPicks,
    },
  }
}
