import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkAndTransitionDeliberation } from '@/lib/timer-processor'
import { checkDeliberationAccess } from '@/lib/privacy'

// GET /api/deliberations/[id]/cells - Get user's cells in this deliberation
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Lazy evaluation: process any expired cells (non-blocking)
    checkAndTransitionDeliberation(id).catch(err => {
      console.error('Error in lazy transition:', err)
    })

    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Privacy gate
    const access = await checkDeliberationAccess(id, session.user.email)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
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
                author: { select: { id: true, name: true, status: true } },
              },
            },
          },
        },
        participants: {
          include: {
            user: { select: { id: true, name: true, image: true, status: true } },
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

      // Get all of user's votes in this cell (one per idea allocation)
      const userVotes = cell.votes.filter(v => v.userId === user.id)

      return {
        ...cell,
        ideas: cell.ideas.map(ci => ({
          ...ci,
          idea: {
            ...ci.idea,
            totalVotes: voteCounts[ci.ideaId] || 0,
          },
        })),
        userVote: userVotes[0] || null,
        votes: userVotes, // All user votes for XP allocation display
      }
    })

    return NextResponse.json(cellsWithVoteCounts)
  } catch (error) {
    console.error('Error fetching cells:', error)
    return NextResponse.json({ error: 'Failed to fetch cells' }, { status: 500 })
  }
}
