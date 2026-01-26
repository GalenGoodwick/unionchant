import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/deliberations/[id]/cells - Get user's cells in this deliberation
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get cells where user is a participant
    const cells = await prisma.cell.findMany({
      where: {
        deliberationId: id,
        participants: {
          some: { userId: user.id },
        },
      },
      include: {
        ideas: {
          include: {
            idea: {
              include: {
                author: { select: { name: true } },
              },
            },
          },
        },
        participants: {
          include: {
            user: { select: { id: true, name: true, image: true } },
          },
        },
        votes: true, // Include ALL votes to count them
      },
      orderBy: { tier: 'asc' },
    })

    // Transform to include vote counts per idea and user's vote
    const cellsWithVoteCounts = cells.map(cell => {
      // Count votes per idea
      const voteCounts: Record<string, number> = {}
      cell.votes.forEach(vote => {
        voteCounts[vote.ideaId] = (voteCounts[vote.ideaId] || 0) + 1
      })

      // Get user's vote
      const userVote = cell.votes.find(v => v.userId === user.id)

      return {
        ...cell,
        ideas: cell.ideas.map(ci => ({
          ...ci,
          idea: {
            ...ci.idea,
            totalVotes: voteCounts[ci.ideaId] || 0,
          },
        })),
        userVote: userVote || null,
        votes: userVote ? [userVote] : [], // Keep user's vote for hasVoted check
      }
    })

    return NextResponse.json(cellsWithVoteCounts)
  } catch (error) {
    console.error('Error fetching cells:', error)
    return NextResponse.json({ error: 'Failed to fetch cells' }, { status: 500 })
  }
}
