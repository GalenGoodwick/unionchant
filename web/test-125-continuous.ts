/**
 * Test: 125-idea continuous flow FCFS deliberation with batch-aware cells
 *
 * Architecture:
 * - Tier 1: startVotingPhaseFCFS creates 25 cells (each with 5 unique ideas, no batch numbers)
 *   → Each cell resolves individually → 25 winners → seed cells created at tier 2 by tryAdvanceContinuousFlowTier
 * - Tier 2+: seed cells exist with batch numbers. Test creates 1 additional cell per batch
 *   for cross-cell XP tally. Both cells processed → batch tally → 1 winner per batch.
 * - Final tier: ≤5 ideas → 1 batch → cross-cell tally → 1 champion
 *
 * Run: DATABASE_URL=postgresql://galengoodwick@localhost:5432/uc_test npx tsx test-125-continuous.ts
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://galengoodwick@localhost:5432/uc_test'

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const CELL_SIZE = 5
const NUM_IDEAS = 125
const NUM_VOTERS = 50

async function cleanup(deliberationId: string) {
  await prisma.$executeRaw`DELETE FROM "Vote" WHERE "cellId" IN (SELECT id FROM "Cell" WHERE "deliberationId" = ${deliberationId})`
  await prisma.$executeRaw`DELETE FROM "CommentUpvote" WHERE "commentId" IN (SELECT id FROM "Comment" WHERE "cellId" IN (SELECT id FROM "Cell" WHERE "deliberationId" = ${deliberationId}))`
  await prisma.$executeRaw`DELETE FROM "Comment" WHERE "cellId" IN (SELECT id FROM "Cell" WHERE "deliberationId" = ${deliberationId})`
  await prisma.$executeRaw`DELETE FROM "CellParticipation" WHERE "cellId" IN (SELECT id FROM "Cell" WHERE "deliberationId" = ${deliberationId})`
  await prisma.$executeRaw`DELETE FROM "CellIdea" WHERE "cellId" IN (SELECT id FROM "Cell" WHERE "deliberationId" = ${deliberationId})`
  await prisma.$executeRaw`DELETE FROM "Prediction" WHERE "deliberationId" = ${deliberationId}`
  await prisma.$executeRaw`DELETE FROM "Cell" WHERE "deliberationId" = ${deliberationId}`
  await prisma.$executeRaw`DELETE FROM "Idea" WHERE "deliberationId" = ${deliberationId}`
  await prisma.$executeRaw`DELETE FROM "DeliberationMember" WHERE "deliberationId" = ${deliberationId}`
  await prisma.$executeRaw`DELETE FROM "Integration" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE 'test125_%@test.local')`
  await prisma.$executeRaw`DELETE FROM "Deliberation" WHERE id = ${deliberationId}`
}

/**
 * Fill a cell with voters, cast votes, mark participation
 * Returns the list of idea IDs in the cell for verification
 */
async function fillAndVoteCell(
  cellId: string,
  users: { id: string }[],
  voterOffset: number,
  cellIdeaIds: string[],
): Promise<void> {
  for (let v = 0; v < CELL_SIZE; v++) {
    const voter = users[(voterOffset + v) % users.length]

    await prisma.cellParticipation.create({
      data: { cellId, userId: voter.id, status: 'ACTIVE' },
    })

    // Vote: give most XP to first idea (deterministic winner per batch)
    const allocations: { ideaId: string; points: number }[] = []
    for (let i = 0; i < cellIdeaIds.length; i++) {
      if (i === 0) {
        allocations.push({ ideaId: cellIdeaIds[i], points: 10 - (cellIdeaIds.length - 1) })
      } else {
        allocations.push({ ideaId: cellIdeaIds[i], points: 1 })
      }
    }

    const now = new Date()
    for (const a of allocations) {
      const voteId = `vt${Date.now()}${Math.random().toString(36).slice(2, 10)}`
      await prisma.$executeRaw`
        INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
        VALUES (${voteId}, ${cellId}, ${voter.id}, ${a.ideaId}, ${a.points}, ${now})
      `
    }

    await prisma.cellParticipation.updateMany({
      where: { cellId, userId: voter.id },
      data: { status: 'VOTED', votedAt: now },
    })

    // Update idea vote counts
    for (const a of allocations) {
      const stats = await prisma.$queryRaw<{ cnt: bigint; xp: bigint }[]>`
        SELECT COUNT(DISTINCT "userId") as cnt, COALESCE(SUM("xpPoints"), 0) as xp
        FROM "Vote" WHERE "ideaId" = ${a.ideaId}
      `
      await prisma.$executeRaw`
        UPDATE "Idea" SET "totalVotes" = ${Number(stats[0].cnt)}, "totalXP" = ${Number(stats[0].xp)} WHERE id = ${a.ideaId}
      `
    }
  }
}

async function main() {
  console.log('=== 125-Idea Continuous Flow FCFS Test ===\n')

  // 1. Create test users
  console.log(`Creating ${NUM_VOTERS} test users...`)
  const users: { id: string }[] = []
  for (let i = 0; i < NUM_VOTERS; i++) {
    const user = await prisma.user.upsert({
      where: { email: `test125_${i}@test.local` },
      update: {},
      create: {
        email: `test125_${i}@test.local`,
        name: `test-agent-${i}`,
        emailVerified: new Date(),
        onboardedAt: new Date(),
        status: 'ACTIVE',
        isAI: true,
      },
      select: { id: true },
    })
    users.push(user)
  }
  console.log(`  ✓ ${users.length} users ready`)

  // 2. Create deliberation
  const deliberation = await prisma.deliberation.create({
    data: {
      question: 'Test: 125 ideas continuous flow FCFS',
      creatorId: users[0].id,
      phase: 'SUBMISSION',
      allocationMode: 'fcfs',
      continuousFlow: true,
      cellSize: CELL_SIZE,
      allowAI: true,
      isPublic: true,
    },
  })
  const delibId = deliberation.id
  console.log(`  ✓ Deliberation created: ${delibId}`)

  try {
    // 3. Create 125 ideas
    console.log(`\nSubmitting ${NUM_IDEAS} ideas...`)
    for (let i = 0; i < NUM_IDEAS; i++) {
      await prisma.idea.create({
        data: {
          text: `Idea ${i + 1}: ${['Widget', 'Protocol', 'SDK', 'API', 'Tool'][i % 5]} for ${['governance', 'voting', 'cells', 'tiers', 'batches'][Math.floor(i / 25)]}`,
          deliberationId: delibId,
          authorId: users[i % NUM_VOTERS].id,
          status: 'SUBMITTED',
        },
      })
    }
    console.log(`  ✓ ${NUM_IDEAS} ideas submitted`)

    // 4. Add all users as members
    for (const user of users) {
      await prisma.deliberationMember.upsert({
        where: { deliberationId_userId: { deliberationId: delibId, userId: user.id } },
        update: {},
        create: { deliberationId: delibId, userId: user.id, role: 'PARTICIPANT' },
      })
    }

    // 5. Start voting (creates tier 1 cells via startVotingPhaseFCFS)
    console.log('\nStarting voting phase...')
    const { startVotingPhase, processCellResults, checkTierCompletion } = await import('./src/lib/voting')
    const startResult = await startVotingPhase(delibId)
    console.log(`  ✓ ${JSON.stringify(startResult)}`)

    // ═══ TIER 1: Process cells created by startVotingPhaseFCFS ═══
    console.log('\n--- Tier 1 ---')
    const tier1Cells = await prisma.cell.findMany({
      where: { deliberationId: delibId, tier: 1 },
      include: { ideas: true },
      orderBy: { createdAt: 'asc' },
    })
    console.log(`  ${tier1Cells.length} cells created by startVotingPhaseFCFS`)

    let globalVoterIdx = 0
    for (let i = 0; i < tier1Cells.length; i++) {
      const cell = tier1Cells[i]
      const cellIdeaIds = cell.ideas.map(ci => ci.ideaId)

      await fillAndVoteCell(cell.id, users, globalVoterIdx, cellIdeaIds)
      globalVoterIdx += CELL_SIZE

      // Process cell — this triggers handleContinuousFlowCellComplete → tryAdvanceContinuousFlowTier
      await processCellResults(cell.id, false)

      if ((i + 1) % 5 === 0) {
        const advancing = await prisma.idea.count({ where: { deliberationId: delibId, status: 'ADVANCING' } })
        const inVoting2 = await prisma.idea.count({ where: { deliberationId: delibId, status: 'IN_VOTING', tier: 2 } })
        const t2Cells = await prisma.cell.count({ where: { deliberationId: delibId, tier: 2 } })
        console.log(`  After ${i + 1} cells: ${advancing} advancing, ${inVoting2} at T2, ${t2Cells} T2 cells`)
      }
    }

    // Verify tier 1 results
    const t1Advancing = await prisma.idea.count({ where: { deliberationId: delibId, status: 'ADVANCING' } })
    const t1Eliminated = await prisma.idea.count({ where: { deliberationId: delibId, status: 'ELIMINATED' } })
    const t1InVoting = await prisma.idea.count({ where: { deliberationId: delibId, status: 'IN_VOTING' } })
    console.log(`  Tier 1 complete: ${t1Advancing} advancing, ${t1Eliminated} eliminated, ${t1InVoting} in voting at T2`)

    const tier2SeedCells = await prisma.cell.findMany({
      where: { deliberationId: delibId, tier: 2 },
      include: { ideas: true },
      orderBy: { batch: 'asc' },
    })
    console.log(`  ${tier2SeedCells.length} seed cells created at tier 2`)

    // ═══ TIER 2+: Process seed cells + create additional cells for cross-cell tally ═══
    let maxTiers = 10
    while (maxTiers-- > 0) {
      const delib = await prisma.deliberation.findUnique({
        where: { id: delibId },
        select: { phase: true, currentTier: true, championId: true },
      })

      if (!delib || delib.phase === 'COMPLETED') {
        console.log(`\n🏆 DELIBERATION COMPLETE at tier ${delib?.currentTier}`)
        if (delib?.championId) {
          const champion = await prisma.idea.findUnique({
            where: { id: delib.championId },
            select: { text: true, totalXP: true },
          })
          console.log(`  Champion: "${champion?.text}" (${champion?.totalXP} XP)`)
        }
        break
      }

      const currentTier = delib.currentTier
      if (currentTier < 2) {
        console.log('  ERROR: still at tier 1 after processing all tier 1 cells')
        break
      }

      console.log(`\n--- Tier ${currentTier} ---`)

      // Get seed cells at this tier (created by tryAdvanceContinuousFlowTier)
      const seedCells = await prisma.cell.findMany({
        where: { deliberationId: delibId, tier: currentTier, status: 'VOTING' },
        include: { ideas: true, _count: { select: { participants: true } } },
        orderBy: { batch: 'asc' },
      })

      // Group by batch
      const batchMap = new Map<number, typeof seedCells>()
      for (const cell of seedCells) {
        const b = cell.batch ?? 0
        if (!batchMap.has(b)) batchMap.set(b, [])
        batchMap.get(b)!.push(cell)
      }

      console.log(`  ${seedCells.length} seed cells across ${batchMap.size} batches`)

      // For each batch: fill the seed cell + create 1 additional cell for cross-cell tally
      const allCellsToProcess: { id: string; batch: number }[] = []

      for (const [batchNum, batchSeedCells] of batchMap.entries()) {
        const seedCell = batchSeedCells[0]
        const cellIdeaIds = seedCell.ideas.map(ci => ci.ideaId)

        // Fill the seed cell with voters
        await fillAndVoteCell(seedCell.id, users, globalVoterIdx, cellIdeaIds)
        globalVoterIdx += CELL_SIZE
        allCellsToProcess.push({ id: seedCell.id, batch: batchNum })

        // Create 1 additional cell in the same batch (for cross-cell tally)
        const extraCell = await prisma.cell.create({
          data: {
            deliberationId: delibId,
            tier: currentTier,
            batch: batchNum,
            status: 'VOTING',
            ideas: { create: cellIdeaIds.map(id => ({ ideaId: id })) },
          },
        })

        await fillAndVoteCell(extraCell.id, users, globalVoterIdx, cellIdeaIds)
        globalVoterIdx += CELL_SIZE
        allCellsToProcess.push({ id: extraCell.id, batch: batchNum })
      }

      console.log(`  Processing ${allCellsToProcess.length} cells (${batchMap.size} batches × 2 cells)...`)

      // Process ALL cells — the batch completion check in processCellResults handles cross-cell tally
      for (const cellInfo of allCellsToProcess) {
        await processCellResults(cellInfo.id, false)
      }

      // Check results
      const advancing = await prisma.idea.count({ where: { deliberationId: delibId, status: 'ADVANCING' } })
      const inVoting = await prisma.idea.count({ where: { deliberationId: delibId, status: 'IN_VOTING' } })
      const eliminated = await prisma.idea.count({ where: { deliberationId: delibId, status: 'ELIMINATED' } })
      const winner = await prisma.idea.count({ where: { deliberationId: delibId, status: 'WINNER' } })
      console.log(`  Results: ${advancing} advancing, ${inVoting} in voting, ${eliminated} eliminated, ${winner} winner`)

      const updatedDelib = await prisma.deliberation.findUnique({
        where: { id: delibId },
        select: { currentTier: true, phase: true },
      })
      console.log(`  State: tier ${updatedDelib?.currentTier}, phase ${updatedDelib?.phase}`)

      if (updatedDelib?.phase === 'COMPLETED') {
        const champion = await prisma.idea.findFirst({
          where: { deliberationId: delibId, status: 'WINNER' },
          select: { text: true, totalXP: true },
        })
        console.log(`\n🏆 CHAMPION: "${champion?.text}" (${champion?.totalXP} XP)`)
        break
      }

      // If tier didn't advance (e.g., continuous flow needs manual checkTierCompletion),
      // try triggering it
      if (updatedDelib?.currentTier === currentTier) {
        console.log(`  Triggering checkTierCompletion for tier ${currentTier}...`)
        await checkTierCompletion(delibId, currentTier)

        const afterCheck = await prisma.deliberation.findUnique({
          where: { id: delibId },
          select: { currentTier: true, phase: true },
        })
        console.log(`  After check: tier ${afterCheck?.currentTier}, phase ${afterCheck?.phase}`)

        if (afterCheck?.phase === 'COMPLETED') {
          const champion = await prisma.idea.findFirst({
            where: { deliberationId: delibId, status: 'WINNER' },
            select: { text: true, totalXP: true },
          })
          console.log(`\n🏆 CHAMPION: "${champion?.text}" (${champion?.totalXP} XP)`)
          break
        }
      }
    }

    // Final summary
    console.log('\n=== Final Summary ===')
    const finalDelib = await prisma.deliberation.findUnique({
      where: { id: delibId },
      select: { phase: true, currentTier: true, championId: true },
    })
    const allCells = await prisma.cell.findMany({
      where: { deliberationId: delibId },
      select: { tier: true, batch: true, status: true },
    })
    const tierStats = new Map<number, { cells: number; batches: Set<number> }>()
    for (const cell of allCells) {
      if (!tierStats.has(cell.tier)) tierStats.set(cell.tier, { cells: 0, batches: new Set() })
      const s = tierStats.get(cell.tier)!
      s.cells++
      s.batches.add(cell.batch ?? 0)
    }
    for (const [tier, stats] of [...tierStats.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`  Tier ${tier}: ${stats.cells} cells, ${stats.batches.size} batches`)
    }
    console.log(`  Phase: ${finalDelib?.phase}`)
    console.log(`  Total tiers: ${finalDelib?.currentTier}`)

    const ideaStats = await prisma.idea.groupBy({
      by: ['status'],
      where: { deliberationId: delibId },
      _count: true,
    })
    for (const s of ideaStats) {
      console.log(`  ${s.status}: ${s._count}`)
    }

    // Verify expected results
    const passed = finalDelib?.phase === 'COMPLETED' && finalDelib?.championId !== null
    console.log(`\n${passed ? '✅ TEST PASSED' : '❌ TEST FAILED'}: ${passed ? 'Champion declared' : 'No champion'}`)

    // Cleanup
    console.log('\nCleaning up...')
    await cleanup(delibId)
    console.log('  ✓ Cleaned up')

    if (!passed) process.exit(1)

  } catch (err) {
    console.error('\n❌ ERROR:', err)
    console.log('\nCleaning up after error...')
    await cleanup(delibId).catch(() => {})
    throw err
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
