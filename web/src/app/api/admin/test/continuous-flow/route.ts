import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'
import { tryCreateContinuousFlowCell } from '@/lib/voting'
import { requireAdminVerified } from '@/lib/admin'

/**
 * POST /api/admin/test/continuous-flow
 *
 * Integration test for continuous flow fractal tier advancement.
 * Creates a deliberation with N ideas, simulates FCFS voting through all tiers,
 * and returns the full tier structure.
 *
 * Body: { ideaCount?: number }  (default 25, max 625)
 *
 * Expected tier structures:
 *   25 ideas  → 5 T1 cells → 1 T2 cell → winner
 *   125 ideas → 25 T1 cells → 5 T2 cells → 1 T3 cell → winner
 *   625 ideas → 125 T1 cells → 25 T2 cells → 5 T3 cells → 1 T4 cell → winner
 */
export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 })
    }

    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const body = await req.json()
    const ideaCount = Math.min(Math.max(body.ideaCount || 25, 5), 625)
    const cellSize = 5

    const log: string[] = []
    const tierStructure: Record<number, { cells: number; ideas: number; completedCells: number }> = {}

    log.push(`=== Continuous Flow Fractal Test: ${ideaCount} ideas, cellSize=${cellSize} ===`)

    // 1. Create test users (need enough for all voting across tiers)
    // Each cell needs cellSize voters, and a voter can only vote once per cell.
    // Total voters needed ≈ ideaCount (each T1 cell needs 5 voters)
    const userCount = Math.max(ideaCount, 50)
    const testUsers: { id: string }[] = []
    for (let i = 0; i < userCount; i++) {
      const email = `cf-test-${i}@test.local`
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          name: `CF Test User ${i}`,
          emailVerified: new Date(),
        },
        select: { id: true },
      })
      testUsers.push(user)
    }
    log.push(`Created ${testUsers.length} test users`)

    // 2. Create continuous flow FCFS deliberation
    const deliberation = await prisma.deliberation.create({
      data: {
        question: `[CF-TEST] Fractal tier test with ${ideaCount} ideas`,
        phase: 'VOTING',
        continuousFlow: true,
        allocationMode: 'fcfs',
        cellSize,
        votingTimeoutMs: 0, // no timeout
        accumulationEnabled: false,
        creatorId: testUsers[0].id,
        currentTier: 1,
      },
    })
    log.push(`Created deliberation ${deliberation.id}`)

    // 3. Create ideas and form T1 cells
    const ideas: { id: string; text: string }[] = []
    for (let i = 0; i < ideaCount; i++) {
      const idea = await prisma.idea.create({
        data: {
          deliberationId: deliberation.id,
          authorId: testUsers[i % testUsers.length].id,
          text: `Test idea #${i + 1}: ${randomTopic()}`,
          status: 'SUBMITTED',
        },
        select: { id: true, text: true },
      })
      ideas.push(idea)

      // After each idea, try to form a T1 cell (like the real flow)
      if ((i + 1) % cellSize === 0) {
        await tryCreateContinuousFlowCell(deliberation.id)
      }
    }
    // One more attempt for any stragglers
    await tryCreateContinuousFlowCell(deliberation.id)

    const t1Cells = await prisma.cell.findMany({
      where: { deliberationId: deliberation.id, tier: 1 },
      include: { ideas: true },
    })
    tierStructure[1] = { cells: t1Cells.length, ideas: ideaCount, completedCells: 0 }
    log.push(`Tier 1: ${t1Cells.length} cells created from ${ideaCount} ideas`)

    // 4. Simulate voting through all tiers
    let round = 0
    const maxRounds = 50 // safety limit

    while (round < maxRounds) {
      round++

      // Find all incomplete cells (any tier)
      const incompleteCells = await prisma.cell.findMany({
        where: {
          deliberationId: deliberation.id,
          status: { not: 'COMPLETED' },
        },
        include: {
          ideas: { include: { idea: true } },
          votes: true,
          participants: true,
        },
        orderBy: { tier: 'asc' },
      })

      if (incompleteCells.length === 0) {
        // Check if we have a winner
        const final = await prisma.deliberation.findUnique({
          where: { id: deliberation.id },
          select: { phase: true, championId: true, currentTier: true },
        })
        if (final?.phase === 'COMPLETED' || final?.phase === 'ACCUMULATING') {
          log.push(`\n=== COMPLETE: phase=${final.phase}, champion=${final.championId} ===`)
          break
        }
        log.push(`Round ${round}: no incomplete cells but no winner yet, checking...`)

        // Maybe there are advancing ideas waiting to form higher-tier cells
        // This shouldn't happen since handleContinuousFlowCellComplete triggers it,
        // but just in case — manually try
        const advancing = await prisma.idea.findMany({
          where: { deliberationId: deliberation.id, status: 'ADVANCING' },
          select: { tier: true },
        })
        if (advancing.length > 0) {
          const tiers = [...new Set(advancing.map(a => a.tier))]
          log.push(`  Found ${advancing.length} advancing ideas at tiers: ${tiers.join(', ')}`)
          // This means the continuous flow component should have handled it
          // but didn't — break to report the issue
        }
        break
      }

      // Process the lowest-tier incomplete cells first
      const lowestTier = incompleteCells[0].tier
      const cellsToProcess = incompleteCells.filter(c => c.tier === lowestTier)

      log.push(`Round ${round}: processing ${cellsToProcess.length} cells at tier ${lowestTier}`)

      let votesThisRound = 0
      for (const cell of cellsToProcess) {
        // Get voters who haven't voted in this cell
        const existingVoterIds = new Set(cell.votes.map(v => v.userId))
        // Also exclude idea authors in this cell (optional, but realistic)
        const ideaAuthorIds = new Set(
          cell.ideas.map(ci => ci.idea.authorId).filter(Boolean) as string[]
        )

        const neededVoters = cellSize - existingVoterIds.size
        if (neededVoters <= 0) {
          // Already has enough votes, just process
          await processCellResults(cell.id)
          continue
        }

        // Find available voters (not already voted in this cell)
        const availableVoters = testUsers.filter(
          u => !existingVoterIds.has(u.id)
        ).slice(0, neededVoters)

        // Add voters as participants (FCFS enter)
        for (const voter of availableVoters) {
          const existing = await prisma.cellParticipation.findUnique({
            where: { cellId_userId: { cellId: cell.id, userId: voter.id } },
          })
          if (!existing) {
            await prisma.cellParticipation.create({
              data: { cellId: cell.id, userId: voter.id },
            })
          }
        }

        // Cast votes: distribute 10 XP across ideas
        const cellIdeaIds = cell.ideas.map(ci => ci.ideaId)
        for (let vi = 0; vi < availableVoters.length; vi++) {
          const voter = availableVoters[vi]

          // Simple voting pattern: favor first idea with 60% weight
          const favorIdx = vi < Math.ceil(availableVoters.length * 0.6) ? 0 : 1
          const favorId = cellIdeaIds[Math.min(favorIdx, cellIdeaIds.length - 1)]

          const allocations: { ideaId: string; xp: number }[] = []
          allocations.push({ ideaId: favorId, xp: 7 })
          if (cellIdeaIds.length > 1) {
            allocations.push({ ideaId: cellIdeaIds[favorIdx === 0 ? 1 : 0], xp: 2 })
          }
          if (cellIdeaIds.length > 2) {
            const thirdIdx = cellIdeaIds.findIndex(id => !allocations.some(a => a.ideaId === id))
            if (thirdIdx >= 0) allocations.push({ ideaId: cellIdeaIds[thirdIdx], xp: 1 })
          }
          const allocated = allocations.reduce((s, a) => s + a.xp, 0)
          if (allocated < 10) allocations[0].xp += (10 - allocated)

          for (const alloc of allocations) {
            const voteId = `cfvt${Date.now()}${Math.random().toString(36).slice(2, 8)}`
            try {
              await prisma.$executeRaw`
                INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
                VALUES (${voteId}, ${cell.id}, ${voter.id}, ${alloc.ideaId}, ${alloc.xp}, NOW())
                ON CONFLICT DO NOTHING
              `
              votesThisRound++
            } catch { /* skip duplicates */ }
          }

          // Update idea XP
          for (const alloc of allocations) {
            await prisma.$executeRaw`
              UPDATE "Idea" SET "totalXP" = "totalXP" + ${alloc.xp}, "totalVotes" = "totalVotes" + 1 WHERE id = ${alloc.ideaId}
            `
          }
        }

        // Process cell results (triggers continuous flow tier advancement)
        await processCellResults(cell.id)
      }

      log.push(`  Votes cast: ${votesThisRound}`)

      // Update tier structure snapshot
      const allCells = await prisma.cell.findMany({
        where: { deliberationId: deliberation.id },
        select: { tier: true, status: true },
      })
      const tiers = [...new Set(allCells.map(c => c.tier))].sort((a, b) => a - b)
      for (const t of tiers) {
        const cellsAtTier = allCells.filter(c => c.tier === t)
        tierStructure[t] = {
          cells: cellsAtTier.length,
          ideas: cellsAtTier.length * cellSize, // approximate
          completedCells: cellsAtTier.filter(c => c.status === 'COMPLETED').length,
        }
      }
    }

    // 5. Final state
    const finalDelib = await prisma.deliberation.findUnique({
      where: { id: deliberation.id },
      select: { phase: true, championId: true, currentTier: true },
    })

    const winnerIdea = finalDelib?.championId
      ? await prisma.idea.findUnique({
          where: { id: finalDelib.championId },
          select: { text: true, totalXP: true, tier: true },
        })
      : null

    // Detailed tier breakdown
    const allCells = await prisma.cell.findMany({
      where: { deliberationId: deliberation.id },
      include: {
        ideas: { include: { idea: { select: { id: true, text: true, status: true, totalXP: true } } } },
      },
      orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }],
    })

    const tierBreakdown: Record<number, {
      cellCount: number
      completedCells: number
      cells: { id: string; status: string; ideas: { id: string; text: string; status: string; xp: number }[] }[]
    }> = {}

    for (const cell of allCells) {
      if (!tierBreakdown[cell.tier]) {
        tierBreakdown[cell.tier] = { cellCount: 0, completedCells: 0, cells: [] }
      }
      tierBreakdown[cell.tier].cellCount++
      if (cell.status === 'COMPLETED') tierBreakdown[cell.tier].completedCells++
      tierBreakdown[cell.tier].cells.push({
        id: cell.id,
        status: cell.status,
        ideas: cell.ideas.map(ci => ({
          id: ci.idea.id,
          text: ci.idea.text.slice(0, 60),
          status: ci.idea.status,
          xp: ci.idea.totalXP,
        })),
      })
    }

    // Expected vs actual
    const expectedTiers = Math.ceil(Math.log(ideaCount) / Math.log(cellSize))
    const actualTiers = Object.keys(tierBreakdown).length

    const result = {
      success: true,
      deliberationId: deliberation.id,
      ideaCount,
      cellSize,
      expectedTiers,
      actualTiers,
      phase: finalDelib?.phase,
      currentTier: finalDelib?.currentTier,
      champion: winnerIdea ? { text: winnerIdea.text, xp: winnerIdea.totalXP } : null,
      tierStructure: tierBreakdown,
      log,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Continuous flow test error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    const stack = error instanceof Error ? error.stack : undefined
    return NextResponse.json({
      error: 'Continuous flow test failed',
      details: message,
      stack: stack?.split('\n').slice(0, 10).join('\n'),
    }, { status: 500 })
  }
}

function randomTopic(): string {
  const topics = [
    'Federated consensus for cross-chain governance',
    'Reputation-weighted voting to reduce sybil attacks',
    'Quadratic funding for public goods allocation',
    'Prediction markets for policy impact assessment',
    'Liquid democracy with transitive delegation',
    'Zero-knowledge proofs for anonymous voting',
    'Harberger tax for shared resource management',
    'Futarchy: governance by prediction market',
    'Conviction voting for continuous resource allocation',
    'Schelling points in multi-agent coordination',
    'Mechanism design for truthful revelation',
    'Sortition-based citizen assemblies at scale',
    'Retroactive public goods funding',
    'Optimistic governance with fraud proofs',
    'Commitment devices for collective action',
    'Double-blind peer review for idea selection',
    'Bonding curves for community token economics',
    'Quadratic voting for preference intensity',
    'Exit-to-community for platform cooperativism',
    'Proof-of-stake for governance weight',
  ]
  return topics[Math.floor(Math.random() * topics.length)]
}
