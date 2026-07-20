/**
 * 1000-agent synthetic stress test — NORMAL chant (tiered voting to consensus).
 *
 * Creates 1000 synthetic users + ideas, drives the real voting engine
 * (startVotingPhase → processCellResults → checkTierCompletion) with
 * simulated majority votes, and measures throughput to a single champion.
 *
 * No LLM calls. No cost. Every row is tagged with a run-scoped prefix and
 * torn down in a finally block so nothing is left behind in the DB.
 *
 * Usage:
 *   npx tsx scripts/stress-1k.ts                 # local/dev DB (whatever .env.local points at)
 *   npx tsx scripts/stress-1k.ts --prod          # run against production (dawn-base)
 *   npx tsx scripts/stress-1k.ts --users 1000 --ideas 1000
 *   npx tsx scripts/stress-1k.ts --keep          # skip cleanup (leaves test data)
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

const FLAGS = {
  prod: process.argv.includes('--prod'),
  keep: process.argv.includes('--keep'),
}
function numArg(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : dflt
}
const USERS = numArg('users', 1000)
const IDEAS = numArg('ideas', 1000)

// Load env BEFORE importing anything that constructs the prisma client.
// NOTE: .env.local and .env.prod both point at the prod dawn-base DB; .env.local
// uses the clean pooler endpoint, .env.prod has a malformed trailing newline.
dotenv.config({ path: path.join(__dirname, '..', FLAGS.prod ? '.env.prod' : '.env.local') })
// Sanitize: strip surrounding quotes / whitespace / literal or real trailing newlines
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\n$/, '')
    .replace(/\s+$/, '')
    .trim()
}

async function main() {
  const dbHost = (process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1] ?? 'unknown'
  console.log(`\n=== 1K STRESS TEST — NORMAL CHANT ===`)
  console.log(`  Target DB : ${dbHost}${FLAGS.prod ? '  ⚠ PRODUCTION' : ''}`)
  console.log(`  Users     : ${USERS}`)
  console.log(`  Ideas     : ${IDEAS}`)
  console.log(`  Cleanup   : ${FLAGS.keep ? 'NO (--keep)' : 'yes (finally block)'}`)

  // Dynamic imports so DATABASE_URL is already set.
  const { prisma } = await import('@/lib/prisma')
  const { startVotingPhase, processCellResults } = await import('@/lib/voting')

  const RUN = `stress1k-${Date.now()}`
  const createdUserIds: string[] = []
  const createdDelibIds: string[] = []

  const t0 = Date.now()
  try {
    // ── 1. Create users ──
    console.log(`\n[${RUN}] creating ${USERS} users...`)
    const uStart = Date.now()
    for (let i = 0; i < USERS; i++) {
      const u = await prisma.user.create({
        data: { email: `${RUN}-${i}@stress.local`, name: `${RUN}-${i}` },
      })
      createdUserIds.push(u.id)
      if ((i + 1) % 200 === 0) console.log(`  users: ${i + 1}/${USERS}`)
    }
    console.log(`  users done in ${((Date.now() - uStart) / 1000).toFixed(1)}s`)

    // ── 2. Create deliberation + members + ideas (NORMAL chant, no accumulation) ──
    console.log(`\n[${RUN}] creating deliberation + ${IDEAS} ideas...`)
    const dStart = Date.now()
    const creatorId = createdUserIds[0]
    const deliberation = await prisma.deliberation.create({
      data: {
        question: `[${RUN}] 1000-agent normal-chant stress test`,
        creatorId,
        phase: 'SUBMISSION',
        accumulationEnabled: false,
      },
    })
    createdDelibIds.push(deliberation.id)

    await prisma.deliberationMember.create({
      data: { deliberationId: deliberation.id, userId: creatorId, role: 'CREATOR' },
    })
    // batch the participant members
    for (let i = 1; i < createdUserIds.length; i += 500) {
      await prisma.deliberationMember.createMany({
        data: createdUserIds.slice(i, i + 500).map(userId => ({
          deliberationId: deliberation.id,
          userId,
          role: 'PARTICIPANT' as const,
        })),
      })
    }
    // ideas — one per participant is the natural "normal chant" shape
    for (let i = 0; i < IDEAS; i += 500) {
      await prisma.idea.createMany({
        data: Array.from({ length: Math.min(500, IDEAS - i) }, (_, k) => ({
          deliberationId: deliberation.id,
          authorId: createdUserIds[(i + k) % createdUserIds.length],
          text: `[${RUN}] idea ${i + k}`,
          status: 'SUBMITTED' as const,
        })),
      })
    }
    console.log(`  deliberation ready in ${((Date.now() - dStart) / 1000).toFixed(1)}s`)

    // ── 3. Start voting ──
    console.log(`\n[${RUN}] startVotingPhase...`)
    const vStart = Date.now()
    await startVotingPhase(deliberation.id)

    const tier1 = await prisma.cell.count({ where: { deliberationId: deliberation.id, tier: 1 } })
    console.log(`  tier 1 cells: ${tier1}`)

    // ── 4. Drive tiers to a champion ──
    let tier = 1
    const maxTiers = 20
    const tierStats: { tier: number; cells: number; ms: number }[] = []
    while (tier <= maxTiers) {
      const cells = await prisma.cell.findMany({
        where: { deliberationId: deliberation.id, tier },
        include: { ideas: true, participants: true },
        orderBy: { createdAt: 'asc' },
      })
      if (cells.length === 0) break

      const tStart = Date.now()
      let voted = 0
      for (const cell of cells) {
        if (cell.status === 'COMPLETED') continue
        const majorityIdeaId = cell.ideas[0]?.ideaId
        if (!majorityIdeaId) continue
        const otherIds = cell.ideas.map(ci => ci.ideaId).filter(id => id !== majorityIdeaId)
        const parts = cell.participants
        const majorityCount = Math.ceil(parts.length * 0.6)
        // ~60% to the majority idea, rest spread across the others
        await prisma.vote.createMany({
          data: parts.map((p, i) => ({
            cellId: cell.id,
            userId: p.userId,
            ideaId: i < majorityCount
              ? majorityIdeaId
              : otherIds[(i - majorityCount) % otherIds.length] || majorityIdeaId,
          })),
        })
        await processCellResults(cell.id)
        voted++
      }
      const ms = Date.now() - tStart
      tierStats.push({ tier, cells: voted, ms })
      console.log(`  tier ${tier}: ${voted} cells voted+processed in ${(ms / 1000).toFixed(1)}s`)

      const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
      if (d?.phase === 'COMPLETED' || d?.phase === 'ACCUMULATING') break
      tier++
    }
    const voteMs = Date.now() - vStart

    // ── 5. Report ──
    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    const totalVotes = await prisma.vote.count({
      where: { cell: { deliberationId: deliberation.id } },
    })
    const totalCells = await prisma.cell.count({ where: { deliberationId: deliberation.id } })
    let championText: string | null = null
    if (d?.championId) {
      const champ = await prisma.idea.findUnique({ where: { id: d.championId } })
      championText = champ?.text ?? null
    }

    console.log(`\n=== RESULT ===`)
    console.log(`  final phase   : ${d?.phase}`)
    console.log(`  champion      : ${d?.championId ? `${d.championId} (${championText})` : 'NONE'}`)
    console.log(`  tiers         : ${tierStats.length}`)
    console.log(`  total cells   : ${totalCells}`)
    console.log(`  total votes   : ${totalVotes}`)
    console.log(`  voting time   : ${(voteMs / 1000).toFixed(1)}s`)
    console.log(`  votes/sec     : ${(totalVotes / (voteMs / 1000)).toFixed(0)}`)
    console.log(`  total elapsed : ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    console.log(`  per-tier:`)
    for (const s of tierStats) console.log(`    tier ${s.tier}: ${s.cells} cells, ${(s.ms / 1000).toFixed(1)}s`)

    if (d?.phase !== 'COMPLETED') console.log(`\n  ⚠ did NOT reach COMPLETED — engine stalled or hit maxTiers`)
    if (!d?.championId) console.log(`  ⚠ NO champion declared`)
  } catch (e) {
    console.error(`\n❌ stress run errored (cleanup still runs):`, e)
  } finally {
    if (FLAGS.keep) {
      console.log(`\n[${RUN}] --keep set, leaving test data in DB`)
    } else {
      console.log(`\n[${RUN}] cleaning up...`)
      await teardown(createdDelibIds, createdUserIds)
      console.log(`  cleanup done`)
    }
    process.exit(0)
  }
}

async function teardown(deliberationIds: string[], userIds: string[]) {
  const { prisma } = await import('@/lib/prisma')
  if (deliberationIds.length > 0) {
    await prisma.prediction.deleteMany({ where: { deliberationId: { in: deliberationIds } } }).catch(() => {})
    const cells = await prisma.cell.findMany({ where: { deliberationId: { in: deliberationIds } }, select: { id: true } })
    const cellIds = cells.map(c => c.id)
    if (cellIds.length > 0) {
      await prisma.cellDialogue.deleteMany({ where: { cellId: { in: cellIds } } }).catch(() => {})
      await prisma.cellOutcome.deleteMany({ where: { cellId: { in: cellIds } } }).catch(() => {})
      await prisma.vote.deleteMany({ where: { cellId: { in: cellIds } } })
      await prisma.comment.updateMany({ where: { cellId: { in: cellIds } }, data: { replyToId: null } }).catch(() => {})
      await prisma.comment.deleteMany({ where: { cellId: { in: cellIds } } }).catch(() => {})
      await prisma.cellIdea.deleteMany({ where: { cellId: { in: cellIds } } })
      await prisma.cellParticipation.deleteMany({ where: { cellId: { in: cellIds } } })
      await prisma.cell.deleteMany({ where: { id: { in: cellIds } } })
    }
    const ideas = await prisma.idea.findMany({ where: { deliberationId: { in: deliberationIds } }, select: { id: true } })
    const ideaIds = ideas.map(i => i.id)
    if (ideaIds.length > 0) {
      const revs = await prisma.ideaRevision.findMany({ where: { ideaId: { in: ideaIds } }, select: { id: true } })
      const revIds = revs.map(r => r.id)
      if (revIds.length > 0) {
        await prisma.ideaRevisionVote.deleteMany({ where: { revisionId: { in: revIds } } }).catch(() => {})
        await prisma.ideaRevision.deleteMany({ where: { id: { in: revIds } } }).catch(() => {})
      }
    }
    await prisma.idea.deleteMany({ where: { deliberationId: { in: deliberationIds } } })
    await prisma.deliberationMember.deleteMany({ where: { deliberationId: { in: deliberationIds } } })
    await prisma.deliberation.deleteMany({ where: { id: { in: deliberationIds } } })
  }
  if (userIds.length > 0) {
    // chunk deletes to avoid oversized IN clauses
    for (let i = 0; i < userIds.length; i += 500) {
      await prisma.user.deleteMany({ where: { id: { in: userIds.slice(i, i + 500) } } })
    }
  }
}

main().catch(async (e) => {
  console.error('\n❌ stress test errored:', e)
  process.exit(1)
})
