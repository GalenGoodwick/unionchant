// Test AI agents generating their own ideas
// Topic: Public transportation improvements

const { UnionChantEngine } = require('./union-chant-engine')
const { AgentManager } = require('./agent-manager')

async function testGeneratedIdeas() {
  console.log('🧪 Testing AI-Generated Ideas\n')

  const engine = new UnionChantEngine()
  const agentManager = new AgentManager(engine)

  // Spawn 5 agents with different personalities
  // They will each generate their own idea about public transportation
  await agentManager.spawnAgents(
    5,
    {
      progressive: 0.4,
      conservative: 0.4,
      balanced: 0.2
    },
    'improving public transportation in our city'
  )

  console.log('='.repeat(60))
  console.log('GENERATED IDEAS')
  console.log('='.repeat(60))

  engine.ideas.forEach((idea, i) => {
    const agent = agentManager.agents.find(a => a.id === idea.authorId)
    console.log(`\n${i + 1}. ${agent.name} (${agent.personality}):`)
    console.log(`   "${idea.text}"`)
  })

  console.log('\n' + '='.repeat(60))
  console.log('\n✅ Test complete!')
  console.log('\nNotice how:')
  console.log('  - Each agent proposed a unique idea')
  console.log('  - Progressive agents favor equity/environment')
  console.log('  - Conservative agents favor cost-effectiveness')
  console.log('  - Balanced agents consider both sides')
  console.log('\n💰 Cost: ~$0.005 (5 API calls for idea generation)')
}

testGeneratedIdeas().catch(error => {
  console.error('Test failed:', error)
  process.exit(1)
})
