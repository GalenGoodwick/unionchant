import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/deliberations/[id]/analytics - Creator-only analytics
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
      select: { id: true },
    })

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        ideas: {
          orderBy: { totalVotes: 'desc' },
          select: {
            id: true, text: true, status: true, tier: true,
            totalVotes: true, losses: true, isChampion: true, createdAt: true,
          },
        },
        members: {
          select: { joinedAt: true },
        },
        cells: {
          include: {
            participants: {
              select: { status: true, votedAt: true, droppedAt: true },
            },
            _count: { select: { votes: true, comments: true } },
          },
          orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })

    if (!deliberation || !user || deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // --- Funnel ---
    const totalVoters = new Set<string>()
    for (const cell of deliberation.cells) {
      for (const p of cell.participants) {
        if (p.status === 'VOTED' || p.votedAt) totalVoters.add(p.status) // count unique voted participants
      }
    }
    // Count distinct voters via votes table
    const voterCount = await prisma.vote.findMany({
      where: { cell: { deliberationId: id } },
      select: { userId: true },
      distinct: ['userId'],
    })

    const funnel = {
      views: deliberation.views,
      joined: deliberation.members.length,
      submitted: deliberation.ideas.length,
      voted: voterCount.length,
    }

    // --- Participation stats ---
    const allParticipants = deliberation.cells.flatMap(c => c.participants)
    const droppedCount = allParticipants.filter(p => p.status === 'DROPPED').length
    const totalParticipants = allParticipants.length

    const completedCells = deliberation.cells.filter(c => c.status === 'COMPLETED')
    const timedOutCells = deliberation.cells.filter(c => c.completedByTimeout)

    const totalComments = deliberation.cells.reduce((sum, c) => sum + c._count.comments, 0)
    const cellCount = deliberation.cells.length

    // Vote response times (votedAt - cell.votingStartedAt)
    const voteTimes: number[] = []
    for (const cell of deliberation.cells) {
      if (!cell.votingStartedAt) continue
      const start = new Date(cell.votingStartedAt).getTime()
      for (const p of cell.participants) {
        if (p.votedAt) {
          const diff = new Date(p.votedAt).getTime() - start
          if (diff > 0) voteTimes.push(diff)
        }
      }
    }
    voteTimes.sort((a, b) => a - b)
    const medianVoteTime = voteTimes.length > 0
      ? voteTimes[Math.floor(voteTimes.length / 2)]
      : null

    const participation = {
      medianVoteTimeMs: medianVoteTime,
      dropoutRate: totalParticipants > 0 ? droppedCount / totalParticipants : 0,
      timeoutRate: completedCells.length > 0 ? timedOutCells.length / completedCells.length : 0,
      avgCommentsPerCell: cellCount > 0 ? totalComments / cellCount : 0,
    }

    // --- Tier progression ---
    const tierMap = new Map<number, typeof deliberation.cells>()
    for (const cell of deliberation.cells) {
      if (!tierMap.has(cell.tier)) tierMap.set(cell.tier, [])
      tierMap.get(cell.tier)!.push(cell)
    }

    const tiers = Array.from(tierMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([tier, cells]) => {
        const ideaIds = new Set<string>()
        // Would need cellIdeas relation for precise count; use vote count as proxy
        const totalVotes = cells.reduce((sum, c) => sum + c._count.votes, 0)
        const timeouts = cells.filter(c => c.completedByTimeout).length

        // Duration: first cell created to last cell completed
        const starts = cells.map(c => new Date(c.createdAt).getTime())
        const ends = cells
          .filter(c => c.completedAt)
          .map(c => new Date(c.completedAt!).getTime())

        const durationMs = ends.length > 0 && starts.length > 0
          ? Math.max(...ends) - Math.min(...starts)
          : null

        return {
          tier,
          cells: cells.length,
          totalVotes,
          avgVotesPerCell: cells.length > 0 ? Math.round(totalVotes / cells.length * 10) / 10 : 0,
          durationMs,
          timeouts,
          completedNaturally: cells.filter(c => c.status === 'COMPLETED' && !c.completedByTimeout).length,
        }
      })

    // --- Ideas (top 20) ---
    const ideas = deliberation.ideas.slice(0, 20).map(i => ({
      id: i.id,
      text: i.text,
      status: i.status,
      tier: i.tier,
      totalVotes: i.totalVotes,
      losses: i.losses,
      isChampion: i.isChampion,
    }))

    // --- Timeline ---
    const timeline: { event: string; timestamp: string; detail?: string }[] = []

    timeline.push({ event: 'Created', timestamp: deliberation.createdAt.toISOString() })

    if (deliberation.members.length > 0) {
      const firstJoin = deliberation.members
        .map(m => new Date(m.joinedAt))
        .sort((a, b) => a.getTime() - b.getTime())[0]
      timeline.push({
        event: 'First member joined',
        timestamp: firstJoin.toISOString(),
      })
    }

    if (deliberation.ideas.length > 0) {
      const firstIdea = deliberation.ideas
        .map(i => new Date(i.createdAt))
        .sort((a, b) => a.getTime() - b.getTime())[0]
      timeline.push({
        event: 'First idea submitted',
        timestamp: firstIdea.toISOString(),
      })
    }

    // Tier starts
    const tierStarts = new Map<number, Date>()
    for (const cell of deliberation.cells) {
      const existing = tierStarts.get(cell.tier)
      const cellDate = new Date(cell.createdAt)
      if (!existing || cellDate < existing) {
        tierStarts.set(cell.tier, cellDate)
      }
    }
    for (const [tier, date] of Array.from(tierStarts.entries()).sort(([a], [b]) => a - b)) {
      timeline.push({
        event: `Tier ${tier} started`,
        timestamp: date.toISOString(),
        detail: `${tierMap.get(tier)?.length || 0} cells`,
      })
    }

    if (deliberation.completedAt) {
      timeline.push({
        event: 'Completed',
        timestamp: deliberation.completedAt.toISOString(),
        detail: deliberation.ideas.find(i => i.isChampion)?.text,
      })
    }

    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    return NextResponse.json({
      question: deliberation.question,
      phase: deliberation.phase,
      currentTier: deliberation.currentTier,
      funnel,
      participation,
      tiers,
      ideas,
      timeline,
    })
  } catch (error) {
    console.error('Error computing analytics:', error)
    return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 })
  }
}
