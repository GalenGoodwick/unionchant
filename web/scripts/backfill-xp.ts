/**
 * Backfill totalXP for all ideas by recalculating from Vote records
 * Run with: npx tsx scripts/backfill-xp.ts
 */

import { prisma } from '../src/lib/prisma'

async function backfillXP() {
  console.log('Starting XP backfill...')

  // Update all ideas' totalXP by summing their votes across all cells
  const result = await prisma.$executeRaw`
    UPDATE "Idea" SET "totalXP" = COALESCE(sub.xp, 0)::int, "totalVotes" = COALESCE(sub.voters, 0)::int
    FROM (
      SELECT "ideaId", COUNT(DISTINCT "userId") as voters, SUM("xpPoints") as xp
      FROM "Vote"
      GROUP BY "ideaId"
    ) sub
    WHERE "Idea".id = sub."ideaId"
  `

  console.log(`✅ Updated ${result} ideas with recalculated XP`)

  // Show top ideas by XP
  const topIdeas = await prisma.idea.findMany({
    where: { totalXP: { gt: 0 } },
    orderBy: { totalXP: 'desc' },
    take: 10,
    select: {
      id: true,
      text: true,
      totalXP: true,
      totalVotes: true,
      status: true,
      deliberation: { select: { question: true } },
    },
  })

  console.log('\n📊 Top 10 ideas by XP:')
  topIdeas.forEach((idea, i) => {
    console.log(`${i + 1}. ${idea.totalXP} XP (${idea.totalVotes} voters) - ${idea.status}`)
    console.log(`   "${idea.text.slice(0, 60)}..."`)
    console.log(`   Chant: ${idea.deliberation.question.slice(0, 50)}...\n`)
  })
}

backfillXP().catch((error) => {
  console.error('Error backfilling XP:', error)
  process.exit(1)
})
