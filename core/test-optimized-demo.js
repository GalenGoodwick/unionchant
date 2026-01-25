// Test optimized demo with 10 agents
// - 100 char limit on comments
// - Agents speak only once
// - Shows full process: spawn → deliberate → vote → winner

const { UnionChantEngine } = require('./union-chant-engine')
const { AgentManager } = require('./agent-manager')

async function runOptimizedDemo() {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 OPTIMIZED 10-AGENT DEMO')
  console.log('='.repeat(60))
  console.log('Cost savings: ~80% (agents speak once, 100 char limit)\n')

  const engine = new UnionChantEngine()
  const agentManager = new AgentManager(engine)

  // Spawn 10 agents
  await agentManager.spawnAgents(10, null, 'improving public transportation in our city')

  console.log('\n' + '='.repeat(60))
  console.log('STARTING DELIBERATION & VOTING')
  console.log('='.repeat(60) + '\n')

  // Run full demo (starts voting internally)
  await agentManager.runFullDemo(false) // parallel mode

  console.log('\n💰 Estimated cost: ~$0.015 (10 agents × 2 API calls each)')
  console.log('   - 10 calls for idea generation')
  console.log('   - 10 calls for deliberation (one comment each)')
  console.log('   - Vote decisions use simple logic (no API calls)')
}

runOptimizedDemo().catch(error => {
  console.error('Demo failed:', error)
  process.exit(1)
})
