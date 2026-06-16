import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/deliberations/[id]/analytics - Creator-only comprehensive analytics
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
          orderBy: { totalXP: 'desc' },
          select: {
            id: true, text: true, status: true, tier: true,
            totalVotes: true, totalXP: true, losses: true, isChampion: true, createdAt: true,
            author: { select: { name: true } },
          },
        },
        members: {
          select: { joinedAt: true, user: { select: { zipCode: true } } },
        },
        cells: {
          include: {
            participants: {
              select: { status: true, votedAt: true, droppedAt: true, userId: true, user: { select: { zipCode: true } } },
            },
            ideas: {
              select: { ideaId: true },
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

    // ── FUNNEL ──
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

    // ── PARTICIPATION STATS ──
    const allParticipants = deliberation.cells.flatMap(c => c.participants)
    const droppedCount = allParticipants.filter(p => p.status === 'DROPPED').length
    const replacedCount = allParticipants.filter(p => p.status === 'REPLACED').length
    const totalParticipants = allParticipants.length

    const completedCells = deliberation.cells.filter(c => c.status === 'COMPLETED')
    const timedOutCells = deliberation.cells.filter(c => c.completedByTimeout)

    const totalComments = deliberation.cells.reduce((sum, c) => sum + c._count.comments, 0)
    const cellCount = deliberation.cells.length

    // Full participation cells: every participant voted
    const fullParticipationCells = deliberation.cells.filter(c => {
      if (c.participants.length === 0) return false
      return c.participants.every(p => p.status === 'VOTED' || p.votedAt)
    }).length

    // Avg XP utilization
    const xpUtils = deliberation.cells.map(c => c.avgXPUtilization).filter((v): v is number => v != null)
    const avgXPUtilization = xpUtils.length > 0 ? xpUtils.reduce((a, b) => a + b, 0) / xpUtils.length : null

    // Ideas with zero discussion
    const ideaCommentCounts = await prisma.comment.groupBy({
      by: ['ideaId'],
      where: { cell: { deliberationId: id }, ideaId: { not: null } },
      _count: true,
    })
    const ideaIdsWithComments = new Set(ideaCommentCounts.map(c => c.ideaId))
    const zeroDiscussionIdeas = deliberation.ideas.filter(i => !ideaIdsWithComments.has(i.id)).length

    // Vote response times
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
    const medianVoteTime = voteTimes.length > 0 ? voteTimes[Math.floor(voteTimes.length / 2)] : null

    const participation = {
      medianVoteTimeMs: medianVoteTime,
      dropoutRate: totalParticipants > 0 ? droppedCount / totalParticipants : 0,
      replacementRate: totalParticipants > 0 ? replacedCount / totalParticipants : 0,
      timeoutRate: completedCells.length > 0 ? timedOutCells.length / completedCells.length : 0,
      avgCommentsPerCell: cellCount > 0 ? Math.round((totalComments / cellCount) * 10) / 10 : 0,
      fullParticipationRate: cellCount > 0 ? Math.round((fullParticipationCells / cellCount) * 1000) / 10 : 0,
      avgXPUtilization: avgXPUtilization != null ? Math.round(avgXPUtilization * 10) / 10 : null,
      zeroDiscussionRate: deliberation.ideas.length > 0
        ? Math.round((zeroDiscussionIdeas / deliberation.ideas.length) * 1000) / 10
        : 0,
    }

    // ── TIER PROGRESSION ──
    const tierMap = new Map<number, typeof deliberation.cells>()
    for (const cell of deliberation.cells) {
      if (!tierMap.has(cell.tier)) tierMap.set(cell.tier, [])
      tierMap.get(cell.tier)!.push(cell)
    }

    // Count unique ideas per tier via CellIdea
    const tierIdeaCounts = new Map<number, number>()
    for (const [tier, cells] of tierMap) {
      const ideaIds = new Set<string>()
      for (const cell of cells) {
        for (const ci of cell.ideas) ideaIds.add(ci.ideaId)
      }
      tierIdeaCounts.set(tier, ideaIds.size)
    }

    const tiers = Array.from(tierMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([tier, cells]) => {
        const totalVotes = cells.reduce((sum, c) => sum + c._count.votes, 0)
        const timeouts = cells.filter(c => c.completedByTimeout).length
        const starts = cells.map(c => new Date(c.createdAt).getTime())
        const ends = cells.filter(c => c.completedAt).map(c => new Date(c.completedAt!).getTime())
        const durationMs = ends.length > 0 && starts.length > 0
          ? Math.max(...ends) - Math.min(...starts)
          : null

        // Ideas out = next tier's ideas in, or for last tier = champion count
        const nextTierIdeas = tierIdeaCounts.get(tier + 1)

        return {
          tier,
          cells: cells.length,
          ideasIn: tierIdeaCounts.get(tier) || 0,
          ideasOut: nextTierIdeas || (tier === Math.max(...tierMap.keys()) ? deliberation.ideas.filter(i => i.isChampion).length || 1 : 0),
          totalVotes,
          avgVotesPerCell: cells.length > 0 ? Math.round(totalVotes / cells.length * 10) / 10 : 0,
          durationMs,
          timeouts,
          completedNaturally: cells.filter(c => c.status === 'COMPLETED' && !c.completedByTimeout).length,
        }
      })

    // ── IDEAS WITH PER-TIER XP ──
    const tierXP = await prisma.$queryRaw<{ ideaId: string; tier: number; xp: bigint; votes: bigint }[]>`
      SELECT v."ideaId", c."tier", COALESCE(SUM(v."xpPoints"), 0) as xp, COUNT(v."id") as votes
      FROM "Vote" v JOIN "Cell" c ON v."cellId" = c."id"
      WHERE c."deliberationId" = ${id}
      GROUP BY v."ideaId", c."tier"
      ORDER BY c."tier" ASC
    `

    const ideaXPMap = new Map<string, { tier: number; xp: number; votes: number }[]>()
    for (const row of tierXP) {
      if (!ideaXPMap.has(row.ideaId)) ideaXPMap.set(row.ideaId, [])
      ideaXPMap.get(row.ideaId)!.push({ tier: row.tier, xp: Number(row.xp), votes: Number(row.votes) })
    }

    const ideas = deliberation.ideas.slice(0, 20).map(i => ({
      id: i.id,
      text: i.text,
      status: i.status,
      tier: i.tier,
      totalVotes: i.totalVotes,
      totalXP: i.totalXP,
      losses: i.losses,
      isChampion: i.isChampion,
      author: i.author?.name || 'Anonymous',
      perTier: ideaXPMap.get(i.id) || [],
    }))

    // ── GEOGRAPHIC DISTRIBUTION ──
    const zipCounts = new Map<string, number>()
    for (const m of deliberation.members) {
      const zip = m.user?.zipCode || 'Unset'
      zipCounts.set(zip, (zipCounts.get(zip) || 0) + 1)
    }
    const geography = Array.from(zipCounts.entries())
      .map(([zip, count]) => ({ zip, count, pct: Math.round((count / deliberation.members.length) * 1000) / 10 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    // ── REPRESENTATION BALANCE ──
    let crossDistrictCells = 0
    let cellsWithZipData = 0
    for (const cell of deliberation.cells) {
      const zips = new Set(cell.participants.map(p => p.user?.zipCode).filter(Boolean))
      if (zips.size > 0) {
        cellsWithZipData++
        if (zips.size >= 3) crossDistrictCells++
      }
    }

    const representation = {
      crossDistrictRate: cellsWithZipData > 0 ? Math.round((crossDistrictCells / cellsWithZipData) * 1000) / 10 : null,
      cellsWithZipData,
    }

    // ── VIRAL COMMENTS ──
    const viralComments = await prisma.comment.findMany({
      where: { cell: { deliberationId: id }, spreadCount: { gt: 0 } },
      orderBy: { spreadCount: 'desc' },
      take: 10,
      select: {
        id: true, text: true, spreadCount: true, reachTier: true, upvoteCount: true,
        user: { select: { name: true } },
        cell: { select: { id: true, tier: true } },
      },
    })

    // ── DECISION CONFIDENCE ──
    const maxTier = tiers.length > 0 ? Math.max(...tiers.map(t => t.tier)) : 0
    const champion = deliberation.ideas.find(i => i.isChampion)

    // Final tier XP shares
    const finalTierVotes = tierXP.filter(r => r.tier === maxTier)
    const totalFinalXP = finalTierVotes.reduce((sum, r) => sum + Number(r.xp), 0)
    const finalXPShares = finalTierVotes
      .map(r => ({
        ideaId: r.ideaId,
        text: deliberation.ideas.find(i => i.id === r.ideaId)?.text || '',
        xp: Number(r.xp),
        pct: totalFinalXP > 0 ? Math.round((Number(r.xp) / totalFinalXP) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.xp - a.xp)

    // Cell win rate for champion
    let championCellsAppeared = 0
    let championCellsWon = 0
    if (champion) {
      for (const cell of deliberation.cells) {
        const hasChampion = cell.ideas.some(ci => ci.ideaId === champion.id)
        if (!hasChampion) continue
        championCellsAppeared++
        // Check if champion had most votes in this cell
        const cellVotes = tierXP.filter(r =>
          cell.ideas.some(ci => ci.ideaId === r.ideaId) &&
          r.tier === cell.tier
        )
        if (cellVotes.length > 0) {
          const maxXP = Math.max(...cellVotes.map(v => Number(v.xp)))
          const championXP = cellVotes.find(v => v.ideaId === champion.id)
          if (championXP && Number(championXP.xp) >= maxXP) championCellsWon++
        }
      }
    }

    // Head-to-head: champion vs each finalist
    const finalists = finalXPShares.slice(0, 4).map(f => f.ideaId)
    const headToHead: { opponentId: string; opponentText: string; wins: number; losses: number }[] = []
    if (champion) {
      for (const oppId of finalists) {
        if (oppId === champion.id) continue
        let wins = 0, losses = 0
        for (const cell of deliberation.cells) {
          const hasChampion = cell.ideas.some(ci => ci.ideaId === champion.id)
          const hasOpponent = cell.ideas.some(ci => ci.ideaId === oppId)
          if (!hasChampion || !hasOpponent) continue
          // Compare XP in this cell's tier
          const champVotes = tierXP.find(r => r.ideaId === champion.id && r.tier === cell.tier)
          const oppVotes = tierXP.find(r => r.ideaId === oppId && r.tier === cell.tier)
          const champXP = champVotes ? Number(champVotes.xp) : 0
          const oppXP = oppVotes ? Number(oppVotes.xp) : 0
          if (champXP > oppXP) wins++
          else if (oppXP > champXP) losses++
        }
        headToHead.push({
          opponentId: oppId,
          opponentText: deliberation.ideas.find(i => i.id === oppId)?.text || '',
          wins, losses,
        })
      }
    }

    const mandate = {
      finalXPShares,
      championCellsAppeared,
      championCellsWon,
      cellWinRate: championCellsAppeared > 0 ? Math.round((championCellsWon / championCellsAppeared) * 1000) / 10 : 0,
      headToHead,
    }

    // ── CELL AUDIT SAMPLES ──
    // Pick 3 cells from mid-to-late tiers with most comments
    const auditCellCandidates = deliberation.cells
      .filter(c => c.status === 'COMPLETED' && c.tier >= Math.max(1, maxTier - 2))
      .sort((a, b) => b._count.comments - a._count.comments)
      .slice(0, 3)

    const auditCells = await Promise.all(
      auditCellCandidates.map(async (cell) => {
        const cellDetail = await prisma.cell.findUnique({
          where: { id: cell.id },
          include: {
            participants: {
              select: { user: { select: { name: true, zipCode: true } }, status: true },
            },
            ideas: {
              select: {
                idea: { select: { id: true, text: true } },
              },
            },
            comments: {
              orderBy: { createdAt: 'asc' },
              take: 10,
              select: {
                text: true, createdAt: true,
                user: { select: { name: true } },
              },
            },
            votes: {
              select: { ideaId: true, xpPoints: true },
            },
          },
        })
        if (!cellDetail) return null

        // Aggregate votes per idea
        const votesByIdea = new Map<string, { votes: number; xp: number }>()
        for (const v of cellDetail.votes) {
          const existing = votesByIdea.get(v.ideaId) || { votes: 0, xp: 0 }
          existing.votes++
          existing.xp += v.xpPoints
          votesByIdea.set(v.ideaId, existing)
        }

        return {
          id: cell.id,
          tier: cell.tier,
          commentCount: cell._count.comments,
          duration: cell.completedAt && cell.createdAt
            ? Math.round((new Date(cell.completedAt).getTime() - new Date(cell.createdAt).getTime()) / 60000)
            : null,
          participants: cellDetail.participants.map(p => ({
            name: p.user?.name || 'Anonymous',
            zip: p.user?.zipCode || null,
            status: p.status,
          })),
          ideas: cellDetail.ideas.map(ci => ({
            id: ci.idea.id,
            text: ci.idea.text,
            votes: votesByIdea.get(ci.idea.id)?.votes || 0,
            xp: votesByIdea.get(ci.idea.id)?.xp || 0,
          })).sort((a, b) => b.xp - a.xp),
          dialogue: cellDetail.comments.map(c => ({
            speaker: c.user?.name || 'Anonymous',
            text: c.text,
            time: c.createdAt.toISOString(),
          })),
        }
      })
    )

    // ── TIMELINE ──
    const timeline: { event: string; timestamp: string; detail?: string }[] = []
    timeline.push({ event: 'Created', timestamp: deliberation.createdAt.toISOString() })

    if (deliberation.members.length > 0) {
      const firstJoin = deliberation.members
        .map(m => new Date(m.joinedAt))
        .sort((a, b) => a.getTime() - b.getTime())[0]
      timeline.push({ event: 'First member joined', timestamp: firstJoin.toISOString() })
    }

    if (deliberation.ideas.length > 0) {
      const firstIdea = deliberation.ideas
        .map(i => new Date(i.createdAt))
        .sort((a, b) => a.getTime() - b.getTime())[0]
      timeline.push({ event: 'First idea submitted', timestamp: firstIdea.toISOString() })
    }

    const tierStarts = new Map<number, Date>()
    for (const cell of deliberation.cells) {
      const existing = tierStarts.get(cell.tier)
      const cellDate = new Date(cell.createdAt)
      if (!existing || cellDate < existing) tierStarts.set(cell.tier, cellDate)
    }
    for (const [tier, date] of Array.from(tierStarts.entries()).sort(([a], [b]) => a - b)) {
      const tierCells = tierMap.get(tier)
      const tierIdeas = tierIdeaCounts.get(tier) || 0
      timeline.push({
        event: `Tier ${tier} started`,
        timestamp: date.toISOString(),
        detail: `${tierCells?.length || 0} cells, ${tierIdeas} ideas`,
      })
    }

    if (deliberation.completedAt) {
      timeline.push({
        event: 'Priority declared',
        timestamp: deliberation.completedAt.toISOString(),
        detail: champion?.text,
      })
    }

    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // ── AI CACHE ──
    const aiAnalysis = deliberation.analyticsCache || null

    return NextResponse.json({
      question: deliberation.question,
      description: deliberation.description,
      phase: deliberation.phase,
      currentTier: deliberation.currentTier,
      champion: champion ? { id: champion.id, text: champion.text, author: champion.author?.name } : null,
      createdAt: deliberation.createdAt.toISOString(),
      completedAt: deliberation.completedAt?.toISOString() || null,
      funnel,
      participation,
      tiers,
      ideas,
      geography,
      representation,
      viralComments: viralComments.map(c => ({
        text: c.text,
        author: c.user?.name || 'Anonymous',
        cellId: c.cell?.id,
        cellTier: c.cell?.tier ?? 0,
        spreadCount: c.spreadCount,
        reachTier: c.reachTier,
        upvoteCount: c.upvoteCount,
      })),
      mandate,
      auditCells: auditCells.filter(Boolean),
      timeline,
      aiAnalysis,
    })
  } catch (error) {
    console.error('Error computing analytics:', error)
    return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 })
  }
}
