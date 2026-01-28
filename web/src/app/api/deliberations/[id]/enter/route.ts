import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/deliberations/[id]/enter - Join a voting cell
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: deliberationId } = await params

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check deliberation exists and is in VOTING phase
    const deliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Deliberation is not in voting phase' }, { status: 400 })
    }

    // Check if user is already in cells for current tier
    const existingParticipations = await prisma.cellParticipation.findMany({
      where: {
        userId: user.id,
        cell: {
          deliberationId,
          tier: deliberation.currentTier,
        },
      },
      include: {
        cell: {
          include: {
            ideas: {
              include: {
                idea: {
                  select: {
                    id: true,
                    text: true,
                    author: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    })

    // Check if user has an active (not completed) cell
    const activeParticipation = existingParticipations.find(p => p.cell.status === 'VOTING')
    if (activeParticipation) {
      // Already in an active cell, return it
      return NextResponse.json({
        alreadyInCell: true,
        cell: {
          id: activeParticipation.cell.id,
          tier: activeParticipation.cell.tier,
          ideas: activeParticipation.cell.ideas.map(ci => ({
            id: ci.idea.id,
            text: ci.idea.text,
            author: ci.idea.author?.name || 'Anonymous',
          })),
        },
      })
    }

    // Check if user can join a 2nd cell (their first cell completed with window open)
    // Window is open if secondVotesEnabled and tier hasn't expired yet
    const tierDeadline = deliberation.currentTierStartedAt
      ? new Date(deliberation.currentTierStartedAt.getTime() + deliberation.votingTimeoutMs)
      : null
    const tierStillActive = !tierDeadline || tierDeadline > new Date()

    const completedParticipation = existingParticipations.find(p =>
      p.cell.status === 'COMPLETED' &&
      p.cell.secondVotesEnabled &&
      tierStillActive
    )

    // If user has completed cells but no 2nd vote window open, they can't join another
    if (existingParticipations.length > 0 && !completedParticipation) {
      return NextResponse.json({
        error: 'You have already voted in this tier. Wait for the next tier or the 2nd cell window to open.'
      }, { status: 400 })
    }

    // Track if this is a 2nd cell entry
    const isSecondCell = !!completedParticipation

    // Get cells user is already in (to exclude them)
    const userCellIds = existingParticipations.map(p => p.cell.id)

    // Get all idea IDs from cells user has already participated in
    // We want to exclude cells with ANY of these ideas (different batch only)
    const userVotedIdeaIds = existingParticipations.flatMap(p =>
      p.cell.ideas.map(ci => ci.idea.id)
    )

    // Filter to find cells with DIFFERENT ideas than what user already voted on
    const cellsWithSpots = await prisma.cell.findMany({
      where: {
        deliberationId,
        tier: deliberation.currentTier,
        status: 'VOTING',
        id: { notIn: userCellIds },
        // Exclude cells that share ANY ideas with cells user already voted in
        ...(userVotedIdeaIds.length > 0 ? {
          NOT: {
            ideas: {
              some: {
                ideaId: { in: userVotedIdeaIds }
              }
            }
          }
        } : {}),
      },
      include: {
        _count: { select: { participants: true } },
        ideas: {
          include: {
            idea: {
              select: {
                id: true,
                text: true,
                author: { select: { name: true } },
              },
            },
          },
        },
      },
    })

    // Prefer cells with fewer participants, but allow joining any voting cell
    // Sort by participant count to fill smaller cells first
    const sortedCells = cellsWithSpots.sort((a, b) =>
      a._count.participants - b._count.participants
    )

    const cellToJoin = sortedCells[0]

    if (!cellToJoin) {
      // Check if there are cells but they all have the same ideas
      if (userVotedIdeaIds.length > 0) {
        return NextResponse.json({
          error: 'No cells with different ideas available. All remaining cells have the same ideas you already voted on.'
        }, { status: 400 })
      }
      return NextResponse.json({ error: 'No voting cells available' }, { status: 400 })
    }

    // Ensure user is a member of the deliberation
    await prisma.deliberationMember.upsert({
      where: {
        deliberationId_userId: {
          userId: user.id,
          deliberationId,
        },
      },
      create: {
        userId: user.id,
        deliberationId,
      },
      update: {},
    })

    // Add user to the cell
    await prisma.cellParticipation.create({
      data: {
        cellId: cellToJoin.id,
        userId: user.id,
        status: 'ACTIVE',
      },
    })

    return NextResponse.json({
      success: true,
      isSecondCell,
      cell: {
        id: cellToJoin.id,
        tier: cellToJoin.tier,
        ideas: cellToJoin.ideas.map(ci => ({
          id: ci.idea.id,
          text: ci.idea.text,
          author: ci.idea.author?.name || 'Anonymous',
        })),
      },
    })
  } catch (error) {
    console.error('Error entering cell:', error)
    return NextResponse.json({ error: 'Failed to enter cell' }, { status: 500 })
  }
}
