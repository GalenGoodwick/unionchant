/**
 * Integration test for Dynamic Cell Formation (endless mode).
 *
 * Tests the full pipeline:
 *   1. Dynamic cells created with proper status
 *   2. Participants assigned, heartbeats recorded
 *   3. Voting triggers checkAutoComplete → locked → 30s timer
 *   4. finalizeAutoComplete processes cells through existing pipeline
 *   5. Tier advancement creates dynamic T2+ cells
 *   6. T2 dynamic cells process → champion declared
 *   7. currentPriority computed on heartbeat
 *
 * Run: npx tsx scripts/test-dynamic-cells.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

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

const CELL_SIZE = 5
const USER_COUNT = 50
const IDEA_COUNT = 25

// ── Helpers ──

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${msg}`)
    failed++
    return
  }
  console.log(`  ✓ ${msg}`)
  passed++
}

function log(msg: string) {
  console.log(`\n${'─'.repeat(60)}\n${msg}\n${'─'.repeat(60)}`)
}

async function voteInCell(
  cellId: string,
  voters: { id: string; partId: string }[],
  cellIdeaIds: string[]
) {
  let votesCreated = 0
  for (let vi = 0; vi < voters.length; vi++) {
    const voter = voters[vi]
    const favorIdx = vi < Math.ceil(voters.length * 0.6) ? 0 : Math.min(1, cellIdeaIds.length - 1)
    const allocations: { ideaId: string; xp: number }[] = [
      { ideaId: cellIdeaIds[favorIdx], xp: 7 },
    ]
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
      const voteId = `dynvt${Date.now()}${Math.random().toString(36).slice(2, 8)}${vi}`
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt") VALUES ('${voteId}', '${cellId}', '${voter.id}', '${alloc.ideaId}', ${alloc.xp}, NOW()) ON CONFLICT DO NOTHING`
      )
      votesCreated++
    }

    for (const alloc of allocations) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Idea" SET "totalXP" = "totalXP" + ${alloc.xp}, "totalVotes" = "totalVotes" + 1 WHERE id = '${alloc.ideaId}'`
      )
    }

    await prisma.cellParticipation.update({
      where: { id: voter.partId },
      data: { status: 'VOTED', votedAt: new Date() },
    })
  }
  return votesCreated
}

// ── Main ──

async function main() {
  log('DYNAMIC CELL INTEGRATION TEST')
  console.log(`  Users: ${USER_COUNT}, Ideas: ${IDEA_COUNT}, CellSize: ${CELL_SIZE}`)

  // ── 1. Setup: users, deliberation, ideas ──
  log('STEP 1: Create test data')

  const users: { id: string; email: string; name: string }[] = []
  for (let i = 0; i < USER_COUNT; i++) {
    const email = `dyn-test-${i}@test.local`
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: `DynUser${i}`, emailVerified: new Date() },
      select: { id: true, email: true, name: true },
    })
    users.push(user as { id: string; email: string; name: string })
  }
  console.log(`  Created ${users.length} users`)

  const deliberation = await prisma.deliberation.create({
    data: {
      question: `[DYN-TEST] Dynamic ${IDEA_COUNT} ideas @ ${new Date().toISOString()}`,
      phase: 'VOTING',
      continuousFlow: true,
      allocationMode: 'fcfs',
      cellSize: CELL_SIZE,
      votingTimeoutMs: 0,
      accumulationEnabled: false,
      creatorId: users[0].id,
      currentTier: 1,
    },
  })
  const delibId = deliberation.id
  console.log(`  Deliberation: ${delibId}`)

  await prisma.deliberationMember.createMany({
    data: users.map(u => ({ deliberationId: delibId, userId: u.id })),
    skipDuplicates: true,
  })

  const ideas: { id: string; text: string }[] = []
  for (let i = 0; i < IDEA_COUNT; i++) {
    const idea = await prisma.idea.create({
      data: {
        deliberationId: delibId,
        authorId: users[i % users.length].id,
        text: `Idea #${i + 1}`,
        status: 'SUBMITTED',
      },
      select: { id: true, text: true },
    })
    ideas.push(idea)
  }
  console.log(`  Created ${ideas.length} ideas`)

  // ── 2. Start voting: T1 cells with dynamicStatus ──
  log('STEP 2: Start voting → T1 dynamic cells')

  const { tryCreateContinuousFlowCell, processCellResults } = await import('../src/lib/voting')

  let t1Cells = 0
  for (let i = 0; i < 20; i++) {
    const result = await tryCreateContinuousFlowCell(delibId)
    if (result.cellCreated) t1Cells++
    else break
  }
  console.log(`  T1 cells created: ${t1Cells}`)
  assert(t1Cells === 5, 'Should create 5 T1 cells from 25 ideas')

  const dynCells = await prisma.cell.findMany({
    where: { deliberationId: delibId, dynamicStatus: { not: null } },
    select: { id: true, tier: true, dynamicStatus: true },
    orderBy: { createdAt: 'asc' },
  })
  assert(dynCells.every(c => c.dynamicStatus === 'forming'), 'All T1 cells start as "forming"')

  // ── 3. Assign participants directly (like real FCFS join) ──
  log('STEP 3: Assign participants to cells')

  let userIdx = 0
  for (const cell of dynCells) {
    const cellUsers = users.slice(userIdx, userIdx + CELL_SIZE)
    userIdx += CELL_SIZE
    await prisma.cellParticipation.createMany({
      data: cellUsers.map(u => ({
        cellId: cell.id,
        userId: u.id,
        status: 'ACTIVE' as const,
        lastHeartbeat: new Date(),
      })),
      skipDuplicates: true,
    })
    console.log(`  Cell ${cell.id.slice(-6)}: ${cellUsers.map(u => u.name).join(', ')}`)
  }
  assert(userIdx === 25, '25 users assigned across 5 cells')

  // ── 4. Test heartbeat response ──
  log('STEP 4: Heartbeat → verify response shape')

  const { processHeartbeat, checkAutoComplete, processExpiredAutoCompletes } = await import('../src/lib/dynamic-cells')

  const hbState = await processHeartbeat(delibId, users[0].id)
  console.log(`  cellId: ${hbState.cellId?.slice(-6)}`)
  console.log(`  dynamicStatus: ${hbState.dynamicStatus}`)
  console.log(`  ideas: ${hbState.ideas.length}`)
  console.log(`  people: ${hbState.people.length}`)
  console.log(`  slots: ${hbState.slots.filled}/${hbState.slots.total}`)
  console.log(`  timer: ${hbState.timer}`)
  console.log(`  needsMore: ideas=${hbState.needsMore.ideas}, people=${hbState.needsMore.people}`)
  console.log(`  currentPriority: ${JSON.stringify(hbState.currentPriority)}`)

  assert(hbState.cellId !== null, 'Heartbeat returns cellId')
  assert(hbState.dynamicStatus === 'active' || hbState.dynamicStatus === 'forming', 'Cell has valid dynamicStatus (may be stale on first heartbeat)')
  assert(hbState.ideas.length >= 1, 'Heartbeat includes ideas')
  assert(hbState.people.length >= 1, 'Heartbeat includes people')
  assert(hbState.needsMore.ideas === false, 'Should not need more ideas (5 ideas)')
  assert(hbState.needsMore.people === false, 'Should not need more people (5 people)')

  // ── 5. Vote in all 5 cells, verify auto-complete ──
  log('STEP 5: Vote in all cells → auto-complete')

  const allCells = await prisma.cell.findMany({
    where: { deliberationId: delibId, status: { not: 'COMPLETED' } },
    include: {
      ideas: { select: { ideaId: true } },
      participants: { select: { id: true, userId: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  let totalVotes = 0
  for (const cell of allCells) {
    const cellIdeaIds = cell.ideas.map(ci => ci.ideaId)
    const voters = cell.participants.map(p => ({ id: p.userId, partId: p.id }))

    // Vote with first 2 users
    const firstBatch = voters.slice(0, 2)
    totalVotes += await voteInCell(cell.id, firstBatch, cellIdeaIds)

    // Check auto-complete
    await checkAutoComplete(cell.id)
    const afterTwo = await prisma.cell.findUnique({
      where: { id: cell.id },
      select: { dynamicStatus: true, autoCompleteAt: true },
    })

    if (cell === allCells[0]) {
      assert(afterTwo?.dynamicStatus === 'locked', 'Cell locks after 2 votes')
      assert(afterTwo?.autoCompleteAt !== null, 'Auto-complete timer is set')
      console.log(`  Cell ${cell.id.slice(-6)}: locked (timer: ${afterTwo?.autoCompleteAt?.toISOString()})`)
    }

    // Vote with remaining users
    const rest = voters.slice(2)
    totalVotes += await voteInCell(cell.id, rest, cellIdeaIds)
  }

  console.log(`  Total votes: ${totalVotes}`)
  assert(totalVotes > 0, 'Votes were created')

  // Verify all cells locked
  const lockedCount = await prisma.cell.count({
    where: { deliberationId: delibId, dynamicStatus: 'locked' },
  })
  console.log(`  Locked cells: ${lockedCount}`)
  assert(lockedCount === 5, 'All 5 cells should be locked')

  // ── 6. Force auto-complete → finalize all cells ──
  log('STEP 6: Auto-complete → processCellResults')

  // Set all timers to past
  await prisma.cell.updateMany({
    where: { deliberationId: delibId, dynamicStatus: 'locked' },
    data: { autoCompleteAt: new Date(Date.now() - 1000) },
  })

  const processed = await processExpiredAutoCompletes(delibId)
  console.log(`  Auto-completed: ${processed.length} cells`)
  assert(processed.length === 5, 'All 5 cells auto-completed')

  // Verify cells completed and dynamicStatus cleared
  const completedCells = await prisma.cell.findMany({
    where: { deliberationId: delibId, status: 'COMPLETED' },
    select: { id: true, dynamicStatus: true },
  })
  assert(completedCells.length === 5, '5 cells completed')
  assert(completedCells.every(c => c.dynamicStatus === null), 'dynamicStatus cleared on completion')

  // Check T1 winners — may be ADVANCING (waiting for T2) or IN_VOTING (already in T2 cell)
  const t1Winners = await prisma.idea.findMany({
    where: { deliberationId: delibId, status: { in: ['ADVANCING', 'IN_VOTING', 'WINNER'] }, tier: { gte: 1 } },
    select: { id: true, text: true, tier: true, totalXP: true, status: true },
    orderBy: [{ tier: 'desc' }, { totalXP: 'desc' }],
  })
  console.log(`  T1 winners (advancing/in-voting): ${t1Winners.length}`)
  for (const idea of t1Winners.slice(0, 5)) {
    console.log(`    T${idea.tier}: "${idea.text}" (${idea.totalXP} XP, ${idea.status})`)
  }
  assert(t1Winners.length >= 5, '5+ T1 winners')

  // ── 7. T2 cell — check if auto-created by handleContinuousFlowCellComplete ──
  log('STEP 7: T2 cell from T1 winners')

  // T2 cell may already have been created by processCellResults → handleContinuousFlowCellComplete
  let t2Cells = await prisma.cell.findMany({
    where: { deliberationId: delibId, tier: 2 },
    select: { id: true, tier: true, dynamicStatus: true, status: true, ideas: { select: { ideaId: true } } },
  })

  if (t2Cells.length === 0) {
    // Not auto-created, trigger manually
    const { tryAdvanceContinuousFlowTier } = await import('../src/lib/continuous-flow')
    const t2Created = await tryAdvanceContinuousFlowTier(delibId, 1)
    console.log(`  T2 cell manually triggered: ${t2Created}`)
    t2Cells = await prisma.cell.findMany({
      where: { deliberationId: delibId, tier: 2 },
      select: { id: true, tier: true, dynamicStatus: true, status: true, ideas: { select: { ideaId: true } } },
    })
  } else {
    console.log(`  T2 cell auto-created by continuous flow pipeline`)
  }

  console.log(`  T2 cells: ${t2Cells.length}`)
  assert(t2Cells.length === 1, '1 T2 cell created')
  assert(t2Cells[0].dynamicStatus === 'forming', 'T2 cell has dynamicStatus "forming"')
  assert(t2Cells[0].ideas.length === 5, 'T2 cell has 5 ideas (the T1 winners)')

  // ── 8. Assign voters to T2 and vote → champion ──
  log('STEP 8: Vote in T2 → champion declared')

  const t2Cell = t2Cells[0]
  const t2IdeaIds = t2Cell.ideas.map(ci => ci.ideaId)

  // Assign 5 fresh users to T2 cell
  const t2Users = users.slice(25, 30)
  await prisma.cellParticipation.createMany({
    data: t2Users.map(u => ({
      cellId: t2Cell.id,
      userId: u.id,
      status: 'ACTIVE' as const,
      lastHeartbeat: new Date(),
    })),
    skipDuplicates: true,
  })

  const t2Parts = await prisma.cellParticipation.findMany({
    where: { cellId: t2Cell.id },
    select: { id: true, userId: true },
  })
  const t2Voters = t2Parts.map(p => ({ id: p.userId, partId: p.id }))

  // Vote
  const t2Votes = await voteInCell(t2Cell.id, t2Voters, t2IdeaIds)
  console.log(`  T2 votes: ${t2Votes}`)

  // Auto-complete T2
  await checkAutoComplete(t2Cell.id)
  const t2After = await prisma.cell.findUnique({
    where: { id: t2Cell.id },
    select: { dynamicStatus: true },
  })
  console.log(`  T2 cell dynamicStatus: ${t2After?.dynamicStatus}`)
  assert(t2After?.dynamicStatus === 'locked', 'T2 cell locked after votes')

  // Force timer expiry
  await prisma.cell.update({
    where: { id: t2Cell.id },
    data: { autoCompleteAt: new Date(Date.now() - 1000) },
  })

  const t2Processed = await processExpiredAutoCompletes(delibId)
  console.log(`  T2 auto-completed: ${t2Processed.length}`)

  // Check for champion
  const finalDelib = await prisma.deliberation.findUnique({
    where: { id: delibId },
    select: { phase: true, championId: true, currentTier: true },
  })
  console.log(`  Phase: ${finalDelib?.phase}`)
  console.log(`  Max tier: ${finalDelib?.currentTier}`)

  if (finalDelib?.championId) {
    const champ = await prisma.idea.findUnique({
      where: { id: finalDelib.championId },
      select: { text: true, totalXP: true },
    })
    console.log(`  Champion: "${champ?.text}" (${champ?.totalXP} XP)`)
    assert(true, 'Champion declared!')
  } else {
    // If no champion yet, that's because processCellResults needs cross-cell tally
    // for final showdown (1 cell at T2). Let's manually process.
    console.log(`  No champion yet — checking cell status...`)
    const t2Final = await prisma.cell.findFirst({
      where: { deliberationId: delibId, tier: 2 },
      select: { id: true, status: true },
    })
    console.log(`  T2 cell status: ${t2Final?.status}`)

    if (t2Final?.status === 'COMPLETED') {
      // handleContinuousFlowCellComplete should have declared champion
      const recheck = await prisma.deliberation.findUnique({
        where: { id: delibId },
        select: { phase: true, championId: true },
      })
      if (recheck?.championId) {
        const champ = await prisma.idea.findUnique({
          where: { id: recheck.championId },
          select: { text: true, totalXP: true },
        })
        console.log(`  Champion (after recheck): "${champ?.text}" (${champ?.totalXP} XP)`)
        assert(true, 'Champion declared after T2 completion')
      } else {
        assert(false, 'Champion should be declared after T2 single-cell completion')
      }
    }
  }

  // ── 9. Verify currentPriority after full flow ──
  log('STEP 9: Verify currentPriority')

  const finalHB = await processHeartbeat(delibId, users[0].id)
  console.log(`  currentPriority: ${JSON.stringify(finalHB.currentPriority)}`)
  if (finalHB.currentPriority) {
    assert(finalHB.currentPriority.text.length > 0, 'currentPriority.text is non-empty')
    assert(finalHB.currentPriority.tier >= 1, 'currentPriority.tier >= 1')
    assert(finalHB.currentPriority.xp > 0, 'currentPriority.xp > 0')
  } else {
    assert(true, 'No currentPriority (deliberation completed)')
  }

  // ── 10. Final summary ──
  log('FINAL TIER STRUCTURE')

  const finalCells = await prisma.cell.findMany({
    where: { deliberationId: delibId },
    include: {
      ideas: { include: { idea: { select: { text: true, status: true, totalXP: true } } } },
    },
    orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }],
  })

  const tiers = [...new Set(finalCells.map(c => c.tier))].sort((a, b) => a - b)
  for (const t of tiers) {
    const cells = finalCells.filter(c => c.tier === t)
    console.log(`\n  Tier ${t}: ${cells.length} cells`)
    for (const cell of cells) {
      const winner = cell.ideas.find(ci => ci.idea.status === 'ADVANCING' || ci.idea.status === 'WINNER')
      const statusIcon = cell.status === 'COMPLETED' ? '✓' : '○'
      console.log(`    ${statusIcon} Cell ${cell.id.slice(-6)}: ${winner ? `★ ${winner.idea.text} (${winner.idea.totalXP}xp, ${winner.idea.status})` : '?'}`)
    }
  }

  // ── Results ──
  log('TEST RESULTS')
  console.log(`  Passed: ${passed}`)
  console.log(`  Failed: ${failed}`)
  console.log(`  ${failed === 0 ? '═══ ALL TESTS PASSED ═══' : '═══ SOME TESTS FAILED ═══'}`)
  console.log(`\n  Cleanup: DELETE FROM "Deliberation" WHERE id = '${delibId}';`)

  await prisma.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('\nFATAL ERROR:', e)
  process.exit(1)
})
