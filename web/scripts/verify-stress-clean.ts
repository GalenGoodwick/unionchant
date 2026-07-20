import * as dotenv from 'dotenv'; import * as path from 'path'
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })
if (process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.DATABASE_URL.trim().replace(/^["']|["']$/g,'').replace(/\\n$/,'').trim()
;(async () => {
  const { prisma } = await import('@/lib/prisma')
  const users = await prisma.user.count({ where: { email: { contains: 'stress1k-' } } })
  const delibs = await prisma.deliberation.count({ where: { question: { contains: 'stress1k-' } } })
  const ideas = await prisma.idea.count({ where: { text: { contains: 'stress1k-' } } })
  // votes/cells: find any deliberation still tagged, count children
  const taggedDelibs = await prisma.deliberation.findMany({ where: { question: { contains: 'stress1k-' } }, select: { id: true } })
  let cells = 0, votes = 0
  if (taggedDelibs.length) {
    const ids = taggedDelibs.map(d => d.id)
    cells = await prisma.cell.count({ where: { deliberationId: { in: ids } } })
    votes = await prisma.vote.count({ where: { cell: { deliberationId: { in: ids } } } })
  }
  console.log(JSON.stringify({ leftover_users: users, leftover_deliberations: delibs, leftover_ideas: ideas, leftover_cells: cells, leftover_votes: votes }))
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
