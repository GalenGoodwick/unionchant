# Union Chant v8 - Deliberative Architecture
## AI Agents → Real People Evolution

---

## Core Insight

**Auto-vote is not a feature, it's a placeholder.**

The real system requires:
1. **Deliberation** - Discussion within cells before voting
2. **AI Agents** - Haiku-powered agents that read, discuss, and vote (demo phase)
3. **Real People** - Email-verified users who deliberate and vote (production phase)

---

## Architecture Evolution

### Phase 1: AI Deliberation (Demo-Ready)
- ✅ Extract core logic (preserve proven algorithms)
- ✅ Build cell discussion system (comments, threads)
- ✅ Create AI agents using Claude Haiku (cost-efficient)
- ✅ AI agents read ideas, post thoughts, vote
- ✅ React frontend shows live deliberation + voting
- ✅ Realistic demo without needing 100 real people

### Phase 2: Human Deliberation (Production)
- ✅ Add email verification
- ✅ User authentication (session management)
- ✅ Replace AI agents with real users
- ✅ Same UI, same process
- ✅ Real democratic decision-making

---

## Component Breakdown

### 1. Core Logic (Preserved from v7-STABLE)

**File:** `core/union-chant-engine.js`

```javascript
class UnionChantEngine {
  constructor() {
    this.participants = []
    this.ideas = []
    this.cells = []
    this.votes = []
    this.comments = []  // NEW: Cell discussion
    this.phase = 'submission'
    this.currentTier = 1
  }

  // Existing methods (preserved)
  addParticipant(participant) { /* ... */ }
  addIdea(idea) { /* ... */ }
  startVoting() { /* forms cells */ }
  castVote(cellId, participantId, ideaId) { /* ... */ }
  completeTier(tier) { /* natural reduction logic */ }

  // NEW: Deliberation methods
  addComment(cellId, participantId, text, replyTo = null) {
    const comment = {
      id: `comment-${this.comments.length + 1}`,
      cellId,
      participantId,
      text,
      replyTo,  // For threading
      timestamp: Date.now()
    }
    this.comments.push(comment)
    return comment
  }

  getCellComments(cellId) {
    return this.comments.filter(c => c.cellId === cellId)
  }

  getCellParticipants(cellId) {
    const cell = this.cells.find(c => c.id === cellId)
    return cell ? cell.participants : []
  }
}
```

---

### 2. AI Agent System (Haiku-Powered)

**File:** `core/ai-agent.js`

```javascript
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

class AIAgent {
  constructor(id, name, personality = 'balanced') {
    this.id = id
    this.name = name
    this.personality = personality  // 'progressive', 'conservative', 'balanced', etc.
    this.conversationHistory = []
    this.preferences = {}
  }

  /**
   * Agent reads ideas in their cell and forms initial thoughts
   */
  async formInitialThoughts(cell, ideas) {
    const ideaTexts = ideas.map(i => `- ${i.id}: ${i.text}`).join('\n')

    const prompt = `You are ${this.name}, a participant in a democratic decision-making process.

Your cell is discussing these ideas:
${ideaTexts}

You have a ${this.personality} perspective. Read these ideas and share your initial thoughts in 2-3 sentences. Be constructive and specific about what appeals to you or concerns you.`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-3-5-20241022',  // Haiku for cost efficiency
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })

    return response.content[0].text
  }

  /**
   * Agent reads cell discussion and responds
   */
  async participate(cell, ideas, recentComments) {
    const ideaTexts = ideas.map(i => `- ${i.id}: ${i.text}`).join('\n')
    const discussionSummary = recentComments
      .slice(-5)  // Last 5 comments
      .map(c => `${c.participantName}: ${c.text}`)
      .join('\n')

    const prompt = `You are ${this.name} in a deliberative discussion.

Ideas being considered:
${ideaTexts}

Recent discussion:
${discussionSummary}

Respond to the discussion. You can:
- Ask a clarifying question
- Express support for an idea with reasoning
- Raise a concern about an idea
- Build on someone else's point

Keep it to 1-2 sentences. Be thoughtful and specific.`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-3-5-20241022',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })

    return response.content[0].text
  }

  /**
   * After deliberation, agent chooses which idea to vote for
   */
  async decideVote(cell, ideas, allComments) {
    const ideaTexts = ideas.map((i, idx) => `${idx + 1}. ${i.id}: ${i.text}`).join('\n')

    const discussionSummary = allComments
      .map(c => `${c.participantName}: ${c.text}`)
      .join('\n')

    const prompt = `You are ${this.name}. After deliberating with your cell, you must now vote.

Ideas:
${ideaTexts}

Discussion that happened:
${discussionSummary}

Based on the discussion and your ${this.personality} values, which idea do you vote for?

Respond ONLY with the idea ID (like "idea-5"). No explanation needed.`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-3-5-20241022',
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })

    // Extract idea ID from response
    const voteText = response.content[0].text.trim()
    const ideaId = voteText.match(/idea-\d+/)?.[0]

    return ideaId || ideas[0].id  // Fallback to first idea if parsing fails
  }
}

module.exports = { AIAgent }
```

**Cost Analysis:**
- Haiku: ~$0.25 per million input tokens, ~$1.25 per million output tokens
- Per agent per tier: ~500 input + 150 output tokens = ~$0.0003
- 100 agents, 4 tiers: ~$0.12 total
- Very affordable for demos!

---

### 3. Agent Manager (Orchestration)

**File:** `core/agent-manager.js`

```javascript
const { AIAgent } = require('./ai-agent')

class AgentManager {
  constructor(engine) {
    this.engine = engine
    this.agents = []
  }

  /**
   * Spawn AI agents with diverse personalities
   */
  async spawnAgents(count, personalityDistribution = null) {
    const personalities = personalityDistribution || {
      progressive: 0.3,
      conservative: 0.2,
      balanced: 0.4,
      libertarian: 0.1
    }

    const personalityPool = []
    Object.entries(personalities).forEach(([type, ratio]) => {
      const num = Math.floor(count * ratio)
      for (let i = 0; i < num; i++) {
        personalityPool.push(type)
      }
    })

    // Fill remaining to reach exact count
    while (personalityPool.length < count) {
      personalityPool.push('balanced')
    }

    // Shuffle
    personalityPool.sort(() => Math.random() - 0.5)

    // Create agents
    for (let i = 0; i < count; i++) {
      const agent = new AIAgent(
        `agent-${i + 1}`,
        `Agent ${i + 1}`,
        personalityPool[i]
      )

      this.agents.push(agent)

      // Register with engine
      this.engine.addParticipant({
        id: agent.id,
        name: agent.name,
        type: 'ai-agent',
        personality: agent.personality
      })

      // Each agent submits an idea
      this.engine.addIdea({
        text: `Idea from ${agent.name}`,
        authorId: agent.id,
        author: agent.name
      })
    }

    return this.agents
  }

  /**
   * Run deliberation phase for a cell
   */
  async deliberateCell(cellId, durationMs = 10000) {
    const cell = this.engine.cells.find(c => c.id === cellId)
    if (!cell) return

    const cellAgents = this.agents.filter(a =>
      cell.participants.includes(a.id)
    )

    const ideas = cell.ideaIds.map(ideaId =>
      this.engine.ideas.find(i => i.id === ideaId)
    )

    console.log(`🗣️  Deliberation starting in ${cellId}...`)

    // Phase 1: Initial thoughts (all agents speak once)
    for (const agent of cellAgents) {
      const thought = await agent.formInitialThoughts(cell, ideas)

      this.engine.addComment(cellId, agent.id, thought)
      console.log(`   ${agent.name}: ${thought}`)

      // Small delay for realism
      await this.sleep(500)
    }

    // Phase 2: Discussion (agents respond to each other)
    const startTime = Date.now()
    const discussionDuration = durationMs - (cellAgents.length * 500)

    while (Date.now() - startTime < discussionDuration) {
      // Pick random agent to speak
      const agent = cellAgents[Math.floor(Math.random() * cellAgents.length)]

      const recentComments = this.engine.getCellComments(cellId)
        .slice(-10)
        .map(c => ({
          ...c,
          participantName: this.agents.find(a => a.id === c.participantId)?.name || c.participantId
        }))

      const response = await agent.participate(cell, ideas, recentComments)

      this.engine.addComment(cellId, agent.id, response)
      console.log(`   ${agent.name}: ${response}`)

      await this.sleep(1000)
    }

    console.log(`✅ Deliberation complete in ${cellId}`)
  }

  /**
   * All agents in a cell vote after deliberation
   */
  async voteCell(cellId) {
    const cell = this.engine.cells.find(c => c.id === cellId)
    if (!cell) return

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

    console.log(`🗳️  Voting in ${cellId}...`)

    for (const agent of cellAgents) {
      const ideaId = await agent.decideVote(cell, ideas, allComments)

      this.engine.castVote(cellId, agent.id, ideaId)
      console.log(`   ${agent.name} voted for ${ideaId}`)
    }

    console.log(`✅ Voting complete in ${cellId}`)
  }

  /**
   * Run full deliberation + voting for all cells in current tier
   */
  async runTierDeliberation(tier, sequential = false) {
    const tierCells = this.engine.cells.filter(c =>
      c.tier === tier && c.status === 'voting'
    )

    if (sequential) {
      // One cell at a time (for demo watching)
      for (const cell of tierCells) {
        await this.deliberateCell(cell.id, 5000)  // 5s per cell
        await this.voteCell(cell.id)
      }
    } else {
      // All cells in parallel (faster)
      await Promise.all(
        tierCells.map(cell =>
          this.deliberateCell(cell.id, 10000).then(() =>
            this.voteCell(cell.id)
          )
        )
      )
    }

    console.log(`🎉 Tier ${tier} deliberation and voting complete!`)
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = { AgentManager }
```

---

### 4. Server API (Enhanced)

**File:** `server/server-v8-deliberative.js`

```javascript
const express = require('express')
const http = require('http')
const socketIO = require('socket.io')
const { UnionChantEngine } = require('../core/union-chant-engine')
const { AgentManager } = require('../core/agent-manager')

const app = express()
const server = http.createServer(app)
const io = socketIO(server, {
  cors: { origin: '*' }
})

app.use(express.json())
app.use(express.static('public'))

const engine = new UnionChantEngine()
const agentManager = new AgentManager(engine)

// WebSocket: Broadcast state changes
function broadcastState() {
  io.emit('state-update', engine.getState())
}

function broadcastComment(comment) {
  io.emit('comment-added', comment)
}

function broadcastVote(vote) {
  io.emit('vote-cast', vote)
}

// === API Endpoints ===

// Reset system
app.post('/api/reset', (req, res) => {
  engine.reset()
  agentManager.agents = []
  broadcastState()
  res.json({ success: true })
})

// Spawn AI agents
app.post('/api/agents/spawn', async (req, res) => {
  const { count = 25, personalities } = req.body

  await agentManager.spawnAgents(count, personalities)
  broadcastState()

  res.json({
    success: true,
    agentCount: count,
    participants: engine.participants.length
  })
})

// Start voting (form cells)
app.post('/api/start-voting', (req, res) => {
  const result = engine.startVoting()
  broadcastState()

  res.json(result)
})

// Run deliberation for specific cell
app.post('/api/cells/:cellId/deliberate', async (req, res) => {
  const { cellId } = req.params
  const { duration = 10000 } = req.body

  // Run async, respond immediately
  res.json({ success: true, message: 'Deliberation started' })

  await agentManager.deliberateCell(cellId, duration)
  broadcastState()
})

// Run voting for specific cell
app.post('/api/cells/:cellId/vote', async (req, res) => {
  const { cellId } = req.params

  res.json({ success: true, message: 'Voting started' })

  await agentManager.voteCell(cellId)
  broadcastState()
})

// Run full tier deliberation + voting
app.post('/api/tiers/:tier/run', async (req, res) => {
  const { tier } = req.params
  const { sequential = false } = req.body

  res.json({ success: true, message: 'Tier deliberation started' })

  await agentManager.runTierDeliberation(parseInt(tier), sequential)
  broadcastState()
})

// Complete tier (advance winners)
app.post('/api/tiers/:tier/complete', (req, res) => {
  const { tier } = req.params
  const result = engine.completeTier(parseInt(tier))
  broadcastState()

  res.json(result)
})

// Get current state
app.get('/api/state', (req, res) => {
  res.json(engine.getState())
})

// Get cell comments
app.get('/api/cells/:cellId/comments', (req, res) => {
  const { cellId } = req.params
  const comments = engine.getCellComments(cellId)
  res.json(comments)
})

// Manual comment (for when real people join)
app.post('/api/cells/:cellId/comments', (req, res) => {
  const { cellId } = req.params
  const { participantId, text, replyTo } = req.body

  const comment = engine.addComment(cellId, participantId, text, replyTo)
  broadcastComment(comment)

  res.json(comment)
})

// Manual vote (for when real people join)
app.post('/api/vote', (req, res) => {
  const { cellId, participantId, ideaId } = req.body

  const vote = engine.castVote(cellId, participantId, ideaId)
  broadcastVote(vote)
  broadcastState()

  res.json(vote)
})

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected')

  // Send current state immediately
  socket.emit('state-update', engine.getState())

  socket.on('disconnect', () => {
    console.log('Client disconnected')
  })
})

const PORT = 3009
server.listen(PORT, () => {
  console.log(`🚀 Union Chant v8 (Deliberative) running at http://localhost:${PORT}`)
  console.log('')
  console.log('NEW FEATURES:')
  console.log('1. AI agents powered by Claude Haiku')
  console.log('2. Cell-based deliberation and discussion')
  console.log('3. Real-time WebSocket updates')
  console.log('4. Path to real people with email verification')
})
```

---

### 5. React Frontend Structure

**Key Components:**

#### A. `<CellDiscussion>` - Show live deliberation

```jsx
import { useEffect, useState } from 'react'
import io from 'socket.io-client'

function CellDiscussion({ cellId }) {
  const [comments, setComments] = useState([])
  const [socket, setSocket] = useState(null)

  useEffect(() => {
    const newSocket = io('http://localhost:3009')
    setSocket(newSocket)

    // Listen for new comments
    newSocket.on('comment-added', (comment) => {
      if (comment.cellId === cellId) {
        setComments(prev => [...prev, comment])
      }
    })

    // Load existing comments
    fetch(`/api/cells/${cellId}/comments`)
      .then(res => res.json())
      .then(setComments)

    return () => newSocket.close()
  }, [cellId])

  return (
    <div className="cell-discussion">
      <h3>Cell Discussion</h3>
      <div className="comments-thread">
        {comments.map(comment => (
          <div key={comment.id} className="comment">
            <strong>{comment.participantName}:</strong>
            <p>{comment.text}</p>
            <span className="timestamp">
              {new Date(comment.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

#### B. `<CellView>` - Show deliberation + voting

```jsx
function CellView({ cell }) {
  const [phase, setPhase] = useState('deliberating') // or 'voting' or 'completed'

  return (
    <div className="cell-view">
      <div className="cell-header">
        <h2>{cell.id}</h2>
        <span className="phase-badge">{phase}</span>
      </div>

      <div className="participants">
        {cell.participants.map(p => (
          <ParticipantBadge key={p.id} participant={p} />
        ))}
      </div>

      <div className="ideas-list">
        {cell.ideas.map(idea => (
          <IdeaCard key={idea.id} idea={idea} />
        ))}
      </div>

      {phase === 'deliberating' && (
        <CellDiscussion cellId={cell.id} />
      )}

      {phase === 'voting' && (
        <VotingInterface cell={cell} />
      )}

      {phase === 'completed' && (
        <CellResults cell={cell} />
      )}
    </div>
  )
}
```

#### C. `<DemoControls>` - Run AI scenarios

```jsx
function DemoControls() {
  const [running, setRunning] = useState(false)

  async function runDemo() {
    setRunning(true)

    // 1. Reset
    await fetch('/api/reset', { method: 'POST' })

    // 2. Spawn 25 AI agents
    await fetch('/api/agents/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 25 })
    })

    // 3. Start voting (form cells)
    await fetch('/api/start-voting', { method: 'POST' })

    // 4. Run Tier 1 deliberation + voting
    await fetch('/api/tiers/1/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequential: true })
    })

    // 5. Complete Tier 1
    await fetch('/api/tiers/1/complete', { method: 'POST' })

    // Continue for more tiers...

    setRunning(false)
  }

  return (
    <div className="demo-controls">
      <button onClick={runDemo} disabled={running}>
        {running ? 'Demo Running...' : 'Run AI Demo'}
      </button>
    </div>
  )
}
```

---

### 6. Future: Email Verification (Phase 2)

**File:** `server/auth.js`

```javascript
// When ready for real people
const nodemailer = require('nodemailer')

async function createUser(email, name) {
  // 1. Generate verification token
  const token = generateToken()

  // 2. Store in database
  await db.users.insert({
    email,
    name,
    verified: false,
    verificationToken: token,
    createdAt: Date.now()
  })

  // 3. Send verification email
  await sendVerificationEmail(email, token)
}

async function verifyUser(token) {
  const user = await db.users.findOne({ verificationToken: token })

  if (user) {
    await db.users.update(user.id, { verified: true })
    return user
  }

  return null
}

// Then replace AI agents with real users in engine
```

---

## Development Roadmap

### Week 1: Core + AI Agents
- ✅ Extract core logic to module
- ✅ Build AI agent system (Haiku)
- ✅ Add deliberation/comment system
- ✅ Test with 25 agents locally

### Week 2: Server + WebSocket
- ✅ Enhanced server with WebSocket
- ✅ Agent manager orchestration
- ✅ Real-time event broadcasting
- ✅ API endpoints for agents/cells

### Week 3: React Frontend
- ✅ Set up React app
- ✅ Cell discussion component
- ✅ Live voting visualization
- ✅ Demo control interface

### Week 4: Polish + Testing
- ✅ Visual improvements
- ✅ Different agent personalities
- ✅ Preset scenarios (25, 100, 1000)
- ✅ Cost optimization

### Future: Real People
- 🔜 Email verification
- 🔜 User authentication
- 🔜 Replace agents with users
- 🔜 Production deployment

---

## Cost Projection

**Demo with 100 AI agents, 4 tiers:**
- ~400 Haiku API calls
- ~200K total tokens
- Cost: **~$0.25 per full demo**
- 100 demos per month: **~$25**

Very affordable for showcasing the system!

---

## Next Immediate Step

Should I:
1. **Extract core logic** into module (foundation)
2. **Build AI agent system** (get deliberation working)
3. **Set up React boilerplate** (frontend foundation)
4. **Create simple prototype** (one cell, 5 AI agents, show discussion + voting)

Tell me which to start with and I'll begin building.
