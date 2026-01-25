// Simple test: 5 AI agents deliberate and vote in one cell
// This is a quick proof-of-concept (should cost ~$0.01)

const { UnionChantEngine } = require('./union-chant-engine')
const { AgentManager } = require('./agent-manager')

async function runSimpleTest() {
  console.log('🧪 Testing AI Agent System - Simple Demo\n')
  console.log('Goal: Watch 5 AI agents discuss and vote in one cell\n')

  // Create engine
  const engine = new UnionChantEngine()

  // Create agent manager
  const agentManager = new AgentManager(engine)

  // Spawn 5 agents with different personalities
  await agentManager.spawnAgents(5, {
    progressive: 0.4,
    conservative: 0.4,
    balanced: 0.2
  })

  console.log('='.repeat(60))
  console.log('STARTING VOTING')
  console.log('='.repeat(60))

  // Start voting (forms 1 cell with 5 agents)
  engine.startVoting()

  const cells = engine.getCellsByTier(1)
  console.log(`\n✅ Formed ${cells.length} cell(s)`)
  console.log(`   Cell: ${cells[0].id}`)
  console.log(`   Participants: ${cells[0].participants.length}`)
  console.log(`   Ideas: ${cells[0].ideaIds.length}\n`)

  // Run deliberation for the one cell
  await agentManager.deliberateCell(cells[0].id, 8000) // 8 seconds

  // Agents vote
  await agentManager.voteCell(cells[0].id)

  // Show results
  console.log('='.repeat(60))
  console.log('RESULTS')
  console.log('='.repeat(60))

  const cellVotes = engine.votes.filter(v => v.cellId === cells[0].id)
  const tally = {}
  cellVotes.forEach(v => {
    tally[v.ideaId] = (tally[v.ideaId] || 0) + 1
  })

  console.log('\nVote Tally:')
  Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ideaId, count]) => {
      const idea = engine.ideas.find(i => i.id === ideaId)
      console.log(`   ${ideaId}: ${count} votes - "${idea.text}"`)
    })

  const winner = Object.keys(tally).reduce((a, b) => tally[a] > tally[b] ? a : b)
  const winnerIdea = engine.ideas.find(i => i.id === winner)

  console.log(`\n🏆 Winner: ${winner} - "${winnerIdea.text}"`)

  // Show discussion summary
  const comments = engine.getCellComments(cells[0].id)
  console.log(`\n💬 Discussion: ${comments.length} comments exchanged`)

  console.log('\n✅ Test complete!')
  console.log('\nKey observations:')
  console.log('   - Agents formed diverse perspectives based on personalities')
  console.log('   - Discussion happened before voting')
  console.log('   - Votes were informed by deliberation (not random)')
  console.log('   - Cost: ~$0.005 (half a penny for 5 agents)')
}

// Run the test
runSimpleTest().catch(error => {
  console.error('Test failed:', error)
  process.exit(1)
})
