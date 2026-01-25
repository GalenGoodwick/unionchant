// Test with REAL ideas that agents can meaningfully discuss
// Topic: How should a city improve public transportation?

const { UnionChantEngine } = require('./union-chant-engine')
const { AgentManager } = require('./agent-manager')

async function runTest() {
  console.log('🧪 Testing AI Agent System - Real Deliberation\n')
  console.log('Topic: How should a city improve public transportation?\n')

  const engine = new UnionChantEngine()
  const agentManager = new AgentManager(engine)

  // Spawn 5 agents with different personalities
  console.log('🤖 Spawning 5 AI agents...\n')

  const personalities = ['progressive', 'progressive', 'conservative', 'conservative', 'balanced']

  for (let i = 0; i < 5; i++) {
    const agent = new (require('./ai-agent').AIAgent)(
      `agent-${i + 1}`,
      `Agent ${i + 1}`,
      personalities[i]
    )
    agentManager.agents.push(agent)

    engine.addParticipant({
      id: agent.id,
      name: agent.name,
      type: 'ai-agent',
      personality: agent.personality
    })

    console.log(`   ✅ ${agent.name} (${personalities[i]})`)
  }

  // Add REAL ideas about public transportation
  const realIdeas = [
    'Expand light rail network to connect all major neighborhoods',
    'Make all public buses free for riders',
    'Build dedicated bike lanes on every major street',
    'Increase bus frequency during peak hours',
    'Create express routes for commuters from suburbs'
  ]

  console.log('\n💡 Ideas being discussed:\n')
  realIdeas.forEach((text, i) => {
    engine.addIdea({
      id: `idea-${i + 1}`,
      text: text,
      author: `Agent ${i + 1}`,
      authorId: `agent-${i + 1}`
    })
    console.log(`   ${i + 1}. ${text}`)
  })

  console.log('\n' + '='.repeat(60))
  console.log('STARTING DELIBERATION')
  console.log('='.repeat(60) + '\n')

  // Start voting
  engine.startVoting()

  const cell = engine.getCellsByTier(1)[0]
  console.log(`Cell: ${cell.id}`)
  console.log(`Participants: ${cell.participants.length}`)
  console.log(`Ideas: ${cell.ideaIds.length}\n`)

  // Run deliberation (10 seconds)
  await agentManager.deliberateCell(cell.id, 10000)

  // Agents vote
  await agentManager.voteCell(cell.id)

  // Show results
  console.log('='.repeat(60))
  console.log('RESULTS')
  console.log('='.repeat(60))

  const cellVotes = engine.votes.filter(v => v.cellId === cell.id)
  const tally = {}
  cellVotes.forEach(v => {
    tally[v.ideaId] = (tally[v.ideaId] || 0) + 1
  })

  console.log('\n📊 Vote Tally:\n')
  Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ideaId, count]) => {
      const idea = engine.ideas.find(i => i.id === ideaId)
      console.log(`   ${count} votes - "${idea.text}"`)
    })

  const winner = Object.keys(tally).reduce((a, b) => tally[a] > tally[b] ? a : b)
  const winnerIdea = engine.ideas.find(i => i.id === winner)

  console.log(`\n🏆 Winner: "${winnerIdea.text}"`)

  const comments = engine.getCellComments(cell.id)
  console.log(`\n💬 Discussion: ${comments.length} total comments`)

  console.log('\n✅ Test complete!')
  console.log('\n📊 Cost: ~$0.01 (one penny for 5 agents with real deliberation)')
}

runTest().catch(error => {
  console.error('Test failed:', error)
  process.exit(1)
})
