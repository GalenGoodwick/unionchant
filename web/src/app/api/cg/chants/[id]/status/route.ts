import { NextRequest, NextResponse } from 'next/server'
import { verifyCGAuth } from '../../../auth'
import { prisma } from '@/lib/prisma'

const FCFS_CELL_SIZE = 5

// GET /api/cg/chants/[id]/status — Full chant status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyCGAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params

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
    } | null = null
    if (deliberation.allocationMode === 'fcfs' && deliberation.phase === 'VOTING') {
      const tierCells = deliberation.cells.filter(c => c.tier === deliberation.currentTier)
      const completedCells = tierCells.filter(c => c.status === 'COMPLETED').length
      const votingCells = tierCells.filter(c => c.status === 'VOTING')
      const currentCell = votingCells[0]

      fcfsProgress = {
        currentCellIndex: completedCells,
        totalCells: tierCells.length,
        currentCellVoters: currentCell?._count.participants || 0,
        votersNeeded: FCFS_CELL_SIZE,
        completedCells,
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
      currentTier: deliberation.currentTier,
      memberCount: deliberation._count.members,
      ideaCount: deliberation._count.ideas,
      creator: deliberation.creator,
      champion,
      ideas: deliberation.ideas,
      cells: deliberation.cells,
      fcfsProgress,
      createdAt: deliberation.createdAt,
    })
  } catch (error) {
    console.error('Error getting CG chant status:', error)
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 })
  }
}
