// Test constraint enforcement with edge cases
const { UnionChantEngine } = require('./union-chant-engine')

console.log('🧪 Testing Core Engine - Constraint Enforcement\n')

// Test with 38 participants (edge case from v7-STABLE tests)
const engine = new UnionChantEngine()

console.log('=== Test: 38 Participants (Edge Case) ===')
for (let i = 1; i <= 38; i++) {
  const p = engine.addParticipant({ name: `P${i}`, type: 'human' })
  engine.addIdea({ text: `Idea ${i}`, author: p.name, authorId: p.id })
}

console.log(`✅ Added ${engine.participants.length} participants`)
console.log(`✅ Added ${engine.ideas.length} ideas\n`)

// Start voting
engine.startVoting()

const tier1Cells = engine.getCellsByTier(1)
console.log('Tier 1 Cell Sizes:', tier1Cells.map(c => c.participants.length))

const minCellSize = Math.min(...tier1Cells.map(c => c.participants.length))
console.log(`Min cell size: ${minCellSize}\n`)

// Check constraints
console.log('=== Constraint Checks ===')
let allConstraintsSatisfied = true

tier1Cells.forEach(cell => {
  const ideas = engine.getCellIdeas(cell.id)
  const participantCount = cell.participants.length
  const ideaCount = ideas.length

  const satisfiesMaxIdeas = ideaCount <= 7
  const satisfiesParticipantConstraint = ideaCount <= participantCount

  console.log(`${cell.id}: ${participantCount} participants, ${ideaCount} ideas`)
  console.log(`  Max 7 ideas: ${satisfiesMaxIdeas ? '✅' : '❌'}`)
  console.log(`  Ideas ≤ participants: ${satisfiesParticipantConstraint ? '✅' : '❌'}`)

  if (!satisfiesMaxIdeas || !satisfiesParticipantConstraint) {
    allConstraintsSatisfied = false
  }
})

console.log(`\n${allConstraintsSatisfied ? '✅' : '❌'} All Tier 1 constraints satisfied\n`)

// Vote in all cells
console.log('=== Voting ===')
tier1Cells.forEach(cell => {
  const ideas = engine.getCellIdeas(cell.id)
  cell.participants.forEach(pId => {
    const randomIdea = ideas[Math.floor(Math.random() * ideas.length)]
    engine.castVote(cell.id, pId, randomIdea.id)
  })
})
console.log('✅ All Tier 1 cells voted\n')

// Complete Tier 1
const result = engine.completeTier(1)
console.log(`✅ Tier 1 complete: ${result.advancingIdeas} ideas advancing to Tier 2\n`)

// Check Tier 2 constraints
const tier2Cells = engine.getCellsByTier(2)
const tier2MinCellSize = Math.min(...tier2Cells.map(c => c.participants.length))

console.log('=== Tier 2 Constraint Checks ===')
console.log(`Min cell size in Tier 2: ${tier2MinCellSize}`)

tier2Cells.forEach(cell => {
  const ideas = engine.getCellIdeas(cell.id)
  console.log(`${cell.id}: ${cell.participants.length} participants, ${ideas.length} ideas`)
})

const tier2Ideas = engine.getCellIdeas(tier2Cells[0].id)
const tier2ConstraintSatisfied = tier2Ideas.length <= tier2MinCellSize && tier2Ideas.length <= 7

console.log(`\n${tier2ConstraintSatisfied ? '✅' : '❌'} Tier 2 constraints satisfied`)
console.log(`   ${tier2Ideas.length} ideas ≤ ${tier2MinCellSize} min cell size: ${tier2Ideas.length <= tier2MinCellSize ? '✅' : '❌'}`)
console.log(`   ${tier2Ideas.length} ideas ≤ 7 max: ${tier2Ideas.length <= 7 ? '✅' : '❌'}`)

// Check all Tier 2 cells have same ideas
const firstCellIdeas = engine.getCellIdeas(tier2Cells[0].id).map(i => i.id).sort()
const allSameIdeas = tier2Cells.every(cell => {
  const cellIdeas = engine.getCellIdeas(cell.id).map(i => i.id).sort()
  return JSON.stringify(cellIdeas) === JSON.stringify(firstCellIdeas)
})

console.log(`   All cells have same ideas: ${allSameIdeas ? '✅' : '❌'}`)

console.log('\n=== Final Result ===')
if (allConstraintsSatisfied && tier2ConstraintSatisfied && allSameIdeas) {
  console.log('✅ All constraint tests PASSED')
  console.log('✅ Core engine correctly enforces constraints')
  console.log('✅ Ready for production use')
} else {
  console.log('❌ Some constraints FAILED')
}
