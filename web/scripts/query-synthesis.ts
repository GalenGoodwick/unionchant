import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const chants = await prisma.deliberation.findMany({
    where: { chantMode: 'synthesis', phase: { not: 'COMPLETED' } },
    select: { id: true, question: true, phase: true, currentTier: true, cellSize: true, _count: { select: { ideas: true, members: true, cells: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  console.log('=== ACTIVE SYNTHESIS CHANTS ===')
  for (const c of chants) {
    console.log(`${c.id} | tier:${c.currentTier} | phase:${c.phase} | ideas:${c._count.ideas} | members:${c._count.members} | cells:${c._count.cells}`)
    console.log(`  Q: ${c.question.slice(0, 120)}`)
  }

  for (const c of chants) {
    const advancing = await prisma.idea.findMany({ where: { deliberationId: c.id, status: 'ADVANCING' }, select: { id: true, text: true, tier: true } })
    const cells = await prisma.cell.findMany({
      where: { deliberationId: c.id },
      select: { id: true, tier: true, status: true, _count: { select: { dialogues: true, ideas: true } } },
      orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }],
    })

    console.log(`\n--- ${c.id} ---`)
    console.log(`Advancing ideas (${advancing.length}):`)
    for (const a of advancing) console.log(`  [tier ${a.tier ?? '?'}] ${a.id}: "${a.text.slice(0, 100)}"`)
    console.log(`Cells:`)
    for (const cell of cells) console.log(`  T${cell.tier} ${cell.status} (${cell._count.dialogues} msgs, ${cell._count.ideas} ideas) ${cell.id}`)
  }

  await prisma.$disconnect()
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
