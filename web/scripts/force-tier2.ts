import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  const deliberationId = 'cmlk165820000azufc65ousys'

  // 1. Delete ALL tier 2 cells (start fresh)
  const t2cells = await prisma.cell.findMany({
    where: { deliberationId, tier: 2 }
  })
  for (const c of t2cells) {
    await prisma.cell.delete({ where: { id: c.id } })
    console.log('Deleted tier 2 cell:', c.id.slice(-6))
  }

  // 2. Identify the TRUE tier 1 winners by XP from each cell
  const t1cells = await prisma.cell.findMany({
    where: { deliberationId, tier: 1 },
    include: {
      ideas: { include: { idea: true } },
      votes: true,
    }
  })

  const winners: string[] = []
  for (const cell of t1cells) {
    const xpMap: Record<string, number> = {}
    for (const ci of cell.ideas) xpMap[ci.ideaId] = 0
    for (const v of cell.votes) {
      xpMap[v.ideaId] = (xpMap[v.ideaId] || 0) + v.xpPoints
    }
    const ranked = Object.entries(xpMap).sort((a, b) => b[1] - a[1])
    if (ranked.length > 0) {
      winners.push(ranked[0][0])
      const idea = cell.ideas.find(ci => ci.ideaId === ranked[0][0])?.idea
      console.log(`Cell ${cell.id.slice(-6)} winner: ${idea?.text.slice(0, 60)} (${ranked[0][1]} XP)`)
    }
  }

  // 3. Set all ideas correctly: winners = IN_VOTING, rest = ELIMINATED
  const allIdeas = await prisma.idea.findMany({
    where: { deliberationId },
    select: { id: true }
  })
  for (const idea of allIdeas) {
    await prisma.idea.update({
      where: { id: idea.id },
      data: { status: winners.includes(idea.id) ? 'IN_VOTING' : 'ELIMINATED' }
    })
  }

  // 4. Get all members
  const members = await prisma.deliberationMember.findMany({
    where: { deliberationId },
    select: { userId: true }
  })

  // 5. Create final showdown cell
  console.log(`\n=== FINAL SHOWDOWN: ${winners.length} ideas, ${members.length} members ===`)

  const finalCell = await prisma.cell.create({
    data: { deliberationId, tier: 2, status: 'VOTING' }
  })

  for (const ideaId of winners) {
    await (prisma as any).cellIdea.create({
      data: { cellId: finalCell.id, ideaId }
    })
  }

  for (const m of members) {
    await (prisma as any).cellParticipation.create({
      data: { cellId: finalCell.id, userId: m.userId }
    })
  }

  // 6. Verify
  const check = await prisma.cell.findUnique({
    where: { id: finalCell.id },
    include: {
      ideas: { include: { idea: true } },
      _count: { select: { participants: true } }
    }
  })
  console.log('\nFinal cell:', check?.id.slice(-6))
  console.log('Participants:', check?._count.participants)
  console.log('Ideas:')
  for (const ci of check?.ideas || []) {
    console.log(`  - ${ci.idea.text.slice(0, 80)}`)
  }

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
