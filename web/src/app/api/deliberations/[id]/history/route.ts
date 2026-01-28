import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/deliberations/[id]/history - Get voting history for a deliberation
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if deliberation is public (public audit log)
    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: { isPublic: true },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // For private deliberations, require authentication
    if (!deliberation.isPublic) {
      const session = await getServerSession(authOptions)
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // Get all completed cells grouped by challenge round and tier
    const cells = await prisma.cell.findMany({
      where: {
        deliberationId: id,
        status: 'COMPLETED',
      },
      include: {
        ideas: {
          include: {
            idea: {
              select: {
                id: true,
                text: true,
                status: true,
                author: { select: { name: true } },
              },
            },
          },
        },
        votes: true,
      },
      orderBy: [
        { tier: 'asc' },
        { completedAt: 'asc' },
      ],
    })

    // Get deliberation info for challenge round context
    const deliberationInfo = await prisma.deliberation.findUnique({
      where: { id },
      select: {
        challengeRound: true,
        championId: true,
        ideas: {
          where: {
            OR: [
              { status: 'WINNER' },
              { isChampion: true },
            ],
          },
          select: {
            id: true,
            text: true,
            author: { select: { name: true } },
          },
        },
      },
    })

    // Process cells to get vote counts and winners per cell
    const processedCells = cells.map(cell => {
      const voteCounts: Record<string, number> = {}
      cell.votes.forEach(vote => {
        voteCounts[vote.ideaId] = (voteCounts[vote.ideaId] || 0) + 1
      })

      const maxVotes = Math.max(...Object.values(voteCounts), 0)
      const winnerIds = Object.entries(voteCounts)
        .filter(([, count]) => count === maxVotes)
        .map(([id]) => id)

      return {
        id: cell.id,
        tier: cell.tier,
        completedAt: cell.completedAt,
        ideas: cell.ideas.map(ci => ({
          id: ci.idea.id,
          text: ci.idea.text,
          author: ci.idea.author.name || 'Anonymous',
          votes: voteCounts[ci.ideaId] || 0,
          isWinner: winnerIds.includes(ci.ideaId),
          status: ci.idea.status,
        })),
        totalVotes: cell.votes.length,
      }
    })

    // Group by tier
    const tiers: Record<number, typeof processedCells> = {}
    processedCells.forEach(cell => {
      if (!tiers[cell.tier]) {
        tiers[cell.tier] = []
      }
      tiers[cell.tier].push(cell)
    })

    return NextResponse.json({
      challengeRound: deliberationInfo?.challengeRound || 0,
      currentChampion: deliberationInfo?.ideas[0] || null,
      tiers,
      totalCells: cells.length,
    })
  } catch (error) {
    console.error('Error fetching history:', error)
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}
