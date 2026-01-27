import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'

// POST /api/admin/test/simulate-voting - Simulate votes through all tiers
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { deliberationId, leaveFinalVote = true } = body

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
      return NextResponse.json({ error: 'Deliberation must be in VOTING phase' }, { status: 400 })
    }

    let votesCreated = 0
    let tiersProcessed = 0
    let champion: string | null = null
    let finalCellStatus: string | null = null

    // Process tiers until we reach completion or final cell
    while (true) {
      // Get incomplete cells (status != COMPLETED) at the current lowest tier
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
            ideas: {
              where: { status: 'WINNER' },
            },
          },
        })

        if (updatedDeliberation?.phase === 'COMPLETED' && updatedDeliberation.ideas.length > 0) {
          champion = updatedDeliberation.ideas[0].text
        } else if (updatedDeliberation?.phase === 'ACCUMULATING' && updatedDeliberation.ideas.length > 0) {
          champion = updatedDeliberation.ideas[0].text + ' (now accepting challengers)'
        }
        break
      }

      const currentTier = incompleteCells[0].tier
      const cellsAtTier = incompleteCells.filter((c: typeof incompleteCells[number]) => c.tier === currentTier)

      // Check if this is a final showdown (all cells have same ideas, ≤4 ideas)
      const firstCellIdeaIds = cellsAtTier[0]?.ideas.map((ci: { ideaId: string }) => ci.ideaId).sort() || []
      const isFinalShowdown = firstCellIdeaIds.length <= 4 && firstCellIdeaIds.length > 0 &&
        cellsAtTier.every(cell => {
          const cellIdeaIds = cell.ideas.map((ci: { ideaId: string }) => ci.ideaId).sort()
          return cellIdeaIds.length === firstCellIdeaIds.length &&
                 cellIdeaIds.every((id: string, i: number) => id === firstCellIdeaIds[i])
        })

      // If final showdown and we want to leave votes for manual testing,
      // vote for everyone EXCEPT the real user (session user)
      if (isFinalShowdown && leaveFinalVote) {
        for (const cell of cellsAtTier) {
          const votedUserIds = new Set(cell.votes.map((v: { userId: string }) => v.userId))
          // Get participants who haven't voted, excluding test users (vote for them)
          // but keep real users unvoted
          const unvotedParticipants = cell.participants.filter((p: { userId: string; user?: { email?: string } }) => {
            if (votedUserIds.has(p.userId)) return false
            // Check if this is a test user (email contains @test.local)
            const isTestUser = p.user?.email?.includes('@test.local')
            return isTestUser // Only include test users to vote for
          })

          for (let i = 0; i < unvotedParticipants.length; i++) {
            const participant = unvotedParticipants[i]
            const ideaIndex = i < Math.ceil(unvotedParticipants.length * 0.6) ? 0 : 1
            const ideaToVote = cell.ideas[Math.min(ideaIndex, cell.ideas.length - 1)]
            if (!ideaToVote) continue

            await prisma.vote.create({
              data: {
                cellId: cell.id,
                userId: participant.userId,
                ideaId: ideaToVote.ideaId,
              },
            })
            votesCreated++
          }

          // Check if cell is complete (real user may have already voted or isn't in this cell)
          const updatedCell = await prisma.cell.findUnique({
            where: { id: cell.id },
            include: { votes: true, participants: true },
          })

          if (updatedCell && updatedCell.votes.length >= updatedCell.participants.length) {
            await processCellResults(cell.id)
          }
        }

        // Check if deliberation completed after processing final showdown cells
        const checkDeliberation = await prisma.deliberation.findUnique({
          where: { id: deliberationId },
          include: {
            ideas: { where: { status: 'WINNER' } },
          },
        })

        if (checkDeliberation?.phase === 'COMPLETED' || checkDeliberation?.phase === 'ACCUMULATING') {
          if (checkDeliberation.ideas.length > 0) {
            champion = checkDeliberation.ideas[0].text
            if (checkDeliberation.phase === 'ACCUMULATING') {
              champion += ' (now accepting challengers)'
            }
          }
          break // Deliberation complete, exit loop
        }

        finalCellStatus = `Final showdown: waiting for your vote in your cell`
        tiersProcessed++
        break // Exit loop - waiting for real user vote, don't keep looping
      }

      for (const cell of cellsAtTier) {
        const votedUserIds = new Set(cell.votes.map((v: { userId: string }) => v.userId))
        const unvotedParticipants = cell.participants.filter((p: { userId: string }) => !votedUserIds.has(p.userId))

        // Simulate votes - concentrate on first 1-2 ideas to create clear winners
        for (let i = 0; i < unvotedParticipants.length; i++) {
          const participant = unvotedParticipants[i]
          // Most votes go to first idea, some to second - creates clear winner
          // With 5 voters: 3 vote for idea 0, 2 vote for idea 1
          const ideaIndex = i < Math.ceil(unvotedParticipants.length * 0.6) ? 0 : 1
          const ideaToVote = cell.ideas[Math.min(ideaIndex, cell.ideas.length - 1)]

          if (!ideaToVote) continue

          await prisma.vote.create({
            data: {
              cellId: cell.id,
              userId: participant.userId,
              ideaId: ideaToVote.ideaId,
            },
          })
          votesCreated++
        }

        // Check if cell is now complete and process it using the real voting logic
        const updatedCell = await prisma.cell.findUnique({
          where: { id: cell.id },
          include: { votes: true, participants: true },
        })

        if (updatedCell && updatedCell.votes.length >= updatedCell.participants.length) {
          // Use the real processCellResults which handles accumulation transitions
          await processCellResults(cell.id)
        }
      }

      tiersProcessed++

      // Safety limit
      if (tiersProcessed > 10) {
        break
      }
    }

    return NextResponse.json({
      success: true,
      votesCreated,
      tiersProcessed,
      champion,
      finalCellStatus,
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

