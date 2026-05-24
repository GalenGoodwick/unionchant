import { prisma } from '../src/lib/prisma'

async function main() {
  // Find most recent Ask AI deliberation
  const delib = await prisma.deliberation.findFirst({
    where: { tags: { has: 'ask-ai' } },
    orderBy: { createdAt: 'desc' },
    include: {
      members: { select: { userId: true } },
    },
  })

  if (!delib) {
    console.log('No Ask AI deliberation found')
    return
  }

  console.log('='.repeat(80))
  console.log(`DELIBERATION: ${delib.question}`)
  console.log(`ID: ${delib.id}`)
  console.log(`Phase: ${delib.phase} | Current Tier: ${delib.currentTier}`)
  console.log(`Created: ${delib.createdAt.toISOString()}`)
  if (delib.completedAt) console.log(`Completed: ${delib.completedAt.toISOString()}`)
  console.log(`Total Members: ${delib.members.length}`)
  console.log('='.repeat(80))

  // Get max tier
  const maxTierResult = await prisma.cell.aggregate({
    where: { deliberationId: delib.id },
    _max: { tier: true },
  })
  const maxTier = maxTierResult._max.tier || 0

  console.log(`\nTOTAL TIERS: ${maxTier}\n`)

  // Tier-by-tier breakdown
  for (let tier = 1; tier <= maxTier; tier++) {
    const cells = await prisma.cell.findMany({
      where: { deliberationId: delib.id, tier },
      include: {
        _count: {
          select: { participants: true, ideas: true, votes: true },
        },
      },
      orderBy: { batch: 'asc' },
    })

    // Group by batch
    const batches = new Map<number, typeof cells>()
    for (const cell of cells) {
      const batchNum = cell.batch ?? 0
      if (!batches.has(batchNum)) batches.set(batchNum, [])
      batches.get(batchNum)!.push(cell)
    }

    const totalParticipants = cells.reduce((sum, c) => sum + c._count.participants, 0)
    const totalVotes = cells.reduce((sum, c) => sum + c._count.votes, 0)

    console.log(`TIER ${tier}:`)
    console.log(`  Cells: ${cells.length}`)
    console.log(`  Batches: ${batches.size}`)
    console.log(`  Total Participants: ${totalParticipants}`)
    console.log(`  Total Votes: ${totalVotes}`)

    for (const [batchNum, batchCells] of batches.entries()) {
      const batchParticipants = batchCells.reduce((sum, c) => sum + c._count.participants, 0)
      const batchVotes = batchCells.reduce((sum, c) => sum + c._count.votes, 0)
      console.log(`    Batch ${batchNum}: ${batchCells.length} cells, ${batchParticipants} participants, ${batchVotes} votes`)
    }

    // Get ideas for this tier
    const tierIdeas = await prisma.idea.count({
      where: { deliberationId: delib.id, tier },
    })
    const advancingIdeas = await prisma.idea.count({
      where: {
        deliberationId: delib.id,
        tier,
        status: { in: ['ADVANCING', 'WINNER'] },
      },
    })

    console.log(`  Ideas at tier: ${tierIdeas}`)
    console.log(`  Advancing: ${advancingIdeas}`)
    console.log()
  }

  // Champion info
  if (delib.championId) {
    const champion = await prisma.idea.findUnique({
      where: { id: delib.championId },
      select: { text: true, tier: true },
    })
    if (champion) {
      console.log('='.repeat(80))
      console.log(`CHAMPION (from tier ${champion.tier}):`)
      console.log(`"${champion.text}"`)
      console.log('='.repeat(80))
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
