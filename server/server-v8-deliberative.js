// Union Chant v8 - Deliberative Server
// Enhanced server with WebSocket for real-time AI agent deliberation

const express = require('express')
const http = require('http')
const socketIO = require('socket.io')
const cors = require('cors')
const { UnionChantEngine } = require('../core/union-chant-engine')
const { AgentManager } = require('../core/agent-manager')

const app = express()
const server = http.createServer(app)
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

app.use(cors())
app.use(express.json())

// Global engine and agent manager
let engine = new UnionChantEngine()
let agentManager = new AgentManager(engine)
let engineConfig = { votingTimeoutMs: 60000 }  // Default 1 minute
let aborted = false  // Global abort flag for stopping processes

// Broadcast state to all connected clients
function broadcastState() {
  const state = engine.getState()
  state.votingTimeoutMs = engineConfig.votingTimeoutMs  // Include timer config
  io.emit('state-update', state)
}

// Broadcast a comment
function broadcastComment(comment) {
  io.emit('comment-added', comment)
}

// Broadcast a vote
function broadcastVote(vote) {
  io.emit('vote-cast', vote)
}

// Broadcast tier completion
function broadcastTierComplete(result) {
  io.emit('tier-completed', result)
}

// === API ENDPOINTS ===

// Stop all running processes
app.post('/api/stop', (req, res) => {
  aborted = true
  console.log('🛑 Stop requested - aborting all processes')
  io.emit('process-stopped', { message: 'All processes stopped' })
  res.json({ success: true, message: 'Stop signal sent' })
})

// Reset system
app.post('/api/reset', (req, res) => {
  aborted = true  // Stop any running processes first
  const { votingTimeoutMs = 60000 } = req.body || {}
  engineConfig = { votingTimeoutMs }
  engine = new UnionChantEngine({ votingTimeoutMs })
  agentManager = new AgentManager(engine)
  // Clear abort flag after reset so new processes can run
  setTimeout(() => { aborted = false }, 100)
  broadcastState()
  res.json({ success: true, votingTimeoutMs })
})

// Spawn AI agents
app.post('/api/agents/spawn', async (req, res) => {
  const { count = 25, personalities, topic = 'improving our city' } = req.body

  try {
    await agentManager.spawnAgents(count, personalities, topic)
    broadcastState()

    res.json({
      success: true,
      agentCount: count,
      topic: topic,
      participants: engine.participants.length
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Start voting (form cells)
app.post('/api/start-voting', (req, res) => {
  try {
    const result = engine.startVoting()
    broadcastState()
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// Run deliberation for specific cell
app.post('/api/cells/:cellId/deliberate', async (req, res) => {
  const { cellId } = req.params
  const { duration = 10000 } = req.body

  res.json({ success: true, message: 'Deliberation started' })

  try {
    // Run deliberation (broadcasts comments in real-time)
    await runCellDeliberationWithBroadcast(cellId, duration)
    broadcastState()
  } catch (error) {
    console.error('Deliberation error:', error)
  }
})

// Helper function to run deliberation with real-time broadcasting
async function runCellDeliberationWithBroadcast(cellId, duration) {
  const cell = engine.cells.find(c => c.id === cellId)
  if (!cell) throw new Error(`Cell ${cellId} not found`)

  const cellAgents = agentManager.agents.filter(a =>
    cell.participants.includes(a.id)
  )

  const ideas = cell.ideaIds.map(ideaId =>
    engine.ideas.find(i => i.id === ideaId)
  )

  io.emit('deliberation-started', { cellId, participants: cellAgents.length, ideas: ideas.length })

  // Phase 1: Initial thoughts (ONLY - single comment per agent to save API costs)
  for (const agent of cellAgents) {
    if (aborted) {
      console.log(`⏹️ Deliberation aborted for ${cellId}`)
      return
    }
    const thought = await agent.formInitialThoughts(cell, ideas)
    if (aborted) return  // Check again after async call
    const comment = engine.addComment(cellId, agent.id, thought)

    broadcastComment({
      ...comment,
      participantName: agent.name,
      personality: agent.personality
    })

    await sleep(500)
  }

  // Phase 2: Discussion - DISABLED to save API costs
  // Each agent now speaks only once (Phase 1 only)

  io.emit('deliberation-completed', { cellId })
}

// Run voting for specific cell
app.post('/api/cells/:cellId/vote', async (req, res) => {
  const { cellId } = req.params

  res.json({ success: true, message: 'Voting started' })

  try {
    await runCellVotingWithBroadcast(cellId)
    broadcastState()
  } catch (error) {
    console.error('Voting error:', error)
  }
})

// Helper function to run voting with real-time broadcasting
async function runCellVotingWithBroadcast(cellId) {
  const cell = engine.cells.find(c => c.id === cellId)
  if (!cell) throw new Error(`Cell ${cellId} not found`)

  const cellAgents = agentManager.agents.filter(a =>
    cell.participants.includes(a.id)
  )

  const ideas = cell.ideaIds.map(ideaId =>
    engine.ideas.find(i => i.id === ideaId)
  )

  const allComments = engine.getCellComments(cellId).map(c => ({
    ...c,
    participantName: agentManager.agents.find(a => a.id === c.participantId)?.name || c.participantId
  }))

  io.emit('voting-started', { cellId })

  for (const agent of cellAgents) {
    if (aborted) {
      console.log(`⏹️ Voting aborted for ${cellId}`)
      return
    }
    const ideaId = await agent.decideVote(cell, ideas, allComments)
    if (aborted) return  // Check again after async call
    const vote = engine.castVote(cellId, agent.id, ideaId)

    broadcastVote({
      ...vote,
      participantName: agent.name,
      personality: agent.personality
    })

    await sleep(300)
  }

  if (!aborted) {
    io.emit('voting-completed', { cellId })
  }
}

// Run full tier deliberation + voting
app.post('/api/tiers/:tier/run', async (req, res) => {
  const tier = parseInt(req.params.tier)
  const { sequential = false } = req.body

  res.json({ success: true, message: 'Tier deliberation started' })

  try {
    const tierCells = engine.cells.filter(c => c.tier === tier && c.status === 'voting')

    io.emit('tier-started', { tier, cells: tierCells.length })

    if (sequential) {
      // One cell at a time
      for (const cell of tierCells) {
        if (aborted) {
          console.log(`⏹️ Tier ${tier} aborted`)
          return
        }
        await runCellDeliberationWithBroadcast(cell.id, 5000)
        await runCellVotingWithBroadcast(cell.id)
      }
    } else {
      // All cells in parallel
      await Promise.all(
        tierCells.map(cell =>
          runCellDeliberationWithBroadcast(cell.id, 10000).then(() =>
            runCellVotingWithBroadcast(cell.id)
          )
        )
      )
    }

    broadcastState()
  } catch (error) {
    console.error('Tier deliberation error:', error)
  }
})

// Complete tier (advance winners)
app.post('/api/tiers/:tier/complete', (req, res) => {
  const tier = parseInt(req.params.tier)

  try {
    const result = engine.completeTier(tier)
    broadcastTierComplete(result)
    broadcastState()
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
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

// WebSocket connection
io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id)

  // Send current state immediately
  socket.emit('state-update', engine.getState())

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id)
  })
})

// Helper function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Start server
const PORT = 3009
server.listen(PORT, () => {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 Union Chant v8 (Deliberative) Server')
  console.log('='.repeat(60))
  console.log(`\nServer: http://localhost:${PORT}`)
  console.log('WebSocket: Ready for real-time updates')
  console.log('\nFeatures:')
  console.log('  ✅ AI agents (Claude Haiku)')
  console.log('  ✅ Cell-based deliberation')
  console.log('  ✅ Real-time WebSocket updates')
  console.log('  ✅ Multi-tier progression')
  console.log('\nAPI Endpoints:')
  console.log('  POST /api/reset')
  console.log('  POST /api/agents/spawn')
  console.log('  POST /api/start-voting')
  console.log('  POST /api/cells/:cellId/deliberate')
  console.log('  POST /api/cells/:cellId/vote')
  console.log('  POST /api/tiers/:tier/run')
  console.log('  POST /api/tiers/:tier/complete')
  console.log('  GET  /api/state')
  console.log('\n' + '='.repeat(60) + '\n')
})
