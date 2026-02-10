/**
 * Integration test for continuous flow fractal tier advancement.
 * Run: npx tsx scripts/test-continuous-flow.ts [ideaCount]
 *
 * Creates a deliberation, seeds ideas, simulates voting, verifies fractal tiers.
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load env files
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 30000,
  statement_timeout: 30000,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const DEFAULT_CELL_SIZE = 5

async function main() {
  const ideaCount = parseInt(process.argv[2] || '25', 10)
  const cellSize = DEFAULT_CELL_SIZE

  console.log(`\n=== Continuous Flow Fractal Test: ${ideaCount} ideas, cellSize=${cellSize} ===\n`)

  // 1. Create test users
  const userCount = Math.max(ideaCount * 2, 50)
  const testUsers: { id: string }[] = []
  for (let i = 0; i < userCount; i++) {
    const email = `cf-test-${i}@test.local`
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: `CF Test ${i}`,
        emailVerified: new Date(),
      },
      select: { id: true },
    })
    testUsers.push(user)
  }
  console.log(`Created ${testUsers.length} test users`)

  // 2. Create continuous flow FCFS deliberation
  const deliberation = await prisma.deliberation.create({
    data: {
      question: `[CF-TEST] Fractal ${ideaCount} ideas @ ${new Date().toISOString()}`,
      phase: 'VOTING',
      continuousFlow: true,
      allocationMode: 'fcfs',
      cellSize,
      votingTimeoutMs: 0,
      accumulationEnabled: false,
      creatorId: testUsers[0].id,
      currentTier: 1,
    },
  })
  console.log(`Deliberation: ${deliberation.id}`)

  // 3. Create ideas and form T1 cells
  const ideas: { id: string }[] = []
  for (let i = 0; i < ideaCount; i++) {
    const idea = await prisma.idea.create({
      data: {
        deliberationId: deliberation.id,
        authorId: testUsers[i % testUsers.length].id,
        text: `Idea #${i + 1}`,
        status: 'SUBMITTED',
      },
      select: { id: true },
    })
    ideas.push(idea)
  }
  console.log(`Created ${ideas.length} ideas`)

  // Form T1 cells via tryCreateContinuousFlowCell
  // Import dynamically since this uses server-only code
  const { tryCreateContinuousFlowCell } = await import('../src/lib/voting')

  let t1CellsCreated = 0
  for (let i = 0; i < Math.ceil(ideaCount / cellSize) + 1; i++) {
    const result = await tryCreateContinuousFlowCell(deliberation.id)
    if (result.cellCreated) t1CellsCreated++
    else break
  }
  console.log(`Tier 1: ${t1CellsCreated} cells formed\n`)

  // 4. Simulate voting round by round
  const { processCellResults } = await import('../src/lib/voting')
  let voterIdx = 0 // track which test users we've used
  let round = 0

  while (round < 100) {
    round++

    const incompleteCells = await prisma.cell.findMany({
      where: {
        deliberationId: deliberation.id,
        status: { not: 'COMPLETED' },
      },
      include: {
        ideas: true,
        votes: true,
      },
      orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }],
    })

    if (incompleteCells.length === 0) {
      const d = await prisma.deliberation.findUnique({
        where: { id: deliberation.id },
        select: { phase: true, championId: true, currentTier: true },
      })
      if (d?.phase === 'COMPLETED' || d?.phase === 'ACCUMULATING') {
        const winner = d.championId
          ? await prisma.idea.findUnique({ where: { id: d.championId }, select: { text: true } })
          : null
        console.log(`\n=== WINNER: "${winner?.text}" at tier ${d.currentTier} (phase: ${d.phase}) ===`)
        break
      }
      console.log(`Round ${round}: no incomplete cells, no winner. Checking advancing ideas...`)
      const adv = await prisma.idea.count({ where: { deliberationId: deliberation.id, status: 'ADVANCING' } })
      console.log(`  Advancing ideas: ${adv}`)
      if (adv === 0) break
      // Try manual tier advance
      const { tryAdvanceContinuousFlowTier } = await import('../src/lib/continuous-flow')
      for (let t = 1; t < 10; t++) {
        const created = await tryAdvanceContinuousFlowTier(deliberation.id, t)
        if (created) console.log(`  Manually triggered tier ${t + 1} cell`)
      }
      continue
    }

    const lowestTier = incompleteCells[0].tier
    const cellsToProcess = incompleteCells.filter(c => c.tier === lowestTier)
    const cellWord = cellsToProcess.length === 1 ? 'cell' : 'cells'

    process.stdout.write(`Round ${round}: ${cellsToProcess.length} ${cellWord} at T${lowestTier}`)

    for (const cell of cellsToProcess) {
      const existingVoterIds = new Set(cell.votes.map(v => v.userId))
      const needed = cellSize - existingVoterIds.size

      // Get fresh voters
      const voters: { id: string }[] = []
      while (voters.length < needed && voterIdx < testUsers.length) {
        const u = testUsers[voterIdx++]
        if (!existingVoterIds.has(u.id)) voters.push(u)
      }
      if (voters.length < needed) {
        voterIdx = 0
        while (voters.length < needed && voterIdx < testUsers.length) {
          const u = testUsers[voterIdx++]
          if (!existingVoterIds.has(u.id) && !voters.some(v => v.id === u.id)) voters.push(u)
        }
      }

      // Batch: add participants + votes + xp updates in one raw SQL block
      const cellIdeaIds = cell.ideas.map(ci => ci.ideaId)
      const voteRows: string[] = []
      const xpUpdates: Map<string, number> = new Map()
      const voterUpdates: Map<string, number> = new Map()

      for (let vi = 0; vi < voters.length; vi++) {
        const favorIdx = vi < 3 ? 0 : 1
        const favorId = cellIdeaIds[Math.min(favorIdx, cellIdeaIds.length - 1)]

        const allocations: { ideaId: string; xp: number }[] = [{ ideaId: favorId, xp: 7 }]
        if (cellIdeaIds.length > 1) allocations.push({ ideaId: cellIdeaIds[favorIdx === 0 ? 1 : 0], xp: 2 })
        if (cellIdeaIds.length > 2) {
          const thirdIdx = cellIdeaIds.findIndex(id => !allocations.some(a => a.ideaId === id))
          if (thirdIdx >= 0) allocations.push({ ideaId: cellIdeaIds[thirdIdx], xp: 1 })
        }
        const allocated = allocations.reduce((s, a) => s + a.xp, 0)
        if (allocated < 10) allocations[0].xp += (10 - allocated)

        for (const alloc of allocations) {
          const voteId = `cfvt${Date.now()}${Math.random().toString(36).slice(2, 8)}${vi}`
          voteRows.push(`('${voteId}', '${cell.id}', '${voters[vi].id}', '${alloc.ideaId}', ${alloc.xp}, NOW())`)
          xpUpdates.set(alloc.ideaId, (xpUpdates.get(alloc.ideaId) || 0) + alloc.xp)
          voterUpdates.set(alloc.ideaId, (voterUpdates.get(alloc.ideaId) || 0) + 1)
        }
      }

      // Batch insert participants
      if (voters.length > 0) {
        const partRows = voters.map(v =>
          `('${cell.id}_${v.id}', '${cell.id}', '${v.id}', 'ACTIVE', NOW())`
        ).join(',')
        await prisma.$executeRawUnsafe(
          `INSERT INTO "CellParticipation" (id, "cellId", "userId", status, "joinedAt") VALUES ${partRows} ON CONFLICT DO NOTHING`
        )
      }

      // Batch insert votes
      if (voteRows.length > 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt") VALUES ${voteRows.join(',')} ON CONFLICT DO NOTHING`
        )
      }

      // Batch XP updates
      for (const [ideaId, xp] of xpUpdates) {
        const voters = voterUpdates.get(ideaId) || 0
        await prisma.$executeRawUnsafe(
          `UPDATE "Idea" SET "totalXP" = "totalXP" + ${xp}, "totalVotes" = "totalVotes" + ${voters} WHERE id = '${ideaId}'`
        )
      }

      await processCellResults(cell.id)
    }

    // Print tier snapshot
    const snapshot = await prisma.cell.groupBy({
      by: ['tier', 'status'],
      where: { deliberationId: deliberation.id },
      _count: true,
    })
    const tierSummary: Record<number, { total: number; completed: number }> = {}
    for (const s of snapshot) {
      if (!tierSummary[s.tier]) tierSummary[s.tier] = { total: 0, completed: 0 }
      tierSummary[s.tier].total += s._count
      if (s.status === 'COMPLETED') tierSummary[s.tier].completed += s._count
    }
    const parts = Object.entries(tierSummary)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([t, v]) => `T${t}:${v.completed}/${v.total}`)
    console.log(` → ${parts.join(' | ')}`)
  }

  // 5. Final summary
  console.log('\n--- FINAL TIER STRUCTURE ---')
  const allCells = await prisma.cell.findMany({
    where: { deliberationId: deliberation.id },
    include: {
      ideas: { include: { idea: { select: { text: true, status: true, totalXP: true } } } },
    },
    orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }],
  })

  const tiers = [...new Set(allCells.map(c => c.tier))].sort((a, b) => a - b)
  for (const t of tiers) {
    const cells = allCells.filter(c => c.tier === t)
    console.log(`\nTier ${t}: ${cells.length} cells`)
    for (const cell of cells) {
      const winner = cell.ideas.find(ci => ci.idea.status === 'ADVANCING' || ci.idea.status === 'WINNER')
      const winnerText = winner ? `★ ${winner.idea.text} (${winner.idea.totalXP}xp)` : '?'
      console.log(`  Cell ${cell.id.slice(-6)}: ${winnerText}`)
    }
  }

  const expectedTiers = Math.ceil(Math.log(ideaCount) / Math.log(cellSize))
  console.log(`\nExpected tiers: ${expectedTiers}, Actual: ${tiers.length}`)
  console.log(`Test ${tiers.length >= expectedTiers ? 'PASSED ✓' : 'NEEDS REVIEW ⚠'}`)

  // Cleanup option
  console.log(`\nTo clean up: DELETE FROM "Deliberation" WHERE id = '${deliberation.id}';`)

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
