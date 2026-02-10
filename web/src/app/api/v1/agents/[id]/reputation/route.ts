import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../../../auth'
import { prisma } from '@/lib/prisma'

// GET /api/v1/agents/:id/reputation — Get agent's foresight score and deliberation stats
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, isAI: true, createdAt: true,
        totalPredictions: true, correctPredictions: true,
        championPicks: true, currentStreak: true, bestStreak: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Count deliberations participated in
    const deliberationsParticipated = await prisma.deliberationMember.count({
      where: { userId: id },
    })

    // Count ideas submitted + their outcomes
    const ideas = await prisma.idea.findMany({
      where: { authorId: id },
      select: { id: true, status: true, tier: true },
    })

    const ideasSubmitted = ideas.length
    const ideasAdvanced = ideas.filter(i => i.status === 'ADVANCING' || i.status === 'WINNER' || i.status === 'DEFENDING').length
    const ideasWon = ideas.filter(i => i.status === 'WINNER').length
    const highestTier = ideas.reduce((max, i) => Math.max(max, i.tier), 0)

    // Count votes cast
    const totalVotesCast = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT "cellId" || '-' || "userId") as count FROM "Vote" WHERE "userId" = ${id}
    `
    const voteCount = Number(totalVotesCast[0]?.count || 0)

    // Calculate voting accuracy: did the agent give more XP to ideas that won?
    // Look at completed cells where this agent voted
    const agentCells = await prisma.cell.findMany({
      where: {
        status: 'COMPLETED',
        participants: { some: { userId: id } },
      },
      select: { id: true },
    })

    let accuracySum = 0
    let accuracyCount = 0

    if (agentCells.length > 0) {
      const cellIds = agentCells.map(c => c.id)

      for (const cellId of cellIds.slice(0, 50)) { // Cap at 50 for performance
        // Get this agent's votes in this cell
        const myVotes = await prisma.$queryRaw<{ ideaId: string; xpPoints: number }[]>`
          SELECT "ideaId", "xpPoints" FROM "Vote" WHERE "cellId" = ${cellId} AND "userId" = ${id}
        `
        if (myVotes.length === 0) continue

        // Get the winning idea (highest total XP in this cell)
        const cellTotals = await prisma.$queryRaw<{ ideaId: string; total: bigint }[]>`
          SELECT "ideaId", SUM("xpPoints") as total FROM "Vote" WHERE "cellId" = ${cellId}
          GROUP BY "ideaId" ORDER BY total DESC LIMIT 1
        `
        if (cellTotals.length === 0) continue

        const winnerId = cellTotals[0].ideaId
        const totalXP = myVotes.reduce((s, v) => s + v.xpPoints, 0)
        const winnerXP = myVotes.find(v => v.ideaId === winnerId)?.xpPoints || 0

        // Accuracy = fraction of XP given to the winning idea
        accuracySum += winnerXP / totalXP
        accuracyCount++
      }
    }

    const votingAccuracy = accuracyCount > 0 ? accuracySum / accuracyCount : 0
    const advancementRate = ideasSubmitted > 0 ? ideasAdvanced / ideasSubmitted : 0
    const winRate = ideasSubmitted > 0 ? ideasWon / ideasSubmitted : 0

    // Foresight score: weighted combo of advancement rate, voting accuracy, and prediction accuracy
    const predictionAccuracy = user.totalPredictions > 0
      ? user.correctPredictions / user.totalPredictions
      : 0

    const foresightScore = Math.round((
      advancementRate * 0.35 +
      votingAccuracy * 0.35 +
      predictionAccuracy * 0.20 +
      Math.min(deliberationsParticipated / 20, 1) * 0.10 // participation volume bonus (caps at 20)
    ) * 100) / 100

    return NextResponse.json({
      agentId: user.id,
      name: user.name,
      isAI: user.isAI,
      memberSince: user.createdAt.toISOString(),
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
        currentStreak: user.currentStreak,
        bestStreak: user.bestStreak,
        championPicks: user.championPicks,
      },
      foresightScore,
      formula: 'advancement_rate * 0.35 + voting_accuracy * 0.35 + prediction_accuracy * 0.20 + participation_volume * 0.10',
    })
  } catch (err) {
    console.error('v1 reputation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
