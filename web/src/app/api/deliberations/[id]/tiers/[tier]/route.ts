import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/deliberations/[id]/tiers/[tier] - Get batch/tier information for spectators
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tier: string }> }
) {
  try {
    const { id: deliberationId, tier: tierStr } = await params
    const tier = parseInt(tierStr, 10)

    if (isNaN(tier) || tier < 1) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }

    // Get deliberation for tier deadline calculation
    const deliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
      select: {
        currentTierStartedAt: true,
        votingTimeoutMs: true,
      },
    })

    const votingDeadline = deliberation?.currentTierStartedAt
      ? new Date(deliberation.currentTierStartedAt.getTime() + (deliberation.votingTimeoutMs || 3600000))
      : null

    // Get all cells for this tier
    const cells = await prisma.cell.findMany({
      where: { deliberationId, tier },
      include: {
        ideas: {
          include: {
            idea: {
              select: {
                id: true,
                text: true,
                status: true,
                tier: true,
                losses: true,
                totalVotes: true,
                author: { select: { name: true } },
              },
            },
          },
        },
        participants: {
          select: { userId: true, status: true },
        },
        votes: {
          select: { userId: true, ideaId: true },
        },
        _count: {
          select: { votes: true, participants: true },
        },
      },
    })

    if (cells.length === 0) {
      return NextResponse.json({ error: 'No cells found for this tier' }, { status: 404 })
    }

    // Check if this is a batch (all cells have same ideas) or Tier 1 (unique ideas per cell)
    const firstCellIdeaIds = cells[0].ideas.map(ci => ci.ideaId).sort()
    const isBatch = cells.every(cell => {
      const cellIdeaIds = cell.ideas.map(ci => ci.ideaId).sort()
      return cellIdeaIds.length === firstCellIdeaIds.length &&
        cellIdeaIds.every((id, i) => id === firstCellIdeaIds[i])
    })

    // Get unique ideas (for batches) or all ideas (for Tier 1)
    const allIdeas = isBatch
      ? cells[0].ideas.map(ci => ci.idea)
      : cells.flatMap(cell => cell.ideas.map(ci => ci.idea))

    // Calculate totals
    const totalCells = cells.length
    const totalParticipants = cells.reduce((sum, c) => sum + c._count.participants, 0)
    const totalVotesCast = cells.reduce((sum, c) => sum + c._count.votes, 0)
    const totalVotesExpected = totalParticipants

    // Cell-level stats
    const cellStats = cells.map(cell => {
      // Use actual votes count rather than participant status (status updates may lag)
      const votedCount = cell._count.votes
      // Get winner for completed cells
      const winner = cell.status === 'COMPLETED' && cell.ideas.length > 0
        ? (() => {
            // Find the idea with most votes in this cell
            const voteCounts: Record<string, number> = {}
            for (const vote of cell.votes) {
              voteCounts[vote.ideaId] = (voteCounts[vote.ideaId] || 0) + 1
            }
            let maxVotes = 0
            let winnerIdea = cell.ideas[0]?.idea
            for (const ci of cell.ideas) {
              const votes = voteCounts[ci.ideaId] || 0
              if (votes > maxVotes) {
                maxVotes = votes
                winnerIdea = ci.idea
              }
            }
            return winnerIdea ? {
              id: winnerIdea.id,
              text: winnerIdea.text,
              author: winnerIdea.author?.name || 'Anonymous',
            } : undefined
          })()
        : undefined

      return {
        id: cell.id,
        status: cell.status,
        participantCount: cell._count.participants,
        votedCount,
        votesRemaining: cell._count.participants - votedCount,
        votingDeadline: votingDeadline?.toISOString() || null,
        ideas: cell.ideas.map(ci => ({
          ...ci.idea,
          voteCount: cell.votes.filter(v => v.ideaId === ci.ideaId).length,
        })),
        winner,
      }
    })

    // For batches, calculate cross-cell vote tally (live results)
    let liveTally: { ideaId: string; text: string; voteCount: number }[] | undefined
    if (isBatch) {
      const tally: Record<string, number> = {}
      for (const cell of cells) {
        for (const vote of cell.votes) {
          tally[vote.ideaId] = (tally[vote.ideaId] || 0) + 1
        }
      }
      liveTally = allIdeas.map(idea => ({
        ideaId: idea.id,
        text: idea.text,
        voteCount: tally[idea.id] || 0,
      })).sort((a, b) => b.voteCount - a.voteCount)
    }

    // Completion status
    const completedCells = cells.filter(c => c.status === 'COMPLETED').length
    const isComplete = completedCells === totalCells

    return NextResponse.json({
      deliberationId,
      tier,
      isBatch,
      isComplete,

      // Overall stats
      stats: {
        totalCells,
        completedCells,
        totalParticipants,
        totalVotesCast,
        totalVotesExpected,
        votingProgress: totalVotesExpected > 0
          ? Math.round((totalVotesCast / totalVotesExpected) * 100)
          : 0,
      },

      // Ideas in this tier/batch
      ideas: allIdeas,

      // Live cross-cell tally (batches only)
      liveTally,

      // Individual cell information
      cells: cellStats,
    })
  } catch (error) {
    console.error('Error fetching tier info:', error)
    return NextResponse.json({ error: 'Failed to fetch tier info' }, { status: 500 })
  }
}
