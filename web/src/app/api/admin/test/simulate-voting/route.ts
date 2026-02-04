import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'
import { isAdminEmail } from '@/lib/admin'

// POST /api/admin/test/simulate-voting - Simulate votes for ONE tier per request.
// Client should loop calling this endpoint until isComplete=true.
export async function POST(req: NextRequest) {
  try {
    // Block test endpoints in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 })
    }

    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin-only endpoint
    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { deliberationId, leaveFinalVote = true, leaveVotesOpen = 1 } = body
    const votesToLeaveOpen = typeof leaveVotesOpen === 'number' ? leaveVotesOpen : 1

    if (!deliberationId) {
      return NextResponse.json({ error: 'deliberationId required' }, { status: 400 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'VOTING') {
      // If already completed/accumulating, report that
      if (deliberation.phase === 'COMPLETED' || deliberation.phase === 'ACCUMULATING') {
        const winnerIdea = deliberation.championId
          ? await prisma.idea.findUnique({ where: { id: deliberation.championId } })
          : null
        return NextResponse.json({
          success: true,
          isComplete: true,
          votesCreated: 0,
          tierProcessed: deliberation.currentTier,
          champion: winnerIdea?.text || null,
          phase: deliberation.phase,
        })
      }
      return NextResponse.json({ error: 'Deliberation must be in VOTING phase' }, { status: 400 })
    }

    let votesCreated = 0

    // Get incomplete cells at the current lowest tier
    const incompleteCells = await prisma.cell.findMany({
      where: {
        deliberationId,
        status: { not: 'COMPLETED' },
      },
      include: {
        participants: {
          include: { user: true },
        },
        ideas: {
          include: { idea: true },
        },
        votes: true,
      },
      orderBy: { tier: 'asc' },
    })

    if (incompleteCells.length === 0) {
      // Check if deliberation is complete or in accumulation
      const updatedDeliberation = await prisma.deliberation.findUnique({
        where: { id: deliberationId },
        include: {
          ideas: { where: { status: 'WINNER' } },
        },
      })

      let champion: string | null = null
      if (updatedDeliberation?.ideas?.[0]) {
        champion = updatedDeliberation.ideas[0].text
        if (updatedDeliberation.phase === 'ACCUMULATING') {
          champion += ' (now accepting challengers)'
        }
      }

      return NextResponse.json({
        success: true,
        isComplete: true,
        votesCreated: 0,
        tierProcessed: deliberation.currentTier,
        champion,
        phase: updatedDeliberation?.phase,
      })
    }

    const currentTier = incompleteCells[0].tier
    const cellsAtTier = incompleteCells.filter(c => c.tier === currentTier)

    // Check if this is a final showdown (all cells have same ideas, ≤5 ideas)
    const firstCellIdeaIds = cellsAtTier[0]?.ideas.map(ci => ci.ideaId).sort() || []
    const isFinalShowdown = firstCellIdeaIds.length <= 5 && firstCellIdeaIds.length > 0 &&
      cellsAtTier.every(cell => {
        const cellIdeaIds = cell.ideas.map(ci => ci.ideaId).sort()
        return cellIdeaIds.length === firstCellIdeaIds.length &&
               cellIdeaIds.every((id, i) => id === firstCellIdeaIds[i])
      })

    // Process all cells at this tier
    for (const cell of cellsAtTier) {
      const votedUserIds = new Set(cell.votes.map(v => v.userId))
      const allUnvotedParticipants = cell.participants.filter(p => !votedUserIds.has(p.userId))

      let unvotedParticipants = allUnvotedParticipants

      // If final showdown and we want to leave votes for manual testing
      if (isFinalShowdown && leaveFinalVote) {
        // Sort: real users first (so they get left unvoted), then test users
        allUnvotedParticipants.sort((a, b) => {
          const aIsTest = a.user?.email?.includes('@test.local') ? 1 : 0
          const bIsTest = b.user?.email?.includes('@test.local') ? 1 : 0
          return aIsTest - bIsTest
        })
        // Skip the first X participants (leave them unvoted)
        unvotedParticipants = allUnvotedParticipants.slice(votesToLeaveOpen)
      }

      // Build XP allocation votes — each user distributes 10 XP across ideas
      const voteBatch: { cellId: string; userId: string; ideaId: string; xpPoints: number }[] = []
      for (let i = 0; i < unvotedParticipants.length; i++) {
        const participant = unvotedParticipants[i]
        const cellIdeas = cell.ideas.map(ci => ci.ideaId)
        if (cellIdeas.length === 0) continue

        // 60% of voters favor idea 0, 40% favor idea 1
        const favorIndex = i < Math.ceil(unvotedParticipants.length * 0.6) ? 0 : 1
        const favorId = cellIdeas[Math.min(favorIndex, cellIdeas.length - 1)]

        // Distribute 10 XP: 7 to favorite, 2 to second pick, 1 to third
        const allocations: { ideaId: string; xp: number }[] = []
        allocations.push({ ideaId: favorId, xp: 7 })
        if (cellIdeas.length > 1) {
          const secondId = cellIdeas[favorIndex === 0 ? 1 : 0]
          allocations.push({ ideaId: secondId, xp: 2 })
        }
        if (cellIdeas.length > 2) {
          const thirdIdx = cellIdeas.findIndex(id => !allocations.some(a => a.ideaId === id))
          if (thirdIdx >= 0) allocations.push({ ideaId: cellIdeas[thirdIdx], xp: 1 })
        }
        // If only 1-2 ideas, put remaining XP on favorite
        const allocated = allocations.reduce((s, a) => s + a.xp, 0)
        if (allocated < 10) {
          allocations[0].xp += (10 - allocated)
        }

        for (const alloc of allocations) {
          voteBatch.push({
            cellId: cell.id,
            userId: participant.userId,
            ideaId: alloc.ideaId,
            xpPoints: alloc.xp,
          })
        }
      }

      // Batch insert votes via raw SQL (xpPoints invisible to Prisma runtime)
      if (voteBatch.length > 0) {
        for (const v of voteBatch) {
          const voteId = `vt${Date.now()}${Math.random().toString(36).slice(2, 8)}`
          try {
            await prisma.$executeRaw`
              INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
              VALUES (${voteId}, ${v.cellId}, ${v.userId}, ${v.ideaId}, ${v.xpPoints}, NOW())
              ON CONFLICT DO NOTHING
            `
            votesCreated++
          } catch { /* skip duplicates */ }
        }
      }

      // Update idea XP totals after votes
      for (const ci of cell.ideas) {
        const totalXP = voteBatch
          .filter(v => v.ideaId === ci.ideaId)
          .reduce((s, v) => s + v.xpPoints, 0)
        if (totalXP > 0) {
          const voterCount = new Set(voteBatch.filter(v => v.ideaId === ci.ideaId).map(v => v.userId)).size
          await prisma.$executeRaw`
            UPDATE "Idea" SET "totalXP" = "totalXP" + ${totalXP}, "totalVotes" = "totalVotes" + ${voterCount} WHERE id = ${ci.ideaId}
          `
        }
      }

      // Check if cell is now complete — count unique voters (not vote records, since each voter has multiple XP allocations)
      const cellVotes = await prisma.vote.findMany({
        where: { cellId: cell.id },
        select: { userId: true },
      })
      const uniqueVoters = new Set(cellVotes.map(v => v.userId))
      if (uniqueVoters.size >= cell.participants.length) {
        await processCellResults(cell.id)
      }
    }

    // If final showdown with leaveFinalVote, stop here — waiting for real user
    if (isFinalShowdown && leaveFinalVote) {
      // Check if deliberation completed (all participants may have voted)
      const checkDeliberation = await prisma.deliberation.findUnique({
        where: { id: deliberationId },
        include: { ideas: { where: { status: 'WINNER' } } },
      })

      if (checkDeliberation?.phase === 'COMPLETED' || checkDeliberation?.phase === 'ACCUMULATING') {
        return NextResponse.json({
          success: true,
          isComplete: true,
          votesCreated,
          tierProcessed: currentTier,
          champion: checkDeliberation.ideas[0]?.text || null,
          phase: checkDeliberation.phase,
        })
      }

      return NextResponse.json({
        success: true,
        isComplete: false,
        votesCreated,
        tierProcessed: currentTier,
        nextTier: null,
        waitingForFinalVote: true,
        finalCellStatus: 'Final showdown: waiting for your vote in your cell',
      })
    }

    // Check post-processing state
    const postDeliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
      include: { ideas: { where: { status: 'WINNER' } } },
    })

    const isComplete = postDeliberation?.phase === 'COMPLETED' || postDeliberation?.phase === 'ACCUMULATING'
    let champion: string | null = null
    if (postDeliberation?.ideas?.[0]) {
      champion = postDeliberation.ideas[0].text
      if (postDeliberation.phase === 'ACCUMULATING') {
        champion += ' (now accepting challengers)'
      }
    }

    return NextResponse.json({
      success: true,
      isComplete,
      votesCreated,
      tierProcessed: currentTier,
      nextTier: isComplete ? null : postDeliberation?.currentTier,
      champion,
      phase: postDeliberation?.phase,
    })
  } catch (error) {
    console.error('Error simulating voting:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    const stack = error instanceof Error ? error.stack : undefined
    return NextResponse.json({
      error: 'Failed to simulate voting',
      details: message,
      stack: stack?.split('\n').slice(0, 5).join('\n')
    }, { status: 500 })
  }
}
