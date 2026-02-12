import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkDeliberationAccess } from '@/lib/privacy'
import { checkAndTransitionDeliberation } from '@/lib/timer-processor'
import { atomicJoinCell } from '@/lib/voting'

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

    const limited = await checkRateLimit('enter', session.user.email)
    if (limited) {
      return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
    }

    const { id: deliberationId } = await params

    // Privacy gate
    const access = await checkDeliberationAccess(deliberationId, session.user.email)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Self-heal: process any stalled timers before checking state
    await checkAndTransitionDeliberation(deliberationId)

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

    const isFCFS = deliberation.allocationMode === 'fcfs'
    const FCFS_CELL_SIZE = deliberation.cellSize || 5

    // For continuous flow, check ALL tiers for active/voted cells (voting stack)
    // For regular mode, only check current tier
    const tierFilter = deliberation.continuousFlow
      ? {} // all tiers
      : { tier: deliberation.currentTier }

    // Check if user is already in cells
    const existingParticipations = await prisma.cellParticipation.findMany({
      where: {
        userId: user.id,
        cell: {
          deliberationId,
          ...tierFilter,
        },
      },
      include: {
        cell: {
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
        },
      },
    })

    // ── Stale seat cleanup: release ACTIVE participations older than 10min ──
    if (deliberation.continuousFlow) {
      await prisma.cellParticipation.deleteMany({
        where: {
          status: 'ACTIVE',
          joinedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
          cell: { deliberationId, status: 'VOTING' },
        },
      })
    }

    // Check if user has active (not completed) cells
    const activeParticipations = existingParticipations.filter(p => p.cell.status === 'VOTING' || p.cell.status === 'DELIBERATING')

    // ── Continuous flow multi-cell: return ALL active cells + join missing tiers ──
    if (deliberation.continuousFlow && isFCFS) {
      const votedTiers = new Set(
        existingParticipations
          .filter(p => p.status === 'VOTED' || p.cell.status === 'COMPLETED')
          .map(p => p.cell.tier)
      )
      const activeTiers = new Set(activeParticipations.map(p => p.cell.tier))
      const excludeTiers = new Set([...votedTiers, ...activeTiers])

      // Find open cells at tiers user hasn't voted in or isn't active in
      const openCells = await prisma.cell.findMany({
        where: {
          deliberationId,
          status: 'VOTING',
          ...(excludeTiers.size > 0 ? { tier: { notIn: [...excludeTiers] } } : {}),
        },
        include: {
          _count: { select: { participants: true } },
          ideas: {
            include: {
              idea: {
                select: { id: true, text: true, author: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }],
      })

      // Group by tier — pick one cell per tier (first with room)
      const cellsByTier = new Map<number, typeof openCells[0]>()
      for (const c of openCells) {
        if (!cellsByTier.has(c.tier) && c._count.participants < FCFS_CELL_SIZE) {
          cellsByTier.set(c.tier, c)
        }
      }

      console.log('[enter] CF multi-cell:', {
        excludeTiers: [...excludeTiers],
        openCells: openCells.map(c => ({ id: c.id, tier: c.tier, participants: c._count.participants })),
        cellsByTier: [...cellsByTier.entries()].map(([t, c]) => ({ tier: t, id: c.id })),
      })

      // Join all new cells
      const newCells: typeof openCells = []
      for (const [, cell] of cellsByTier) {
        const joined = await atomicJoinCell(cell.id, user.id, FCFS_CELL_SIZE)
        console.log('[enter] atomicJoinCell:', { cellId: cell.id, tier: cell.tier, joined })
        if (joined) newCells.push(cell)
      }

      // Ensure membership
      if (newCells.length > 0 || activeParticipations.length === 0) {
        await prisma.deliberationMember.upsert({
          where: { deliberationId_userId: { userId: user.id, deliberationId } },
          create: { userId: user.id, deliberationId },
          update: {},
        })
      }

      // Build response: all cells user is now in (active + newly joined)
      const allCells = [
        ...activeParticipations.map(p => ({
          id: p.cell.id,
          tier: p.cell.tier,
          ideas: p.cell.ideas.map(ci => ({
            id: ci.idea.id,
            text: ci.idea.text,
            author: ci.idea.author?.name || 'Anonymous',
          })),
          voterCount: p.cell._count.participants,
          votersNeeded: FCFS_CELL_SIZE,
        })),
        ...newCells.map(c => ({
          id: c.id,
          tier: c.tier,
          ideas: c.ideas.map(ci => ({
            id: ci.idea.id,
            text: ci.idea.text,
            author: ci.idea.author?.name || 'Anonymous',
          })),
          voterCount: c._count.participants + 1,
          votersNeeded: FCFS_CELL_SIZE,
        })),
      ].sort((a, b) => a.tier - b.tier)

      if (allCells.length === 0) {
        return NextResponse.json({
          error: 'All cells are full. Waiting for results before next round opens.',
          roundFull: true,
        }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        isFCFS: true,
        multiCell: true,
        cells: allCells,
        // Also return first cell as `cell` for backwards compat
        cell: allCells[0],
        ...(activeParticipations.length > 0 ? { alreadyInCell: true } : {}),
      })
    }

    // ── Single-cell modes (regular FCFS or balanced) ──
    const activeParticipation = activeParticipations[0]
    if (activeParticipation) {
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
          ...(isFCFS ? {
            voterCount: activeParticipation.cell._count.participants,
            votersNeeded: FCFS_CELL_SIZE,
          } : {}),
        },
      })
    }

    if (isFCFS) {
      // ── Regular FCFS mode: assign user to oldest open cell with room ──
      const votedTiers = new Set(
        existingParticipations
          .filter(p => p.status === 'VOTED' || p.cell.status === 'COMPLETED')
          .map(p => p.cell.tier)
      )

      if (votedTiers.has(deliberation.currentTier)) {
        return NextResponse.json({
          error: 'You have already voted in this tier. Wait for the next tier.'
        }, { status: 400 })
      }

      const openCells = await prisma.cell.findMany({
        where: {
          deliberationId,
          tier: deliberation.currentTier,
          status: 'VOTING',
        },
        include: {
          _count: { select: { participants: true } },
          ideas: {
            include: {
              idea: {
                select: { id: true, text: true, author: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      })

      const cellToJoin = openCells.find(c => c._count.participants < FCFS_CELL_SIZE)

      if (!cellToJoin) {
        return NextResponse.json({
          error: 'All cells are full. Waiting for results before next round opens.',
          roundFull: true,
        }, { status: 400 })
      }

      const joined = await atomicJoinCell(cellToJoin.id, user.id, FCFS_CELL_SIZE)
      if (!joined) {
        return NextResponse.json({
          error: 'All cells are full. Waiting for results before next round opens.',
          roundFull: true,
        }, { status: 400 })
      }

      await prisma.deliberationMember.upsert({
        where: { deliberationId_userId: { userId: user.id, deliberationId } },
        create: { userId: user.id, deliberationId },
        update: {},
      })

      return NextResponse.json({
        success: true,
        isFCFS: true,
        cell: {
          id: cellToJoin.id,
          tier: cellToJoin.tier,
          ideas: cellToJoin.ideas.map(ci => ({
            id: ci.idea.id,
            text: ci.idea.text,
            author: ci.idea.author?.name || 'Anonymous',
          })),
          voterCount: cellToJoin._count.participants + 1,
          votersNeeded: FCFS_CELL_SIZE,
        },
      })
    }

    // ── Balanced mode (original logic) ──

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
    // Allow joining DELIBERATING or VOTING cells (latecomers can join discussion)
    const MAX_CELL_SIZE = 7
    const cellsWithSpots = await prisma.cell.findMany({
      where: {
        deliberationId,
        tier: deliberation.currentTier,
        status: { in: ['VOTING', 'DELIBERATING'] },
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

    // Filter to cells under capacity (max 7), prefer smaller cells
    const availableCells = cellsWithSpots
      .filter(c => c._count.participants < MAX_CELL_SIZE)
      .sort((a, b) => a._count.participants - b._count.participants)

    const cellToJoin = availableCells[0]

    if (!cellToJoin) {
      // Check if there are cells but they all have the same ideas
      if (userVotedIdeaIds.length > 0) {
        return NextResponse.json({
          error: 'No cells with different ideas available. All remaining cells have the same ideas you already voted on.'
        }, { status: 400 })
      }
      // All cells at capacity or none available
      return NextResponse.json({
        error: 'This round is full. You\'ll be included in the next round.',
        roundFull: true,
      }, { status: 400 })
    }

    // Atomically join cell (prevents race where two users both see room)
    const MAX_CELL = 7
    const joinedLate = await atomicJoinCell(cellToJoin.id, user.id, MAX_CELL)
    if (!joinedLate) {
      return NextResponse.json({
        error: 'This round is full. You\'ll be included in the next round.',
        roundFull: true,
      }, { status: 400 })
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
