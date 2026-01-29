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

      // Build vote batch
      const voteBatch: { cellId: string; userId: string; ideaId: string }[] = []
      for (let i = 0; i < unvotedParticipants.length; i++) {
        const participant = unvotedParticipants[i]
        const ideaIndex = i < Math.ceil(unvotedParticipants.length * 0.6) ? 0 : 1
        const ideaToVote = cell.ideas[Math.min(ideaIndex, cell.ideas.length - 1)]
        if (!ideaToVote) continue

        voteBatch.push({
          cellId: cell.id,
          userId: participant.userId,
          ideaId: ideaToVote.ideaId,
        })
      }

      // Batch insert votes with skipDuplicates to prevent unique constraint errors
      if (voteBatch.length > 0) {
        const result = await prisma.vote.createMany({
          data: voteBatch,
          skipDuplicates: true,
        })
        votesCreated += result.count
      }

      // Check if cell is now complete and process it
      const updatedCell = await prisma.cell.findUnique({
        where: { id: cell.id },
        include: { votes: true, participants: true },
      })

      if (updatedCell && updatedCell.votes.length >= updatedCell.participants.length) {
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
