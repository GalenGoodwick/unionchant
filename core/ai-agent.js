// AI Agent - Claude Haiku powered participant
// Reads ideas, participates in discussion, and votes based on deliberation

const Anthropic = require('@anthropic-ai/sdk')

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

class AIAgent {
  constructor(id, name, personality = 'balanced') {
    this.id = id
    this.name = name
    this.personality = personality  // 'progressive', 'conservative', 'balanced', 'pragmatic', 'idealistic'
    this.conversationHistory = []
    this.votingRecord = []
  }

  /**
   * Generate a policy idea based on topic and personality
   * This happens when agent joins - they propose their own idea
   */
  async generateIdea(topic) {
    const prompt = `You are proposing a policy idea for: ${topic}

Your perspective is ${this.personality}. Propose ONE specific, concrete policy idea that reflects your values.

Requirements:
- Keep it to one clear sentence (10-15 words max)
- Be specific and actionable
- Don't explain or justify it
- Just state the policy idea itself

Example good responses:
- "Expand light rail network to connect all major neighborhoods"
- "Increase bus frequency during peak hours"
- "Make all public buses free for riders"

Your ${this.personality} policy idea:`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })

      const idea = response.content[0].text.trim()
      // Remove quotes if present
      return idea.replace(/^["']|["']$/g, '')

    } catch (error) {
      console.error(`Error in ${this.name} generateIdea:`, error.message)
      return `Policy idea from ${this.name}`
    }
  }

  /**
   * Agent reads ideas in their cell and forms initial thoughts
   * This is the first thing agents do when a cell discussion starts
   */
  async formInitialThoughts(cell, ideas) {
    const ideaTexts = ideas.map(i => `- ${i.id}: ${i.text}`).join('\n')

    const prompt = `You are ${this.name}, a participant in a democratic decision-making process. You're in a small discussion group (cell) with 3-7 other people.

Your cell is discussing these ideas:
${ideaTexts}

You have a ${this.personality} perspective. Share your initial thought in ONE brief sentence (max 100 characters). Be specific about what appeals to you or concerns you.

Speak naturally.`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',  // Cost-efficient Haiku
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })

      const thought = response.content[0].text.slice(0, 100)
      this.conversationHistory.push({ role: 'thought', text: thought })
      return thought

    } catch (error) {
      console.error(`Error in ${this.name} formInitialThoughts:`, error.message)
      return `I'm thinking about these ideas...`
    }
  }

  /**
   * Agent reads recent discussion and responds
   * This happens during the deliberation phase
   */
  async participate(cell, ideas, recentComments) {
    const ideaTexts = ideas.map(i => `- ${i.id}: ${i.text}`).join('\n')

    const discussionSummary = recentComments
      .slice(-5)  // Last 5 comments
      .map(c => `${c.participantName}: ${c.text}`)
      .join('\n')

    const prompt = `You are ${this.name} in a small group discussion about which idea to support.

Ideas being considered:
${ideaTexts}

Recent discussion:
${discussionSummary}

Respond to the discussion. You can:
- Ask a clarifying question about an idea
- Express support for an idea with reasoning
- Raise a concern about an idea
- Build on someone else's point
- Compare two ideas

Keep it to 1-2 sentences. Speak naturally, like a real person. Your perspective is ${this.personality}.`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })

      const comment = response.content[0].text
      this.conversationHistory.push({ role: 'comment', text: comment })
      return comment

    } catch (error) {
      console.error(`Error in ${this.name} participate:`, error.message)
      return `I see what you mean.`
    }
  }

  /**
   * After deliberation, agent decides which idea to vote for
   * This is the final decision based on all the discussion
   */
  async decideVote(cell, ideas, allComments) {
    // Defensive: ensure we have ideas
    if (!ideas || ideas.length === 0) {
      console.error(`${this.name}: No ideas available to vote on!`)
      return null
    }

    // Logic-based voting with randomness for realistic vote distribution
    let matchingIdeas = []
    let chosenIdea

    // Find ideas that match personality (collect ALL matches, not just first)
    if (this.personality === 'progressive') {
      matchingIdeas = ideas.filter(i =>
        /affordable|equity|climate|electric|green|congestion pricing|income|fare|subsid/i.test(i.text)
      )
    } else if (this.personality === 'conservative') {
      matchingIdeas = ideas.filter(i =>
        /privatize|efficient|cost|reduce spending|partner|private/i.test(i.text)
      )
    } else if (this.personality === 'pragmatic') {
      matchingIdeas = ideas.filter(i =>
        /implement|dedicated|specific|arterial|major|lane|signal/i.test(i.text)
      )
    } else if (this.personality === 'idealistic') {
      matchingIdeas = ideas.filter(i =>
        /comprehensive|transform|bold|citywide|protected|bike|zero.emission/i.test(i.text)
      )
    } else {
      // Balanced personality - consider all ideas
      matchingIdeas = ideas
    }

    // 20% chance to vote outside personality (simulates being persuaded by discussion)
    if (Math.random() < 0.2) {
      matchingIdeas = ideas
    }

    // Choose randomly from matching ideas (creates vote diversity)
    if (matchingIdeas.length > 0) {
      chosenIdea = matchingIdeas[Math.floor(Math.random() * matchingIdeas.length)]
    } else {
      // No matches - pick randomly from all ideas
      chosenIdea = ideas[Math.floor(Math.random() * ideas.length)]
    }

    const finalVote = chosenIdea.id

    this.votingRecord.push({
      cellId: cell.id,
      ideaId: finalVote,
      timestamp: Date.now()
    })

    return finalVote
  }

  /**
   * Get agent's conversation history
   */
  getHistory() {
    return this.conversationHistory
  }

  /**
   * Get agent's voting record
   */
  getVotingRecord() {
    return this.votingRecord
  }
}

module.exports = { AIAgent }
