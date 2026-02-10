import { NextRequest, NextResponse } from 'next/server'
import { verifyCGAuth } from '../../../auth'
import { prisma } from '@/lib/prisma'

const FCFS_CELL_SIZE = 5

// GET /api/cg/chants/[id]/status?cgUserId=... — Full chant status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyCGAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const cgUserId = req.nextUrl.searchParams.get('cgUserId')

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, cgId: true } },
        ideas: {
          orderBy: { totalXP: 'desc' },
          select: {
            id: true,
            text: true,
            status: true,
            tier: true,
            totalXP: true,
            totalVotes: true,
            isChampion: true,
            author: { select: { id: true, name: true, cgId: true } },
          },
        },
        cells: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            tier: true,
            status: true,
            createdAt: true,
            _count: { select: { participants: true, votes: true } },
          },
        },
        _count: { select: { members: true, ideas: true } },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    // FCFS progress for current tier
    let fcfsProgress: {
      currentCellIndex: number
      totalCells: number
      currentCellVoters: number
      votersNeeded: number
      completedCells: number
      currentCellIdeas?: { id: string; text: string; author: { id: string; name: string } }[]
    } | null = null
    if (deliberation.allocationMode === 'fcfs' && deliberation.phase === 'VOTING') {
      const tierCells = deliberation.cells.filter(c => c.tier === deliberation.currentTier)
      const completedCells = tierCells.filter(c => c.status === 'COMPLETED').length
      const votingCells = tierCells.filter(c => c.status === 'VOTING')
      const currentCell = votingCells[0]

      // Get ideas for the next available cell (what the voter will see)
      let currentCellIdeas: { id: string; text: string; author: { id: string; name: string } }[] | undefined
      if (currentCell) {
        const cellWithIdeas = await prisma.cell.findUnique({
          where: { id: currentCell.id },
          include: {
            ideas: {
              include: {
                idea: {
                  select: { id: true, text: true, author: { select: { id: true, name: true } } },
                },
              },
            },
          },
        })
        if (cellWithIdeas) {
          currentCellIdeas = cellWithIdeas.ideas.map(ci => ({
            id: ci.idea.id,
            text: ci.idea.text,
            author: { id: ci.idea.author.id, name: ci.idea.author.name || 'Anonymous' },
          }))
        }
      }

      fcfsProgress = {
        currentCellIndex: completedCells,
        totalCells: tierCells.length,
        currentCellVoters: currentCell?._count.participants || 0,
        votersNeeded: FCFS_CELL_SIZE,
        completedCells,
        currentCellIdeas,
      }
    }

    // Check which tiers the user has voted in
    let hasVoted = false
    let votedTiers: number[] = []
    if (cgUserId) {
      const cgUser = await prisma.user.findFirst({ where: { cgId: cgUserId } })
      if (cgUser) {
        const votes = await prisma.cellParticipation.findMany({
          where: {
            userId: cgUser.id,
            status: 'VOTED',
            cell: { deliberationId: id },
          },
          select: { cell: { select: { tier: true } } },
        })
        votedTiers = [...new Set(votes.map(v => v.cell.tier))].sort((a, b) => a - b)
        hasVoted = votedTiers.includes(deliberation.currentTier)
      }
    }

    // Champion info
    const champion = deliberation.championId
      ? deliberation.ideas.find(i => i.id === deliberation.championId)
      : null

    return NextResponse.json({
      id: deliberation.id,
      question: deliberation.question,
      description: deliberation.description,
      phase: deliberation.phase,
      allocationMode: deliberation.allocationMode,
      continuousFlow: deliberation.continuousFlow,
      multipleIdeasAllowed: deliberation.multipleIdeasAllowed,
      submissionsClosed: deliberation.submissionsClosed,
      currentTier: deliberation.currentTier,
      memberCount: deliberation._count.members,
      ideaCount: deliberation._count.ideas,
      creator: deliberation.creator,
      champion,
      ideas: deliberation.ideas,
      cells: deliberation.cells,
      fcfsProgress,
      hasVoted,
      votedTiers,
      createdAt: deliberation.createdAt,
    })
  } catch (error) {
    console.error('Error getting CG chant status:', error)
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 })
  }
}
