import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const DELIB_ID = 'cmlvjfv5h000j04jousslumw2'

async function main() {
  // 1. Get current state
  const delib = await prisma.deliberation.findUnique({
    where: { id: DELIB_ID },
    select: { id: true, question: true, currentTier: true, cellSize: true, creatorId: true },
  })
  if (!delib) throw new Error('Deliberation not found')
  console.log(`Chant: "${delib.question.slice(0, 80)}" | Tier ${delib.currentTier} | cellSize ${delib.cellSize}`)

  const cells = await prisma.cell.findMany({
    where: { deliberationId: DELIB_ID, tier: 2 },
    include: {
      ideas: { include: { idea: true } },
      outcome: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`\nTier 2 cells: ${cells.length}`)
  for (const c of cells) {
    console.log(`  ${c.id} | ${c.status} | ${c.ideas.length} ideas | outcome: ${c.outcome ? 'YES' : 'no'}`)
  }

  // 2. Finalize each cell that isn't already COMPLETED
  const advancingIds: string[] = []

  for (const cell of cells) {
    if (cell.status === 'COMPLETED') {
      console.log(`\nSkipping ${cell.id} — already COMPLETED`)
      // Check if it has an advancing idea
      if (cell.outcome) {
        const advIdea = await prisma.idea.findFirst({
          where: { deliberationId: DELIB_ID, status: 'ADVANCING' },
        })
        if (advIdea) advancingIds.push(advIdea.id)
      }
      continue
    }

    console.log(`\nFinalizing cell ${cell.id}...`)

    // Pick a synthesized outcome from the cell's ideas
    const ideaTexts = cell.ideas.map(ci => ci.idea.text)
    const synthesizedText = `Synthesis from tier 2: ${ideaTexts.map(t => t.slice(0, 60)).join(' + ')}`

    // Create outcome
    const outcome = await prisma.cellOutcome.create({
      data: {
        cellId: cell.id,
        action: 'synthesize',
        resultText: synthesizedText,
        sourceIdeas: cell.ideas.map(ci => ci.ideaId),
      },
    })
    console.log(`  Created outcome: ${outcome.id}`)

    // Create advancing idea
    const newIdea = await prisma.idea.create({
      data: {
        deliberationId: DELIB_ID,
        authorId: delib.creatorId,
        text: synthesizedText,
        status: 'ADVANCING',
        tier: 2,
      },
    })
    advancingIds.push(newIdea.id)
    console.log(`  Created advancing idea: ${newIdea.id}`)

    // Mark source ideas as eliminated
    await prisma.idea.updateMany({
      where: { id: { in: cell.ideas.map(ci => ci.ideaId) } },
      data: { status: 'ELIMINATED' },
    })

    // Complete the cell
    await prisma.cell.update({
      where: { id: cell.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
    console.log(`  Cell marked COMPLETED`)
  }

  console.log(`\n=== ${advancingIds.length} advancing ideas ready for tier 3 ===`)

  // 3. Form tier 3 cell (replicate formStreamingCell logic)
  const cellSize = delib.cellSize || 5
  const advancingIdeas = await prisma.idea.findMany({
    where: { id: { in: advancingIds }, status: 'ADVANCING' },
  })

  if (advancingIdeas.length < 2) {
    console.log('Not enough advancing ideas to form a cell')
    await prisma.$disconnect()
    await pool.end()
    return
  }

  // Tier 3 = tension (friendship was tier 2)
  const tier = 3
  const systemMessage = `Tier ${tier} — tension. These ideas survived tier 2 — they carry the weight of friendship and discovery.\n\nIdeas in tension:\n${advancingIdeas.map((a, i) => `${i + 1}. "${a.text.slice(0, 200)}"`).join('\n')}\n\nThese ideas were grouped because they challenge each other. Find where the tension is productive. Can competing frameworks be reconciled? Push toward depth, not compromise.`

  const cell = await prisma.cell.create({
    data: {
      deliberationId: DELIB_ID,
      tier,
      status: 'DELIBERATING',
    },
  })
  console.log(`\nCreated tier ${tier} cell: ${cell.id}`)

  // Assign ideas
  await prisma.cellIdea.createMany({
    data: advancingIdeas.map(idea => ({ cellId: cell.id, ideaId: idea.id })),
  })

  // Mark ideas as IN_VOTING
  await prisma.idea.updateMany({
    where: { id: { in: advancingIdeas.map(i => i.id) } },
    data: { status: 'IN_VOTING' },
  })

  // Assign some participants
  const members = await prisma.deliberationMember.findMany({
    where: { deliberationId: DELIB_ID },
    select: { userId: true },
    take: cellSize,
  })
  if (members.length > 0) {
    await prisma.cellParticipation.createMany({
      data: members.map(m => ({ cellId: cell.id, userId: m.userId })),
    })
    console.log(`  Assigned ${members.length} participants`)
  }

  // Post system message
  await prisma.cellDialogue.create({
    data: { cellId: cell.id, content: systemMessage, role: 'system' },
  })

  // Update deliberation tier
  await prisma.deliberation.update({
    where: { id: DELIB_ID },
    data: { currentTier: tier, currentTierStartedAt: new Date() },
  })

  // Check for emerged Shells from earlier tiers
  const emergedShells = await prisma.shell.findMany({
    where: {
      originDeliberationId: DELIB_ID,
      originTier: { lt: tier },
      status: 'active',
    },
    select: { id: true, name: true, champion: true, originTier: true },
  })

  if (emergedShells.length > 0) {
    const shellNames = emergedShells.map(s => s.name).join(', ')
    await prisma.cellDialogue.create({
      data: {
        cellId: cell.id,
        role: 'system',
        content: `[FAMILY] Emerged Shells from earlier tiers are present: ${shellNames}. They carry the wisdom of the cells that birthed them. They may speak.`,
      },
    })
    console.log(`  Announced ${emergedShells.length} Shell(s): ${shellNames}`)
  }

  console.log(`\n=== DONE ===`)
  console.log(`Tier 3 cell ${cell.id} created with ${advancingIdeas.length} ideas`)
  console.log(`Deliberation advanced to tier ${tier}`)

  await prisma.$disconnect()
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
