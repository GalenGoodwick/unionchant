/**
 * Definitive sweep-purge of ALL leftover stress-test data by prefix.
 * Deletes every `stress1k-` user (and any lingering deliberations/children) that
 * earlier runs' in-memory cleanup may have orphaned. Surfaces failures loudly.
 */
import * as dotenv from 'dotenv'; import * as path from 'path'
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })
if (process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.DATABASE_URL.trim().replace(/^["']|["']$/g,'').replace(/\\n$/,'').replace(/\s+$/,'').trim()
process.env.PG_POOL_MAX = '20'; process.env.PG_CONNECT_TIMEOUT_MS = '30000'

;(async () => {
  const { prisma } = await import('@/lib/prisma')

  // 1. Any lingering tagged deliberations → cascade their children first
  const delibs = await prisma.deliberation.findMany({ where: { question: { contains: 'stress1k-' } }, select: { id: true } })
  const dIds = delibs.map(d => d.id)
  if (dIds.length) {
    console.log(`purging ${dIds.length} lingering deliberations...`)
    const cells = await prisma.cell.findMany({ where: { deliberationId: { in: dIds } }, select: { id: true } })
    const cIds = cells.map(c => c.id)
    if (cIds.length) {
      await prisma.vote.deleteMany({ where: { cellId: { in: cIds } } })
      await prisma.comment.updateMany({ where: { cellId: { in: cIds } }, data: { replyToId: null } })
      await prisma.comment.deleteMany({ where: { cellId: { in: cIds } } })
      await prisma.cellIdea.deleteMany({ where: { cellId: { in: cIds } } })
      await prisma.cellParticipation.deleteMany({ where: { cellId: { in: cIds } } })
      await prisma.cellDialogue.deleteMany({ where: { cellId: { in: cIds } } }).catch(()=>{})
      await prisma.cellOutcome.deleteMany({ where: { cellId: { in: cIds } } }).catch(()=>{})
      await prisma.cell.deleteMany({ where: { id: { in: cIds } } })
    }
    await prisma.prediction.deleteMany({ where: { deliberationId: { in: dIds } } }).catch(()=>{})
    await prisma.idea.deleteMany({ where: { deliberationId: { in: dIds } } })
    await prisma.deliberationMember.deleteMany({ where: { deliberationId: { in: dIds } } })
    await prisma.deliberation.deleteMany({ where: { id: { in: dIds } } })
  }

  // 2. Sweep all stress1k- users in batches until none remain
  let totalDeleted = 0
  while (true) {
    const batch = await prisma.user.findMany({ where: { email: { contains: 'stress1k-' } }, select: { id: true }, take: 500 })
    if (batch.length === 0) break
    // clear any FK-holding rows first (members would block user delete if delib purge missed any)
    const ids = batch.map(u => u.id)
    await prisma.deliberationMember.deleteMany({ where: { userId: { in: ids } } }).catch(()=>{})
    const res = await prisma.user.deleteMany({ where: { id: { in: ids } } })
    totalDeleted += res.count
    console.log(`  deleted ${res.count} users (running total ${totalDeleted})`)
  }

  const remaining = await prisma.user.count({ where: { email: { contains: 'stress1k-' } } })
  console.log(JSON.stringify({ users_deleted: totalDeleted, users_remaining: remaining }))
  process.exit(remaining === 0 ? 0 : 1)
})().catch(e => { console.error('PURGE FAILED:', e); process.exit(1) })
