import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startChallengeRound } from '@/lib/challenge'
import { processCellResults } from '@/lib/voting'
import { isAdminEmail } from '@/lib/admin'

// POST /api/admin/test/simulate-accumulation - Test accumulation and challenge flow
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
    const { deliberationId, challengerCount = 10 } = body

    if (!deliberationId) {
      return NextResponse.json({ error: 'deliberationId required' }, { status: 400 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
      include: { ideas: true },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'ACCUMULATING') {
      return NextResponse.json({
        error: `Deliberation must be in ACCUMULATING phase (currently: ${deliberation.phase})`
      }, { status: 400 })
    }

    const logs: string[] = []
    logs.push(`Starting accumulation test for deliberation: ${deliberation.question}`)
    logs.push(`Current champion: ${deliberation.championId}`)

    // Step 1: Submit challenger ideas
    logs.push(`Submitting ${challengerCount} challenger ideas...`)

    for (let i = 1; i <= challengerCount; i++) {
      await prisma.idea.create({
        data: {
          deliberationId,
          text: `Challenger idea #${i}: A new approach to challenge the champion`,
          authorId: deliberation.creatorId,
          status: 'PENDING',
          isNew: true,
          tier: 0,
        },
      })
    }
    logs.push(`Created ${challengerCount} challenger ideas`)

    // Step 2: Start challenge round
    logs.push('Starting challenge round...')
    const challengeResult = await startChallengeRound(deliberationId)

    if (!challengeResult) {
      return NextResponse.json({
        success: false,
        logs,
        error: 'Challenge round already started by another caller',
      })
    }

    if ('extended' in challengeResult && challengeResult.extended) {
      return NextResponse.json({
        success: false,
        logs,
        error: `Challenge round extended: ${challengeResult.reason}`,
      })
    }

    if ('challengeRound' in challengeResult) {
      logs.push(`Challenge round ${challengeResult.challengeRound} started`)
      logs.push(`Challengers competing: ${challengeResult.challengers}`)
      logs.push(`Retired: ${challengeResult.retired}, Benched: ${challengeResult.benched}`)
    }

    // Step 3: Simulate voting through all tiers
    let votesCreated = 0
    let tiersProcessed = 0

    while (tiersProcessed < 10) {
      const incompleteCells = await prisma.cell.findMany({
        where: {
          deliberationId,
          status: { not: 'COMPLETED' },
        },
        include: {
          participants: { include: { user: true } },
          ideas: { include: { idea: true } },
          votes: true,
        },
        orderBy: { tier: 'asc' },
      })

      if (incompleteCells.length === 0) {
        break
      }

      const currentTier = incompleteCells[0].tier
      const cellsAtTier = incompleteCells.filter(c => c.tier === currentTier)
      logs.push(`Processing Tier ${currentTier}: ${cellsAtTier.length} cells`)

      for (const cell of cellsAtTier) {
        const votedUserIds = new Set(cell.votes.map(v => v.userId))
        const unvotedParticipants = cell.participants.filter(p => !votedUserIds.has(p.userId))

        // Simulate XP allocation votes — distribute 10 XP per voter
        const cellIdeas = cell.ideas.map(ci => ci.ideaId)
        for (let i = 0; i < unvotedParticipants.length; i++) {
          const participant = unvotedParticipants[i]
          if (cellIdeas.length === 0) continue

          // 60% favor idea 0, 40% favor idea 1
          const favorIndex = i < Math.ceil(unvotedParticipants.length * 0.6) ? 0 : 1
          const favorId = cellIdeas[Math.min(favorIndex, cellIdeas.length - 1)]

          // Distribute: 7 to favorite, 2 to second, 1 to third
          const allocations: { ideaId: string; xp: number }[] = [{ ideaId: favorId, xp: 7 }]
          if (cellIdeas.length > 1) {
            allocations.push({ ideaId: cellIdeas[favorIndex === 0 ? 1 : 0], xp: 2 })
          }
          if (cellIdeas.length > 2) {
            const thirdIdx = cellIdeas.findIndex(id => !allocations.some(a => a.ideaId === id))
            if (thirdIdx >= 0) allocations.push({ ideaId: cellIdeas[thirdIdx], xp: 1 })
          }
          const allocated = allocations.reduce((s, a) => s + a.xp, 0)
          if (allocated < 10) allocations[0].xp += (10 - allocated)

          for (const alloc of allocations) {
            const voteId = `vt${Date.now()}${Math.random().toString(36).slice(2, 8)}`
            await prisma.$executeRaw`
              INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
              VALUES (${voteId}, ${cell.id}, ${participant.userId}, ${alloc.ideaId}, ${alloc.xp}, NOW())
            `
          }
          votesCreated++

          // Update idea XP totals
          for (const alloc of allocations) {
            await prisma.$executeRaw`
              UPDATE "Idea" SET "totalXP" = "totalXP" + ${alloc.xp}, "totalVotes" = "totalVotes" + 1 WHERE id = ${alloc.ideaId}
            `
          }
        }

        // Process cell if all participants voted (check unique userIds)
        const allVotes = await prisma.vote.findMany({
          where: { cellId: cell.id },
          select: { userId: true },
        })
        const uniqueVoters = new Set(allVotes.map(v => v.userId))
        if (uniqueVoters.size >= cell.participants.length) {
          await processCellResults(cell.id)
        }
      }

      tiersProcessed++
    }

    // Check final state
    const finalDeliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
      include: {
        ideas: { where: { OR: [{ status: 'WINNER' }, { isChampion: true }] } },
      },
    })

    logs.push(`Voting complete: ${votesCreated} votes across ${tiersProcessed} tiers`)
    logs.push(`Final phase: ${finalDeliberation?.phase}`)

    if (finalDeliberation?.phase === 'ACCUMULATING') {
      const newChampion = finalDeliberation.ideas[0]
      logs.push(`New champion crowned: "${newChampion?.text?.slice(0, 50)}..."`)
      logs.push('Deliberation returned to ACCUMULATING phase - ready for next challenge!')
    } else if (finalDeliberation?.phase === 'COMPLETED') {
      logs.push('Deliberation COMPLETED (accumulation disabled?)')
    } else {
      logs.push(`Unexpected phase: ${finalDeliberation?.phase}`)
    }

    return NextResponse.json({
      success: true,
      logs,
      challengeRound: challengeResult && 'challengeRound' in challengeResult ? challengeResult.challengeRound : null,
      votesCreated,
      tiersProcessed,
      finalPhase: finalDeliberation?.phase,
      newChampionId: finalDeliberation?.championId,
    })
  } catch (error) {
    console.error('Error simulating accumulation:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      error: 'Failed to simulate accumulation',
      details: message,
    }, { status: 500 })
  }
}
