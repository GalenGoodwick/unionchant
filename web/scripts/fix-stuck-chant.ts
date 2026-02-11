/**
 * Fix the stuck 23-agent chant by:
 * 1. Assigning batch numbers to null-batch cells
 * 2. Calling checkTierCompletion to advance to tier 2
 * 3. OR if ≤5 ideas are advancing, crown the winner directly
 *
 * Usage:
 *   npx tsx scripts/fix-stuck-chant.ts
 */

import { prisma } from '../src/lib/prisma'
import { checkTierCompletion } from '../src/lib/voting'

const CHANT_ID = 'cmlh81nhx001604jfn8uxdy0t'

async function main() {
  console.log('=== Fix Stuck Chant ===\n')

  const delib = await prisma.deliberation.findUnique({
    where: { id: CHANT_ID },
    select: { phase: true, currentTier: true, cellSize: true, allocationMode: true },
  })

  if (!delib) {
    console.error('Chant not found')
    process.exit(1)
  }

  console.log(`Phase: ${delib.phase}, Tier: ${delib.currentTier}, Mode: ${delib.allocationMode}`)

  // Step 1: Check cells with null batches
  const cells = await prisma.cell.findMany({
    where: { deliberationId: CHANT_ID, tier: 1 },
    select: { id: true, batch: true, status: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`\nTier 1 cells: ${cells.length}`)
  for (const c of cells) {
    console.log(`  ${c.id.slice(0, 12)}: batch=${c.batch}, status=${c.status}`)
  }

  const nullBatchCells = cells.filter(c => c.batch === null)
  if (nullBatchCells.length > 0) {
    console.log(`\n${nullBatchCells.length} cells have null batch. Assigning batch numbers...`)
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].batch === null) {
        await prisma.cell.update({
          where: { id: cells[i].id },
          data: { batch: i },
        })
        console.log(`  ${cells[i].id.slice(0, 12)} → batch ${i}`)
      }
    }
  }

  // Step 2: Check advancing ideas
  const advancing = await prisma.idea.findMany({
    where: { deliberationId: CHANT_ID, status: 'ADVANCING' },
    select: { id: true, text: true, tier: true, totalXP: true },
    orderBy: { totalXP: 'desc' },
  })

  console.log(`\nAdvancing ideas: ${advancing.length}`)
  for (const a of advancing) {
    console.log(`  [XP:${a.totalXP}] ${a.text.slice(0, 60)}...`)
  }

  // Step 3: Try checkTierCompletion
  console.log('\nCalling checkTierCompletion...')
  await checkTierCompletion(CHANT_ID, 1)

  // Step 4: Check result
  const after = await prisma.deliberation.findUnique({
    where: { id: CHANT_ID },
    select: { phase: true, currentTier: true, championId: true },
  })

  console.log(`\nAfter: Phase=${after?.phase}, Tier=${after?.currentTier}, Champion=${after?.championId}`)

  if (after?.phase === 'COMPLETED' || after?.championId) {
    const winner = await prisma.idea.findFirst({
      where: { deliberationId: CHANT_ID, status: 'WINNER' },
      select: { id: true, text: true, totalXP: true },
    })
    if (winner) {
      console.log(`\n🏆 WINNER: "${winner.text.slice(0, 80)}..." (XP: ${winner.totalXP})`)
    }
  } else if (after?.currentTier && after.currentTier > 1) {
    console.log(`\nTier advanced to ${after.currentTier}. Agents can now enter tier 2 cells.`)
  } else {
    console.log('\nStill stuck. Trying direct winner declaration...')

    // If 5 or fewer advancing ideas, just declare the top one
    if (advancing.length <= (delib.cellSize || 5)) {
      const topIdea = advancing[0] // Already sorted by totalXP desc
      if (topIdea) {
        await prisma.$transaction([
          prisma.idea.update({
            where: { id: topIdea.id },
            data: { status: 'WINNER', isChampion: true },
          }),
          prisma.idea.updateMany({
            where: {
              deliberationId: CHANT_ID,
              status: 'ADVANCING',
              id: { not: topIdea.id },
            },
            data: { status: 'ELIMINATED' },
          }),
          prisma.deliberation.update({
            where: { id: CHANT_ID },
            data: {
              phase: 'COMPLETED',
              championId: topIdea.id,
              completedAt: new Date(),
            },
          }),
        ])
        console.log(`\n🏆 DECLARED WINNER: "${topIdea.text.slice(0, 80)}..." (XP: ${topIdea.totalXP})`)
      }
    }
  }

  // Final state
  const final = await prisma.deliberation.findUnique({
    where: { id: CHANT_ID },
    select: { phase: true, currentTier: true, championId: true },
  })
  console.log(`\nFinal state: Phase=${final?.phase}, Tier=${final?.currentTier}, Champion=${final?.championId}`)

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
