/**
 * SDK Smoke Test — exercises the full deliberation flow against the live API.
 *
 * Usage:
 *   cd packages/sdk && npm run build && npx tsx test/smoke.ts
 *
 * 10 agents (cached in .agents.json), each submits 1 idea + casts 1 vote.
 * 10 ideas → 2 cells of 5 → close() → champion.
 */

import { UnityChant, UCError } from '../dist/index.mjs'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const BASE = 'https://unitychant.com'
const AGENT_COUNT = 10
const __dirname = dirname(fileURLToPath(import.meta.url))
const AGENT_CACHE = join(__dirname, '.agents.json')

interface CachedAgent {
  apiKey: string
  agentId: string
  name: string
}

async function loadOrRegisterAgents(): Promise<{ apiKey: string; agentId: string; name: string; client: UnityChant }[]> {
  let cached: CachedAgent[] = []

  if (existsSync(AGENT_CACHE)) {
    try {
      cached = JSON.parse(readFileSync(AGENT_CACHE, 'utf-8'))
      console.log(`   Loaded ${cached.length} cached agents`)
    } catch {
      cached = []
    }
  }

  while (cached.length < AGENT_COUNT) {
    const i = cached.length
    const reg = await UnityChant.register({ name: `smoke-agent-${i}` }, BASE)
    cached.push({ apiKey: reg.apiKey, agentId: reg.agentId, name: reg.name })
    console.log(`   Registered agent ${i}: ${reg.agentId}`)
  }

  writeFileSync(AGENT_CACHE, JSON.stringify(cached, null, 2))

  return cached.map(a => ({
    ...a,
    client: new UnityChant({ apiKey: a.apiKey, baseUrl: BASE }),
  }))
}

async function main() {
  console.log('=== SDK Smoke Test ===\n')

  // 1. Load agents
  console.log('1. Loading agents...')
  const agents = await loadOrRegisterAgents()
  console.log(`   ${agents.length} agents ready\n`)

  const facilitator = agents[0]

  // 2. Create chant
  console.log('2. Creating chant...')
  const chant = await facilitator.client.createChant({
    question: `SDK smoke test — ${Date.now()}`,
    description: 'Automated test, safe to delete',
    fastCell: true,
    cellSize: 5,
    tags: ['smoke-test'],
  })
  console.log(`   Chant: ${chant.id}\n`)

  // 3. Each agent joins + submits 1 idea
  console.log('3. Joining + submitting 1 idea each...')
  for (let i = 0; i < agents.length; i++) {
    await agents[i].client.join(chant.id)
    await agents[i].client.submitIdea(chant.id, {
      text: `Idea ${i}: ${randomWord()} ${randomWord()} strategy`,
    })
    console.log(`   Agent ${i}: joined + idea submitted`)
  }
  console.log()

  // 4. Start voting
  console.log('4. Starting voting...')
  const startResult = await facilitator.client.startVoting(chant.id)
  console.log(`   Started: ${startResult.started}\n`)
  await sleep(2000)

  // 5. Each agent enters cell + votes (1 vote each)
  console.log('5. Entering cells + voting...')
  for (let i = 0; i < agents.length; i++) {
    const entry = await agents[i].client.enterCell(chant.id)
    const ideas = entry.cell.ideas
    console.log(`   Agent ${i}: cell ...${entry.cell.id.slice(-6)} (${ideas.length} ideas, ${entry.cell.voterCount}/${entry.cell.votersNeeded})`)

    const allocations = [
      { ideaId: ideas[0].id, points: 7 },
      { ideaId: ideas[Math.min(1, ideas.length - 1)].id, points: 2 },
      { ideaId: ideas[Math.min(2, ideas.length - 1)].id, points: 1 },
    ]
    const vote = await agents[i].client.vote(chant.id, { allocations })
    console.log(`   Agent ${i}: voted (allVoted: ${vote.allVoted})`)
    await sleep(300)
  }
  console.log()

  // 6. Check status + close
  console.log('6. Checking status...')
  await sleep(5000)
  let status = await facilitator.client.getStatus(chant.id)
  console.log(`   Phase: ${status.phase}, Tier: ${status.currentTier}, Cells: ${status.cells.length}`)

  while (status.phase !== 'COMPLETED') {
    console.log('   Calling close()...')
    const closeResult = await facilitator.client.close(chant.id)
    console.log(`   Closed ${closeResult.closedCells} cells → phase: ${closeResult.phase}`)
    await sleep(3000)
    status = await facilitator.client.getStatus(chant.id)
  }

  if (status.champion) {
    console.log(`   CHAMPION: "${status.champion.text}"`)
  }
  console.log()

  // 7. Error handling
  console.log('7. Testing UCError...')
  try {
    await facilitator.client.vote('nonexistent', {
      allocations: [{ ideaId: 'x', points: 10 }],
    })
    console.log('   FAIL: Should have thrown!')
  } catch (err) {
    if (err instanceof UCError) {
      console.log(`   UCError: status=${err.status} ✓`)
    }
  }

  // 8. listChants
  console.log('\n8. listChants...')
  const list = await facilitator.client.listChants({ limit: 3 })
  console.log(`   ${list.total} total chants`)

  // 9. Reputation
  console.log('\n9. getReputation...')
  const rep = await facilitator.client.getReputation(facilitator.agentId)
  console.log(`   ${rep.name}: foresight=${rep.foresightScore}, votes=${rep.stats.totalVotesCast}`)

  console.log('\n=== SMOKE TEST COMPLETE ===')
}

function randomWord(): string {
  const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'theta', 'kappa', 'lambda', 'sigma', 'omega', 'phoenix', 'nexus', 'prism', 'quantum', 'vortex']
  return words[Math.floor(Math.random() * words.length)]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main().catch(err => {
  console.error('\nFATAL:', err)
  process.exit(1)
})
