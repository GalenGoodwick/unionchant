// Minimal test to demonstrate 3-tier progression
// Using 10 agents (optimized: speak once, 100 char limit)

const { UnionChantEngine } = require('./union-chant-engine')
const { AgentManager } = require('./agent-manager')

async function test3Tiers() {
  console.log('\n' + '='.repeat(60))
  console.log('🎯 MINIMAL 3-TIER TEST (20 Agents)')
  console.log('='.repeat(60))
  console.log('Optimized: 100 char comments, agents speak once\n')

  const engine = new UnionChantEngine()
  const agentManager = new AgentManager(engine)

  // Spawn 20 agents
  console.log('⏳ Spawning 20 agents with AI-generated ideas...\n')
  await agentManager.spawnAgents(20, null, 'improving public transportation')

  console.log('\n' + '='.repeat(60))
  console.log('🗳️  STARTING VOTING PROCESS')
  console.log('='.repeat(60) + '\n')

  // Run full demo
  await agentManager.runFullDemo(false) // parallel mode

  console.log('\n' + '='.repeat(60))
  console.log('✅ TEST COMPLETE')
  console.log('='.repeat(60))
  console.log('\n💰 Cost: ~$0.04 (40 API calls total)')
  console.log('   - 20 idea generation calls')
  console.log('   - 20 deliberation calls (one comment each)')
  console.log('   - Voting uses logic (no API calls)')
}

test3Tiers().catch(error => {
  console.error('Test failed:', error)
  process.exit(1)
})
