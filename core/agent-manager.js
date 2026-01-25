// Agent Manager - Orchestrates AI agents for deliberation and voting
// Manages multiple agents across cells and tiers

const { AIAgent } = require('./ai-agent')

class AgentManager {
  constructor(engine) {
    this.engine = engine
    this.agents = []
  }

  /**
   * Spawn AI agents with diverse personalities
   * @param {number} count - Number of agents to spawn
   * @param {object} personalityDistribution - Optional personality distribution
   * @param {string} topic - Topic for agents to propose ideas about
   */
  async spawnAgents(count, personalityDistribution = null, topic = 'improving our city') {
    const defaultDistribution = {
      progressive: 0.25,
      conservative: 0.20,
      balanced: 0.30,
      pragmatic: 0.15,
      idealistic: 0.10
    }

    const distribution = personalityDistribution || defaultDistribution

    // Build personality pool based on distribution
    const personalityPool = []
    Object.entries(distribution).forEach(([type, ratio]) => {
      const num = Math.floor(count * ratio)
      for (let i = 0; i < num; i++) {
        personalityPool.push(type)
      }
    })

    // Fill remaining to reach exact count
    while (personalityPool.length < count) {
      personalityPool.push('balanced')
    }

    // Shuffle for variety
    personalityPool.sort(() => Math.random() - 0.5)

    console.log(`\n🤖 Spawning ${count} AI agents with diverse personalities...`)
    console.log(`📝 Topic: ${topic}\n`)

    // Create agents and add to engine
    for (let i = 0; i < count; i++) {
      const personality = personalityPool[i]
      const agent = new AIAgent(
        `agent-${i + 1}`,
        `Agent ${i + 1}`,
        personality
      )

      this.agents.push(agent)

      // Register with engine as participant
      this.engine.addParticipant({
        id: agent.id,
        name: agent.name,
        type: 'ai-agent',
        personality: agent.personality
      })

      // Agent generates their own idea based on topic and personality
      console.log(`   🤔 ${agent.name} (${personality}) generating idea...`)
      const ideaText = await agent.generateIdea(topic)

      this.engine.addIdea({
        text: ideaText,
        author: agent.name,
        authorId: agent.id
      })

      console.log(`      💡 "${ideaText}"`)
    }

    console.log(`\n✅ ${count} agents spawned with real ideas!\n`)
    return this.agents
  }

  /**
   * Run deliberation phase for a specific cell
   * Agents discuss ideas before voting
   */
  async deliberateCell(cellId, durationMs = 10000) {
    const cell = this.engine.cells.find(c => c.id === cellId)
    if (!cell) {
      throw new Error(`Cell ${cellId} not found`)
    }

    const cellAgents = this.agents.filter(a =>
      cell.participants.includes(a.id)
    )

    const ideas = cell.ideaIds.map(ideaId =>
      this.engine.ideas.find(i => i.id === ideaId)
    )

    console.log(`\n💬 Deliberation starting in ${cellId}...`)
    console.log(`   Participants: ${cellAgents.length}`)
    console.log(`   Ideas: ${ideas.length}`)
    console.log(`   Duration: ${durationMs / 1000}s\n`)

    // Phase 1: Initial thoughts (ONLY - single comment per agent to save API costs)
    console.log('📝 Initial Thoughts (max 100 chars each)\n')

    for (const agent of cellAgents) {
      const thought = await agent.formInitialThoughts(cell, ideas)

      this.engine.addComment(cellId, agent.id, thought)
      console.log(`${agent.name} (${agent.personality}):`)
      console.log(`   "${thought}"\n`)

      // Small delay for realism
      await this.sleep(500)
    }

    // Phase 2: Discussion - DISABLED to save API costs

    console.log(`✅ Deliberation complete in ${cellId}\n`)
  }

  /**
   * All agents in a cell vote after deliberation
   */
  async voteCell(cellId) {
    const cell = this.engine.cells.find(c => c.id === cellId)
    if (!cell) {
      throw new Error(`Cell ${cellId} not found`)
    }

    const cellAgents = this.agents.filter(a =>
      cell.participants.includes(a.id)
    )

    const ideas = cell.ideaIds.map(ideaId =>
      this.engine.ideas.find(i => i.id === ideaId)
    )

    const allComments = this.engine.getCellComments(cellId).map(c => ({
      ...c,
      participantName: this.agents.find(a => a.id === c.participantId)?.name || c.participantId
    }))

    console.log(`🗳️  Voting in ${cellId}...\n`)

    for (const agent of cellAgents) {
      const ideaId = await agent.decideVote(cell, ideas, allComments)

      this.engine.castVote(cellId, agent.id, ideaId)
      console.log(`   ${agent.name} voted for ${ideaId}`)
    }

    console.log(`\n✅ Voting complete in ${cellId}\n`)
  }

  /**
   * Run full deliberation + voting for all cells in current tier
   */
  async runTierDeliberation(tier, sequential = false) {
    const tierCells = this.engine.cells.filter(c =>
      c.tier === tier && c.status === 'voting'
    )

    console.log(`\n${'='.repeat(60)}`)
    console.log(`TIER ${tier} - DELIBERATION & VOTING`)
    console.log('='.repeat(60))
    console.log(`Cells: ${tierCells.length}`)
    console.log(`Participants: ${this.engine.participants.length}`)
    console.log(`Ideas: ${this.engine.getIdeasByTier(tier).length}\n`)

    if (sequential) {
      // One cell at a time (for demo watching)
      for (const cell of tierCells) {
        await this.deliberateCell(cell.id, 5000)  // 5s per cell
        await this.voteCell(cell.id)
      }
    } else {
      // All cells in parallel (faster, realistic)
      await Promise.all(
        tierCells.map(cell =>
          this.deliberateCell(cell.id, 10000).then(() =>
            this.voteCell(cell.id)
          )
        )
      )
    }

    console.log(`🎉 Tier ${tier} deliberation and voting complete!\n`)
  }

  /**
   * Run complete multi-tier demo (full voting process)
   */
  async runFullDemo(sequential = false) {
    console.log('\n' + '='.repeat(60))
    console.log('🚀 STARTING FULL DEMO')
    console.log('='.repeat(60))
    console.log(`Agents: ${this.agents.length}`)
    console.log(`Ideas: ${this.engine.ideas.length}`)
    console.log(`Mode: ${sequential ? 'Sequential (watch each cell)' : 'Parallel (fast)'}\n`)

    // Start voting (form Tier 1 cells)
    this.engine.startVoting()

    let currentTier = 1
    const maxTiers = 10 // Safety limit

    while (this.engine.phase === 'voting' && currentTier <= maxTiers) {
      // Run deliberation and voting for this tier
      await this.runTierDeliberation(currentTier, sequential)

      // Complete tier (advance winners)
      const result = this.engine.completeTier(currentTier)

      if (result.winner) {
        console.log('\n' + '='.repeat(60))
        console.log(`🏆 WINNER DECLARED!`)
        console.log('='.repeat(60))
        console.log(`Idea: ${result.winner.id}`)
        console.log(`Text: ${result.winner.text}`)
        console.log(`Tier: ${currentTier}`)
        if (result.winner.totalVotes) {
          console.log(`Total Votes: ${result.winner.totalVotes}`)
        }
        console.log('='.repeat(60) + '\n')
        break
      } else {
        console.log(`➡️  ${result.advancingIdeas} ideas advance to Tier ${result.nextTier}\n`)
        currentTier = result.nextTier
      }
    }

    console.log('✅ Demo complete!\n')
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId) {
    return this.agents.find(a => a.id === agentId)
  }

  /**
   * Get all agents
   */
  getAllAgents() {
    return this.agents
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = { AgentManager }
