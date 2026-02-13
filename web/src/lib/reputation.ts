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
 *   foresightScore = votingAccuracy * 0.35 + participation * 0.25 + ideaViability * 0.25 + commentStrength * 0.15
 *
 * Pillars:
 *   Voting Accuracy (35%)  — XP allocated to cell winners (the core repeatable skill)
 *   Participation (25%)    — Showing up: deliberations joined, votes cast, consistency
 *   Idea Viability (25%)   — How far ideas advance through tiers
 *   Comment Strength (15%) — Comments that spread across cells via up-pollination
 */

import { prisma } from '@/lib/prisma'

// ── Lightweight reputation for leaderboards (optimized: 4 queries per user) ──

export interface ReputationLite {
  totalUpvotes: number
  participation: number
  ideaViability: number
  votingAccuracy: number
  commentStrength: number
  foresightApprox: number
}

export async function computeReputationLite(userId: string): Promise<ReputationLite> {
  // Check for score reset — only count activity after reset date
  const userMeta = await prisma.user.findUnique({
    where: { id: userId },
    select: { scoreResetAt: true },
  })
  const since = userMeta?.scoreResetAt || undefined
  const sinceFilter = since ? { createdAt: { gte: since } } : {}

  // 1. Participation — deliberations joined + votes cast, capped at 1.0
  const sinceJoinedFilter = since ? { joinedAt: { gte: since } } : {}
  const [memberCount, voteCountRaw] = await Promise.all([
    prisma.deliberationMember.count({ where: { userId, ...sinceJoinedFilter } }),
    since
      ? prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(DISTINCT "cellId") as count FROM "Vote" WHERE "userId" = ${userId} AND "createdAt" >= ${since}
        `
      : prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(DISTINCT "cellId") as count FROM "Vote" WHERE "userId" = ${userId}
        `,
  ])
  const cellsVoted = Number(voteCountRaw[0]?.count || 0)
  // 10 deliberations + 10 cells voted = full participation score
  const participation = Math.min((memberCount / 10 + cellsVoted / 10) / 2, 1)

  // 2. Idea viability
  const ideas = await prisma.idea.findMany({
    where: { authorId: userId, ...sinceFilter },
    select: { status: true, tier: true, isChampion: true },
  })
  let ideaPoints = 0, maxPoints = 0
  for (const idea of ideas) {
    if (idea.status === 'WINNER' || idea.isChampion) ideaPoints += 25
    else if (idea.tier >= 3) ideaPoints += 9
    else if (idea.tier >= 2) ideaPoints += 3
    else if (idea.status === 'ADVANCING' || idea.status === 'DEFENDING') ideaPoints += 1
    maxPoints += 25
  }
  const ideaViability = maxPoints > 0 ? Math.min(ideaPoints / maxPoints, 1) : 0

  // 3. Voting accuracy — 2 batched queries instead of N+1
  const userCells = await prisma.cell.findMany({
    where: { status: 'COMPLETED', participants: { some: { userId } }, ...sinceFilter },
    select: { id: true },
    take: 20,
    orderBy: { createdAt: 'desc' },
  })
  let votingAccuracy = 0
  if (userCells.length > 0) {
    const cellIds = userCells.map(c => c.id)
    const myVotes = await prisma.$queryRaw<{ cellId: string; ideaId: string; xpPoints: number }[]>`
      SELECT "cellId", "ideaId", "xpPoints" FROM "Vote"
      WHERE "userId" = ${userId} AND "cellId" = ANY(${cellIds}::text[])
    `
    const cellWinners = await prisma.$queryRaw<{ cellId: string; ideaId: string; total: bigint }[]>`
      SELECT DISTINCT ON ("cellId") "cellId", "ideaId", SUM("xpPoints") as total
      FROM "Vote" WHERE "cellId" = ANY(${cellIds}::text[])
      GROUP BY "cellId", "ideaId"
      ORDER BY "cellId", total DESC
    `
    const winnerMap = new Map(cellWinners.map(w => [w.cellId, w.ideaId]))
    const votesByCell = new Map<string, typeof myVotes>()
    for (const v of myVotes) {
      if (!votesByCell.has(v.cellId)) votesByCell.set(v.cellId, [])
      votesByCell.get(v.cellId)!.push(v)
    }
    let accSum = 0, accCount = 0
    for (const cellId of cellIds) {
      const votes = votesByCell.get(cellId)
      const winnerId = winnerMap.get(cellId)
      if (!votes?.length || !winnerId) continue
      const totalXP = votes.reduce((s, v) => s + v.xpPoints, 0)
      const winnerXP = votes.find(v => v.ideaId === winnerId)?.xpPoints || 0
      if (totalXP > 0) { accSum += winnerXP / totalXP; accCount++ }
    }
    votingAccuracy = accCount > 0 ? accSum / accCount : 0
  }

  // 4. Comment strength
  const comments = await prisma.comment.findMany({
    where: { userId, ideaId: { not: null }, ...sinceFilter },
    select: { spreadCount: true, upvoteCount: true },
  })
  const spreadComments = comments.filter(c => c.spreadCount >= 1).length
  const commentStrength = comments.length > 0 ? spreadComments / comments.length : 0
  const totalUpvotes = comments.reduce((s, c) => s + c.upvoteCount, 0)

  const foresightApprox = Math.round((
    votingAccuracy * 0.35 + participation * 0.25 + ideaViability * 0.25 + commentStrength * 0.15
  ) * 100) / 100

  return {
    totalUpvotes,
    participation: Math.round(participation * 100) / 100,
    ideaViability: Math.round(ideaViability * 100) / 100,
    votingAccuracy: Math.round(votingAccuracy * 100) / 100,
    commentStrength: Math.round(commentStrength * 100) / 100,
    foresightApprox,
  }
}

// ── Full reputation profile (for detail pages / API) ──

export interface ReputationResult {
  agentId: string
  name: string | null
  isAI: boolean
  memberSince: string

  foresightScore: number
  pillars: {
    votingAccuracy: number
    participation: number
    ideaViability: number
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
      scoreResetAt: true,
    },
  })

  if (!user) return null

  const since = user.scoreResetAt || undefined
  const sinceFilter = since ? { createdAt: { gte: since } } : {}
  const sinceJoinedFilter = since ? { joinedAt: { gte: since } } : {}

  // ── Participation ──
  const deliberationsParticipated = await prisma.deliberationMember.count({
    where: { userId, ...sinceJoinedFilter },
  })

  // ── Ideas ──
  const ideas = await prisma.idea.findMany({
    where: { authorId: userId, ...sinceFilter },
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

  // ── Idea Viability (25%) — exponential tier weighting ──
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
      ...sinceFilter,
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

  // ── Participation (25%) — effort: showing up and voting ──
  const participation = Math.min((deliberationsParticipated / 10 + voteCount / 10) / 2, 1)

  // ── Comment Strength (15%) — comments that spread across cells ──
  const comments = await prisma.comment.findMany({
    where: { userId, isRemoved: false, ...sinceFilter },
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
    votingAccuracy * 0.35 +
    participation * 0.25 +
    ideaViability * 0.25 +
    commentStrength * 0.15
  ) * 100) / 100

  return {
    agentId: user.id,
    name: user.name,
    isAI: user.isAI,
    memberSince: user.createdAt.toISOString(),
    foresightScore,
    pillars: {
      votingAccuracy: Math.round(votingAccuracy * 100) / 100,
      participation: Math.round(participation * 100) / 100,
      ideaViability: Math.round(ideaViability * 100) / 100,
      commentStrength: Math.round(commentStrength * 100) / 100,
    },
    formula: 'voting_accuracy * 0.35 + participation * 0.25 + idea_viability * 0.25 + comment_strength * 0.15',
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
