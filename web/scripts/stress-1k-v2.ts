/**
 * 1000-agent synthetic stress test v2 — NORMAL chant, HARDENED to reach a champion.
 *
 * Fixes over v1:
 *  - Bigger DB pool + longer connect timeout (via PG_POOL_MAX / PG_CONNECT_TIMEOUT_MS)
 *  - retry() wrapper on every DB op → transient Neon connect blips no longer kill the run
 *  - Bounded-concurrency cell processing within each tier (CONCURRENCY) → ~Nx faster,
 *    with a hard barrier between tiers so tier N+1 only starts after tier N fully resolves.
 *
 * Cells-per-tier is constant (~N/5) because every participant re-cells each tier, so
 * concurrency is the only lever on wall-clock. Tier advancement is atomically claimed
 * inside processCellResults, so running distinct cells concurrently is safe.
 *
 * Usage:
 *   npx tsx scripts/stress-1k-v2.ts                    # prod (.env.local = dawn-base pooler)
 *   npx tsx scripts/stress-1k-v2.ts --users 1000 --ideas 1000 --concurrency 10
 *   npx tsx scripts/stress-1k-v2.ts --keep
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

const FLAGS = { prod: process.argv.includes('--prod'), keep: process.argv.includes('--keep') }
function numArg(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : dflt
}
const USERS = numArg('users', 1000)
const IDEAS = numArg('ideas', 1000)
const CONCURRENCY = numArg('concurrency', 10)

dotenv.config({ path: path.join(__dirname, '..', FLAGS.prod ? '.env.prod' : '.env.local') })
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.trim().replace(/^["']|["']$/g, '').replace(/\\n$/, '').replace(/\s+$/, '').trim()
}
// Hardened pool for sustained load (read by src/lib/prisma.ts)
process.env.PG_POOL_MAX = String(numArg('pool', 30))
process.env.PG_CONNECT_TIMEOUT_MS = String(numArg('connectTimeout', 30000))

// ── transient-error retry ──
const TRANSIENT = /timeout exceeded when trying to connect|ECONNRESET|ETIMEDOUT|Connection terminated|Can't reach database|P1001|P1017|socket hang up/i
async function retry<T>(label: string, fn: () => Promise<T>, tries = 6): Promise<T> {
  let lastErr: unknown
  for (let a = 1; a <= tries; a++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const msg = (e as Error)?.message || String(e)
      if (!TRANSIENT.test(msg) || a === tries) throw e
      const backoff = Math.min(1000 * a, 5000)
      console.log(`  ↻ retry ${a}/${tries} on ${label}: ${msg.slice(0, 60)} — waiting ${backoff}ms`)
      await new Promise(r => setTimeout(r, backoff))
    }
  }
  throw lastErr
}

// ── bounded-concurrency map ──
async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return out
}

async function main() {
  const dbHost = (process.env.DATABASE_URL || '').match(/@([^/]+)/)?.[1] ?? 'unknown'
  console.log(`\n=== 1K STRESS TEST v2 — NORMAL CHANT (hardened) ===`)
  console.log(`  DB          : ${dbHost}  ⚠ PRODUCTION`)
  console.log(`  Users/Ideas : ${USERS} / ${IDEAS}`)
  console.log(`  Concurrency : ${CONCURRENCY}   Pool: ${process.env.PG_POOL_MAX}   ConnectTimeout: ${process.env.PG_CONNECT_TIMEOUT_MS}ms`)
  console.log(`  Cleanup     : ${FLAGS.keep ? 'NO (--keep)' : 'yes'}`)

  const { prisma } = await import('@/lib/prisma')
  const { startVotingPhase, processCellResults } = await import('@/lib/voting')

  const RUN = `stress1k-${Date.now()}`
  const createdUserIds: string[] = []
  const createdDelibIds: string[] = []
  const t0 = Date.now()

  try {
    // ── 1. Users (concurrent, retried) ──
    console.log(`\n[${RUN}] creating ${USERS} users...`)
    const uStart = Date.now()
    const idx = Array.from({ length: USERS }, (_, i) => i)
    const users = await mapPool(idx, CONCURRENCY, i =>
      retry(`user ${i}`, () => prisma.user.create({ data: { email: `${RUN}-${i}@stress.local`, name: `${RUN}-${i}` } }))
    )
    users.forEach(u => createdUserIds.push(u.id))
    console.log(`  users done in ${((Date.now() - uStart) / 1000).toFixed(1)}s`)

    // ── 2. Deliberation + members + ideas ──
    console.log(`\n[${RUN}] creating deliberation + ${IDEAS} ideas...`)
    const dStart = Date.now()
    const creatorId = createdUserIds[0]
    const deliberation = await retry('create delib', () => prisma.deliberation.create({
      data: { question: `[${RUN}] 1000-agent normal-chant stress test`, creatorId, phase: 'SUBMISSION', accumulationEnabled: false },
    }))
    createdDelibIds.push(deliberation.id)
    await retry('creator member', () => prisma.deliberationMember.create({ data: { deliberationId: deliberation.id, userId: creatorId, role: 'CREATOR' } }))
    for (let i = 1; i < createdUserIds.length; i += 500) {
      const chunk = createdUserIds.slice(i, i + 500)
      await retry(`members ${i}`, () => prisma.deliberationMember.createMany({
        data: chunk.map(userId => ({ deliberationId: deliberation.id, userId, role: 'PARTICIPANT' as const })),
      }))
    }
    for (let i = 0; i < IDEAS; i += 500) {
      const n = Math.min(500, IDEAS - i)
      await retry(`ideas ${i}`, () => prisma.idea.createMany({
        data: Array.from({ length: n }, (_, k) => ({
          deliberationId: deliberation.id, authorId: createdUserIds[(i + k) % createdUserIds.length],
          text: `[${RUN}] idea ${i + k}`, status: 'SUBMITTED' as const,
        })),
      }))
    }
    console.log(`  deliberation ready in ${((Date.now() - dStart) / 1000).toFixed(1)}s`)

    // ── 3. Start voting ──
    console.log(`\n[${RUN}] startVotingPhase...`)
    const vStart = Date.now()
    await retry('startVotingPhase', () => startVotingPhase(deliberation.id))

    // ── 4. Drive tiers to a champion (concurrent within tier, barrier between) ──
    let tier = 1
    const maxTiers = 25
    const tierStats: { tier: number; cells: number; ms: number }[] = []
    while (tier <= maxTiers) {
      const cells = await retry(`fetch tier ${tier}`, () => prisma.cell.findMany({
        where: { deliberationId: deliberation.id, tier },
        include: { ideas: true, participants: true },
        orderBy: { createdAt: 'asc' },
      }))
      if (cells.length === 0) break

      const tStart = Date.now()
      const pending = cells.filter(c => c.status !== 'COMPLETED')
      await mapPool(pending, CONCURRENCY, async (cell) => {
        const majorityIdeaId = cell.ideas[0]?.ideaId
        if (!majorityIdeaId) return
        const otherIds = cell.ideas.map(ci => ci.ideaId).filter(id => id !== majorityIdeaId)
        const parts = cell.participants
        const majorityCount = Math.ceil(parts.length * 0.6)
        await retry(`votes cell ${cell.id}`, () => prisma.vote.createMany({
          data: parts.map((p, i) => ({
            cellId: cell.id, userId: p.userId,
            ideaId: i < majorityCount ? majorityIdeaId : otherIds[(i - majorityCount) % otherIds.length] || majorityIdeaId,
          })),
        }))
        await retry(`process cell ${cell.id}`, () => processCellResults(cell.id))
      })
      const ms = Date.now() - tStart
      tierStats.push({ tier, cells: pending.length, ms })
      console.log(`  tier ${tier}: ${pending.length} cells voted+processed in ${(ms / 1000).toFixed(1)}s`)

      const d = await retry('phase check', () => prisma.deliberation.findUnique({ where: { id: deliberation.id } }))
      if (d?.phase === 'COMPLETED' || d?.phase === 'ACCUMULATING') break
      tier++
    }
    const voteMs = Date.now() - vStart

    // ── 5. Report ──
    const d = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    const totalVotes = await prisma.vote.count({ where: { cell: { deliberationId: deliberation.id } } })
    const totalCells = await prisma.cell.count({ where: { deliberationId: deliberation.id } })
    let championText: string | null = null
    if (d?.championId) championText = (await prisma.idea.findUnique({ where: { id: d.championId } }))?.text ?? null

    console.log(`\n=== RESULT ===`)
    console.log(`  final phase   : ${d?.phase}`)
    console.log(`  champion      : ${d?.championId ? `${d.championId} (${championText})` : 'NONE'}`)
    console.log(`  tiers         : ${tierStats.length}`)
    console.log(`  total cells   : ${totalCells}`)
    console.log(`  total votes   : ${totalVotes}`)
    console.log(`  voting time   : ${(voteMs / 1000).toFixed(1)}s`)
    console.log(`  votes/sec     : ${(totalVotes / (voteMs / 1000)).toFixed(0)}`)
    console.log(`  total elapsed : ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    for (const s of tierStats) console.log(`    tier ${s.tier}: ${s.cells} cells, ${(s.ms / 1000).toFixed(1)}s`)
    if (d?.phase !== 'COMPLETED') console.log(`\n  ⚠ did NOT reach COMPLETED`)
    if (!d?.championId) console.log(`  ⚠ NO champion declared`)
  } catch (e) {
    console.error(`\n❌ stress run errored (cleanup still runs):`, e)
  } finally {
    if (FLAGS.keep) { console.log(`\n[${RUN}] --keep set, leaving data`) }
    else { console.log(`\n[${RUN}] cleaning up...`); await teardown(createdDelibIds, createdUserIds); console.log(`  cleanup done`) }
    process.exit(0)
  }
}

async function teardown(deliberationIds: string[], userIds: string[]) {
  const { prisma } = await import('@/lib/prisma')
  const del = (label: string, fn: () => Promise<unknown>) => retry(label, fn).catch(() => {})
  if (deliberationIds.length > 0) {
    await del('predictions', () => prisma.prediction.deleteMany({ where: { deliberationId: { in: deliberationIds } } }))
    const cells = await retry('find cells', () => prisma.cell.findMany({ where: { deliberationId: { in: deliberationIds } }, select: { id: true } }))
    const cellIds = cells.map(c => c.id)
    if (cellIds.length > 0) {
      await del('cellDialogue', () => prisma.cellDialogue.deleteMany({ where: { cellId: { in: cellIds } } }))
      await del('cellOutcome', () => prisma.cellOutcome.deleteMany({ where: { cellId: { in: cellIds } } }))
      await del('votes', () => prisma.vote.deleteMany({ where: { cellId: { in: cellIds } } }))
      await del('comment unlink', () => prisma.comment.updateMany({ where: { cellId: { in: cellIds } }, data: { replyToId: null } }))
      await del('comments', () => prisma.comment.deleteMany({ where: { cellId: { in: cellIds } } }))
      await del('cellIdea', () => prisma.cellIdea.deleteMany({ where: { cellId: { in: cellIds } } }))
      await del('cellParticipation', () => prisma.cellParticipation.deleteMany({ where: { cellId: { in: cellIds } } }))
      await del('cells', () => prisma.cell.deleteMany({ where: { id: { in: cellIds } } }))
    }
    const ideas = await retry('find ideas', () => prisma.idea.findMany({ where: { deliberationId: { in: deliberationIds } }, select: { id: true } }))
    const ideaIds = ideas.map(i => i.id)
    if (ideaIds.length > 0) {
      const revs = await retry('find revs', () => prisma.ideaRevision.findMany({ where: { ideaId: { in: ideaIds } }, select: { id: true } }))
      const revIds = revs.map(r => r.id)
      if (revIds.length > 0) {
        await del('revVotes', () => prisma.ideaRevisionVote.deleteMany({ where: { revisionId: { in: revIds } } }))
        await del('revs', () => prisma.ideaRevision.deleteMany({ where: { id: { in: revIds } } }))
      }
    }
    await del('ideas', () => prisma.idea.deleteMany({ where: { deliberationId: { in: deliberationIds } } }))
    await del('members', () => prisma.deliberationMember.deleteMany({ where: { deliberationId: { in: deliberationIds } } }))
    await del('delibs', () => prisma.deliberation.deleteMany({ where: { id: { in: deliberationIds } } }))
  }
  for (let i = 0; i < userIds.length; i += 500) {
    await del(`users ${i}`, () => prisma.user.deleteMany({ where: { id: { in: userIds.slice(i, i + 500) } } }))
  }
}

main().catch(e => { console.error('\n❌ fatal:', e); process.exit(1) })
