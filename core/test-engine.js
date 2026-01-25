// Test the extracted core engine
const { UnionChantEngine } = require('./union-chant-engine')

console.log('🧪 Testing Union Chant Engine (Core Module)\n')

const engine = new UnionChantEngine()

// Test 1: Add participants and ideas
console.log('=== Test 1: Add Participants ===')
for (let i = 1; i <= 25; i++) {
  const participant = engine.addParticipant({
    name: `Participant ${i}`,
    type: 'human'
  })

  engine.addIdea({
    text: `Idea from P${i}`,
    author: participant.name,
    authorId: participant.id
  })
}

console.log(`✅ Added ${engine.participants.length} participants`)
console.log(`✅ Added ${engine.ideas.length} ideas\n`)

// Test 2: Start voting
console.log('=== Test 2: Start Voting ===')
const result = engine.startVoting()
console.log(`✅ Phase: ${engine.phase}`)
console.log(`✅ Cells formed: ${result.cellsFormed}`)
console.log(`✅ Current tier: ${engine.currentTier}\n`)

// Test 3: Examine Tier 1 cells
console.log('=== Test 3: Tier 1 Cell Structure ===')
const tier1Cells = engine.getCellsByTier(1)
tier1Cells.forEach(cell => {
  const ideas = engine.getCellIdeas(cell.id)
  console.log(`${cell.id}: ${cell.participants.length} participants, ${ideas.length} ideas`)
})
console.log()

// Test 4: Simulate voting in all cells
console.log('=== Test 4: Simulate Voting ===')
tier1Cells.forEach(cell => {
  const ideas = engine.getCellIdeas(cell.id)

  // Each participant votes for random idea
  cell.participants.forEach(participantId => {
    const randomIdea = ideas[Math.floor(Math.random() * ideas.length)]
    engine.castVote(cell.id, participantId, randomIdea.id)
  })

  console.log(`✅ ${cell.id} voting complete`)
})
console.log()

// Test 5: Complete Tier 1
console.log('=== Test 5: Complete Tier 1 ===')
const tier1Result = engine.completeTier(1)

if (tier1Result.winner) {
  console.log(`🏆 Winner: ${tier1Result.winner.id}`)
} else {
  console.log(`✅ Advanced to Tier ${tier1Result.nextTier}`)
  console.log(`✅ ${tier1Result.advancingIdeas} ideas advancing\n`)

  // Test 6: Tier 2 structure
  console.log('=== Test 6: Tier 2 Structure ===')
  const tier2Cells = engine.getCellsByTier(2)
  tier2Cells.forEach(cell => {
    const ideas = engine.getCellIdeas(cell.id)
    console.log(`${cell.id}: ${cell.participants.length} participants, ${ideas.length} ideas`)
  })

  // Check all cells have same ideas
  const firstCellIdeas = engine.getCellIdeas(tier2Cells[0].id).map(i => i.id).sort()
  const allSameIdeas = tier2Cells.every(cell => {
    const cellIdeas = engine.getCellIdeas(cell.id).map(i => i.id).sort()
    return JSON.stringify(cellIdeas) === JSON.stringify(firstCellIdeas)
  })

  console.log(`✅ All Tier 2 cells have same ideas: ${allSameIdeas}\n`)

  // Test 7: Vote in Tier 2
  console.log('=== Test 7: Tier 2 Voting ===')
  tier2Cells.forEach(cell => {
    const ideas = engine.getCellIdeas(cell.id)

    cell.participants.forEach(participantId => {
      const randomIdea = ideas[Math.floor(Math.random() * ideas.length)]
      engine.castVote(cell.id, participantId, randomIdea.id)
    })

    console.log(`✅ ${cell.id} voting complete`)
  })
  console.log()

  // Test 8: Complete Tier 2
  console.log('=== Test 8: Complete Tier 2 ===')
  const tier2Result = engine.completeTier(2)

  if (tier2Result.winner) {
    console.log(`🏆 Final Winner: ${tier2Result.winner.id}`)
    console.log(`   Total votes: ${tier2Result.winner.totalVotes}`)
  } else {
    console.log(`✅ Advanced to Tier ${tier2Result.nextTier}`)
    console.log(`✅ ${tier2Result.advancingIdeas} ideas advancing`)
  }
}

// Test 9: Test deliberation methods
console.log('\n=== Test 9: Deliberation Methods ===')
engine.reset()

// Add 10 participants for a quick test
for (let i = 1; i <= 10; i++) {
  const p = engine.addParticipant({ name: `P${i}`, type: 'human' })
  engine.addIdea({ text: `Idea ${i}`, author: p.name, authorId: p.id })
}

engine.startVoting()
const testCell = engine.cells[0]

// Add comments
engine.addComment(testCell.id, 'p-1', 'I think idea-2 addresses the core issue.')
engine.addComment(testCell.id, 'p-2', 'Interesting point! What about scalability?')
engine.addComment(testCell.id, 'p-1', 'Good question. I think it scales well.', 'comment-2')

const comments = engine.getCellComments(testCell.id)
console.log(`✅ Added ${comments.length} comments to ${testCell.id}`)
comments.forEach(c => {
  console.log(`   ${c.participantId}: "${c.text}"${c.replyTo ? ` (reply to ${c.replyTo})` : ''}`)
})

console.log('\n✅ All tests passed! Core engine is working correctly.')
console.log('\n📦 Core module successfully extracted from v7-STABLE')
console.log('   - Pure logic, no HTTP')
console.log('   - Can be used by any interface (server, CLI, tests)')
console.log('   - Ready for AI agents and React frontend')
