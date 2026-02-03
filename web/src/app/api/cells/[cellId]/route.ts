import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/cells/[cellId] - Get cell details including status and winner
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cellId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { cellId } = await params

    const cell = await prisma.cell.findUnique({
      where: { id: cellId },
      include: {
        deliberation: {
          select: {
            id: true,
            phase: true,
            accumulationEnabled: true,
            currentTierStartedAt: true,
            votingTimeoutMs: true,
          },
        },
        ideas: {
          include: {
            idea: {
              select: {
                id: true,
                text: true,
                status: true,
                isChampion: true,
                author: { select: { name: true } },
              },
            },
          },
        },
        votes: {
          select: { ideaId: true },
        },
        _count: {
          select: { votes: true, participants: true },
        },
      },
    })

    if (!cell) {
      return NextResponse.json({ error: 'Cell not found' }, { status: 404 })
    }

    // Find winner (idea with most votes, or ADVANCING status)
    let winner: { id: string; text: string; author: string } | null = null
    let champion: { id: string; text: string; author: string } | null = null

    if (cell.status === 'COMPLETED') {
      // Count votes per idea
      const voteCounts: Record<string, number> = {}
      for (const vote of cell.votes) {
        voteCounts[vote.ideaId] = (voteCounts[vote.ideaId] || 0) + 1
      }

      // Find idea with most votes
      let maxVotes = 0
      let winnerId: string | null = null
      for (const [ideaId, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) {
          maxVotes = count
          winnerId = ideaId
        }
      }

      if (winnerId) {
        const winnerIdea = cell.ideas.find(ci => ci.ideaId === winnerId)?.idea
        if (winnerIdea) {
          winner = {
            id: winnerIdea.id,
            text: winnerIdea.text,
            author: winnerIdea.author?.name || 'Anonymous',
          }
        }
      }
    }

    // Find the champion if deliberation is in ACCUMULATING or COMPLETED phase
    // Query from deliberation's ideas since champion might not be in this specific cell
    if (cell.deliberation.phase === 'ACCUMULATING' || cell.deliberation.phase === 'COMPLETED') {
      const championIdea = await prisma.idea.findFirst({
        where: {
          deliberationId: cell.deliberation.id,
          isChampion: true,
        },
        include: {
          author: { select: { name: true } },
        },
      })
      if (championIdea) {
        champion = {
          id: championIdea.id,
          text: championIdea.text,
          author: championIdea.author?.name || 'Anonymous',
        }
      }
    }

    // Calculate voting deadline from deliberation tier timer
    const votingDeadline = cell.deliberation.currentTierStartedAt
      ? new Date(cell.deliberation.currentTierStartedAt.getTime() + cell.deliberation.votingTimeoutMs)
      : null

    // Only expose vote counts after voting is complete (prevents influencing active voters)
    const isCompleted = cell.status === 'COMPLETED'

    return NextResponse.json({
      id: cell.id,
      status: cell.status,
      tier: cell.tier,
      votingDeadline: votingDeadline?.toISOString() || null,
      votedCount: isCompleted ? cell._count.votes : undefined,
      participantCount: cell._count.participants,
      secondVotesEnabled: cell.secondVotesEnabled,
      winner: isCompleted ? winner : null,
      champion,
      deliberation: {
        id: cell.deliberation.id,
        phase: cell.deliberation.phase,
        accumulationEnabled: cell.deliberation.accumulationEnabled,
      },
      _count: { participants: cell._count.participants, votes: isCompleted ? cell._count.votes : undefined },
    })
  } catch (error) {
    console.error('Error fetching cell:', error)
    return NextResponse.json({ error: 'Failed to fetch cell' }, { status: 500 })
  }
}
