import { NextRequest, NextResponse } from 'next/server'
import { resolveSimulatorUser } from '@/lib/simulator-auth'
import { prisma } from '@/lib/prisma'
import { cached } from '@/lib/cache'

const FCFS_CELL_SIZE = 5

// GET /api/deliberations/[id]/status — Unified chant status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await resolveSimulatorUser(req)
    const userId = auth.authenticated ? auth.user.id : null

    const body = await cached(`status:${id}:${userId || 'anon'}`, 3_000, async () => {
      // Single parallel fan-out: main query + votedTiers
      const [deliberation, votedParticipations] = await Promise.all([
        prisma.deliberation.findUnique({
          where: { id },
          include: {
            creator: { select: { id: true, name: true } },
            ideas: {
              orderBy: { totalXP: 'desc' },
              select: {
                id: true, text: true, status: true, tier: true,
                totalXP: true, totalVotes: true, isChampion: true,
                author: { select: { id: true, name: true } },
              },
            },
            cells: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true, tier: true, status: true, createdAt: true,
                _count: { select: { participants: true, votes: true } },
                ideas: {
                  select: {
                    idea: {
                      select: {
                        id: true, text: true, totalXP: true, status: true,
                        author: { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
            },
            members: userId ? {
              where: { userId },
              select: { id: true },
              take: 1,
            } : undefined,
            _count: { select: { members: true, ideas: true } },
          },
        }),
        userId
          ? prisma.cellParticipation.findMany({
              where: { userId, status: 'VOTED', cell: { deliberationId: id } },
              select: { cell: { select: { tier: true } } },
            })
          : Promise.resolve([]),
      ])

      if (!deliberation) return null

      // FCFS progress
      let fcfsProgress: Record<string, unknown> | null = null
      if (deliberation.allocationMode === 'fcfs' && deliberation.phase === 'VOTING') {
        const tierCells = deliberation.cells.filter(c => c.tier === deliberation.currentTier)
        const completedCells = tierCells.filter(c => c.status === 'COMPLETED').length
        const currentCell = tierCells.find(c => c.status === 'VOTING')

        fcfsProgress = {
          currentCellIndex: completedCells,
          totalCells: tierCells.length,
          currentCellVoters: currentCell?._count.participants || 0,
          votersNeeded: FCFS_CELL_SIZE,
          completedCells,
          currentCellIdeas: currentCell?.ideas.map(ci => ({
            id: ci.idea.id,
            text: ci.idea.text,
            author: { id: ci.idea.author.id, name: ci.idea.author.name || 'Anonymous' },
          })),
        }
      }

      const votedTiers = [...new Set(votedParticipations.map(v => v.cell.tier))].sort((a, b) => a - b)

      return {
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
        champion: deliberation.championId
          ? deliberation.ideas.find(i => i.id === deliberation.championId)
          : null,
        ideas: deliberation.ideas,
        cells: deliberation.cells.map(c => ({
          ...c,
          ideas: c.ideas.map(ci => ci.idea),
        })),
        fcfsProgress,
        hasVoted: votedTiers.includes(deliberation.currentTier),
        votedTiers,
        isMember: !!(deliberation.members && deliberation.members.length > 0),
        createdAt: deliberation.createdAt,
        inviteCode: deliberation.inviteCode,
        accumulationEnabled: deliberation.accumulationEnabled,
        ideaGoal: deliberation.ideaGoal,
        memberGoal: deliberation.memberGoal,
      }
    })

    if (!body) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    return NextResponse.json(body)
  } catch (error) {
    console.error('Error getting chant status:', error)
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 })
  }
}
