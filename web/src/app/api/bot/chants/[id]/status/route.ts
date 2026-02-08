import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../../auth'
import { prisma } from '@/lib/prisma'

// GET /api/bot/chants/[id]/status — Full chant status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        creator: { select: { name: true, discordId: true } },
        servers: {
          select: {
            communityId: true,
            isOrigin: true,
            startVoteApproved: true,
            community: { select: { name: true } },
          },
        },
        ideas: {
          select: {
            id: true,
            text: true,
            status: true,
            tier: true,
            totalVotes: true,
            totalXP: true,
            isChampion: true,
            author: { select: { name: true, discordId: true } },
          },
          orderBy: { totalXP: 'desc' },
        },
        _count: {
          select: { members: true, ideas: true, cells: true },
        },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    // Get cell stats
    const cells = await prisma.cell.findMany({
      where: { deliberationId: id },
      select: {
        id: true,
        tier: true,
        status: true,
        _count: { select: { participants: true, votes: true } },
      },
    })

    const champion = deliberation.ideas.find(i => i.isChampion)

    // FCFS progress: which cell is currently filling?
    const isFCFS = deliberation.allocationMode === 'fcfs'
    let fcfsProgress: { currentCellIndex: number; totalCells: number; currentCellVoters: number; votersNeeded: number; completedCells: number; totalVoters: number; currentCellIdeas?: Array<{ id: string; text: string; author: string }> } | null = null
    if (isFCFS && deliberation.phase === 'VOTING') {
      const currentTierCells = cells.filter(c => c.tier === deliberation.currentTier)
      const completedCells = currentTierCells.filter(c => c.status === 'COMPLETED')

      // Match vote API: oldest open cell by createdAt
      const openCells = await prisma.cell.findMany({
        where: {
          deliberationId: id,
          tier: deliberation.currentTier,
          status: 'VOTING',
        },
        include: {
          _count: { select: { participants: true } },
          ideas: {
            include: {
              idea: { select: { id: true, text: true, author: { select: { name: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      })
      const currentCell = openCells.find(c => c._count.participants < 5) || openCells[0]

      // Count unique voters across all cells in current tier
      const voterCounts = await prisma.$queryRaw<{ cnt: bigint }[]>`
        SELECT COUNT(DISTINCT cp."userId") as cnt
        FROM "CellParticipation" cp
        JOIN "Cell" c ON cp."cellId" = c.id
        WHERE c."deliberationId" = ${id} AND c.tier = ${deliberation.currentTier} AND cp.status = 'VOTED'
      `
      const totalVoters = Number(voterCounts[0]?.cnt || 0)

      let currentCellIdeas: Array<{ id: string; text: string; author: string }> | undefined
      if (currentCell) {
        currentCellIdeas = currentCell.ideas.map(ci => ({
          id: ci.idea.id,
          text: ci.idea.text,
          author: ci.idea.author?.name || 'Anonymous',
        }))
      }

      fcfsProgress = {
        currentCellIndex: completedCells.length + 1,
        totalCells: currentTierCells.length,
        currentCellVoters: currentCell?._count.participants || 0,
        votersNeeded: 5,
        completedCells: completedCells.length,
        totalVoters,
        currentCellIdeas,
      }
    }

    return NextResponse.json({
      id: deliberation.id,
      question: deliberation.question,
      description: deliberation.description,
      phase: deliberation.phase,
      allocationMode: deliberation.allocationMode || 'balanced',
      currentTier: deliberation.currentTier,
      creator: deliberation.creator,
      ...(fcfsProgress ? { fcfsProgress } : {}),
      champion: champion ? {
        id: champion.id,
        text: champion.text,
        author: champion.author,
        totalXP: champion.totalXP,
      } : null,
      ideas: deliberation.ideas.map(i => ({
        id: i.id,
        text: i.text,
        status: i.status,
        tier: i.tier,
        totalXP: i.totalXP,
        totalVotes: i.totalVotes,
        author: i.author,
      })),
      cells: cells.map(c => ({
        id: c.id,
        tier: c.tier,
        status: c.status,
        participants: c._count.participants,
        votes: c._count.votes,
      })),
      memberCount: deliberation._count.members,
      ideaCount: deliberation._count.ideas,
      cellCount: deliberation._count.cells,
      createdAt: deliberation.createdAt,
      completedAt: deliberation.completedAt,
      url: `https://unitychant.com/chants/${deliberation.id}`,
      // Multi-server info
      serverCount: deliberation.servers.length,
      servers: deliberation.servers.map(s => ({
        name: s.community.name,
        isOrigin: s.isOrigin,
        startVoteApproved: s.startVoteApproved,
      })),
      startVoteThreshold: deliberation.servers.length > 1
        ? Math.floor(deliberation.servers.length / 2) + 1
        : 1,
      startVoteApproved: deliberation.servers.filter(s => s.startVoteApproved).length,
    })
  } catch (error) {
    console.error('Error fetching chant status:', error)
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
  }
}
