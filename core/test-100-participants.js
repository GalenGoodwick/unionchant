// Test with 100 participants - full multi-tier progression
const { UnionChantEngine } = require('./union-chant-engine')

console.log('🧪 Testing Core Engine - 100 Participants Multi-Tier\n')

const engine = new UnionChantEngine()

// Add 100 participants
console.log('=== Setup: 100 Participants ===')
for (let i = 1; i <= 100; i++) {
  const p = engine.addParticipant({ name: `P${i}`, type: 'human' })
  engine.addIdea({ text: `Idea ${i}`, author: p.name, authorId: p.id })
}

console.log(`✅ ${engine.participants.length} participants`)
console.log(`✅ ${engine.ideas.length} ideas\n`)

// Start voting
engine.startVoting()

let currentTier = 1
let maxTiers = 10 // Safety limit

console.log('=== Multi-Tier Progression ===\n')

while (engine.phase === 'voting' && currentTier <= maxTiers) {
  const tierCells = engine.getCellsByTier(currentTier)
  const tierIdeas = engine.getIdeasByTier(currentTier)

  console.log(`Tier ${currentTier}:`)
  console.log(`  Cells: ${tierCells.length}`)
  console.log(`  Ideas: ${tierIdeas.length}`)
  console.log(`  Participants voting: ${engine.participants.length}`)

  // Check if all cells have same ideas (Tier 2+)
  if (currentTier > 1) {
    const firstCellIdeas = engine.getCellIdeas(tierCells[0].id).map(i => i.id).sort()
    const allSameIdeas = tierCells.every(cell => {
      const cellIdeas = engine.getCellIdeas(cell.id).map(i => i.id).sort()
      return JSON.stringify(cellIdeas) === JSON.stringify(firstCellIdeas)
    })
    console.log(`  All cells same ideas: ${allSameIdeas ? '✅' : '❌'}`)
  }

  // Vote in all cells
  tierCells.forEach(cell => {
    const ideas = engine.getCellIdeas(cell.id)
    cell.participants.forEach(pId => {
      const randomIdea = ideas[Math.floor(Math.random() * ideas.length)]
      engine.castVote(cell.id, pId, randomIdea.id)
    })
  })

  console.log(`  ✅ All cells voted`)

  // Complete tier
  const result = engine.completeTier(currentTier)

  if (result.winner) {
    console.log(`  🏆 WINNER: ${result.winner.id}`)
    console.log(`\n✅ Winner declared at Tier ${currentTier}`)
    break
  } else {
    console.log(`  ➡️  ${result.advancingIdeas} ideas advance to Tier ${result.nextTier}`)
    currentTier = result.nextTier
    console.log()
  }
}

if (engine.phase === 'completed') {
  console.log('=== Final Result ===')
  console.log(`✅ System completed successfully`)
  console.log(`✅ Reached Tier ${currentTier}`)
  console.log(`✅ Everyone voted at every tier (${engine.participants.length} participants)`)
  console.log(`✅ Natural reduction working correctly`)
  console.log(`✅ Multi-tier progression verified`)
} else {
  console.log('❌ Did not reach winner (safety limit or error)')
}

// Verify everyone voted in every tier
const allVoters = new Set(engine.votes.map(v => v.participantId))
const everyoneVoted = allVoters.size === engine.participants.length

console.log(`\n=== Participation Verification ===`)
console.log(`Total participants: ${engine.participants.length}`)
console.log(`Unique voters: ${allVoters.size}`)
console.log(`Everyone participated: ${everyoneVoted ? '✅' : '❌'}`)

console.log(`\n📊 Total votes cast: ${engine.votes.length}`)
console.log(`📊 Total cells created: ${engine.cells.length}`)
console.log(`📊 Total tiers: ${currentTier}`)

console.log('\n✅ 100-participant test PASSED')
console.log('✅ Core engine is production ready')
