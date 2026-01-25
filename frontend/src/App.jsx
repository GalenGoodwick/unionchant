import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import ProcessVisualization from './ProcessVisualization'
import './App.css'

const API_URL = 'http://localhost:3009'
const socket = io(API_URL)

function App() {
  const [state, setState] = useState(null)
  const [comments, setComments] = useState([])
  const [votes, setVotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [demoRunning, setDemoRunning] = useState(false)
  const [currentActivity, setCurrentActivity] = useState('')
  const [agentCount, setAgentCount] = useState(33)
  const [votingTimeoutSec, setVotingTimeoutSec] = useState(60)  // Default 1 minute
  const [topic, setTopic] = useState('improving public transportation in our city')
  const [abortController, setAbortController] = useState(null)
  const [winner, setWinner] = useState(null)

  // WebSocket listeners
  useEffect(() => {
    socket.on('state-update', (newState) => {
      setState(newState)
    })

    socket.on('comment-added', (comment) => {
      setComments(prev => [...prev, comment])
      // Activity updates removed - only showing cell/tier progress
    })

    socket.on('vote-cast', (vote) => {
      setVotes(prev => [...prev, vote])
      // Activity updates removed - only showing cell/tier progress
    })

    socket.on('deliberation-started', ({ cellId, participants, ideas }) => {
      // Activity updates removed - only showing cell/tier progress
    })

    socket.on('deliberation-completed', ({ cellId }) => {
      // Activity updates removed - only showing cell/tier progress
    })

    socket.on('voting-started', ({ cellId }) => {
      // Activity updates removed - only showing cell/tier progress
    })

    socket.on('voting-completed', ({ cellId }) => {
      setCurrentActivity(`✅ ${cellId} complete`)
    })

    socket.on('tier-started', ({ tier, cells }) => {
      setCurrentActivity(`📊 Tier ${tier} in progress (${cells} cells)`)
    })

    socket.on('tier-completed', (result) => {
      if (result.winner) {
        setCurrentActivity(`🏆 WINNER: ${result.winner.text}`)
        setWinner(result.winner)
      } else {
        setCurrentActivity(`➡️ ${result.advancingIdeas} ideas advance to Tier ${result.nextTier}`)
      }
    })

    return () => {
      socket.off('state-update')
      socket.off('comment-added')
      socket.off('vote-cast')
      socket.off('deliberation-started')
      socket.off('deliberation-completed')
      socket.off('voting-started')
      socket.off('voting-completed')
      socket.off('tier-started')
      socket.off('tier-completed')
    }
  }, [])

  // Stop demo
  const stopDemo = async () => {
    // Stop server-side processes first
    try {
      await fetch(`${API_URL}/api/stop`, { method: 'POST' })
    } catch (e) {
      console.log('Stop request failed:', e)
    }
    // Then abort frontend fetches
    if (abortController) {
      abortController.abort()
    }
    setDemoRunning(false)
    setLoading(false)
    setCurrentActivity('🛑 Demo stopped')
  }

  // Run quick demo
  const runQuickDemo = async () => {
    // Validate agent count
    if (!agentCount || agentCount < 5) {
      setCurrentActivity('❌ Error: Need at least 5 agents to run demo')
      setTimeout(() => setCurrentActivity(''), 3000)
      return
    }

    setLoading(true)
    setDemoRunning(true)
    setComments([])
    setVotes([])
    setWinner(null)

    const controller = new AbortController()
    setAbortController(controller)

    try {
      // Reset with timer config
      await fetch(`${API_URL}/api/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ votingTimeoutMs: votingTimeoutSec * 1000 })
      })
      setCurrentActivity('🔄 Initializing...')

      await sleep(500)

      // Spawn agents
      setCurrentActivity(`🤖 Spawning ${agentCount} AI agents...`)
      await fetch(`${API_URL}/api/agents/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: agentCount,
          topic: topic
        }),
        signal: controller.signal
      })

      await sleep(500)

      // Start voting
      setCurrentActivity('📊 Forming cells...')
      await fetch(`${API_URL}/api/start-voting`, { method: 'POST' })

      await sleep(500)

      // Run Tier 1
      setCurrentActivity('📊 Tier 1 in progress...')
      await fetch(`${API_URL}/api/tiers/1/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequential: false })
      })

      // Wait for deliberation to complete (it broadcasts in real-time)
      await sleep(15000)

      // Run tiers in a loop until winner is found
      let currentTier = 1
      let winner = null
      const maxTiers = 10 // Safety limit

      while (!winner && currentTier <= maxTiers) {
        // Complete current tier
        const tierResult = await fetch(`${API_URL}/api/tiers/${currentTier}/complete`, { method: 'POST' })
        const tierData = await tierResult.json()

        if (tierData.winner) {
          winner = tierData.winner
          setCurrentActivity(`🏆 WINNER: ${tierData.winner.text}`)
          break
        }

        // Advance to next tier
        currentTier++
        setCurrentActivity(`➡️ ${tierData.advancingIdeas} ideas advance to Tier ${currentTier}`)
        await sleep(1500)

        // Run next tier
        setCurrentActivity(`📊 Tier ${currentTier} in progress...`)
        await fetch(`${API_URL}/api/tiers/${currentTier}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sequential: false })
        })

        await sleep(15000)
      }

      if (!winner) {
        setCurrentActivity('⚠️ Max tiers reached without winner')
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Demo aborted by user')
      } else {
        console.error('Demo error:', error)
        setCurrentActivity(`❌ Error: ${error.message}`)
      }
    }

    setDemoRunning(false)
    setLoading(false)
    setAbortController(null)
  }

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  if (!state) {
    return (
      <div className="app">
        <div className="loading">Connecting to server...</div>
      </div>
    )
  }

  return (
    <div className="app">
      <header>
        <h1>🗳️ Union Chant v8 - AI Deliberation Demo</h1>
        <p>Watch AI agents deliberate and vote in real-time</p>
      </header>

      <div className="controls">
        <div className="topic-row">
          <label htmlFor="topic">Topic:</label>
          <input
            id="topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={demoRunning}
            className="topic-input"
            placeholder="Enter a topic for AI deliberation..."
          />
        </div>

        <div className="control-row">
          <div className="demo-settings">
            <div className="agent-count-control">
              <label htmlFor="agentCount">Agents:</label>
              <input
                id="agentCount"
                type="number"
                value={agentCount}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === '') {
                    setAgentCount('')
                  } else {
                    setAgentCount(parseInt(val) || '')
                  }
                }}
                disabled={demoRunning}
                className="agent-input"
              />
            </div>

            <div className="agent-count-control">
              <label htmlFor="votingTimeout">Vote Timer (sec):</label>
              <input
                id="votingTimeout"
                type="number"
                value={votingTimeoutSec}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === '') {
                    setVotingTimeoutSec('')
                  } else {
                    setVotingTimeoutSec(parseInt(val) || '')
                  }
                }}
                disabled={demoRunning}
                className="agent-input"
              />
            </div>
          </div>

          <div className="button-group">
            <button
              onClick={runQuickDemo}
              disabled={loading || demoRunning}
              className="btn-primary"
            >
              {demoRunning ? '⏳ Demo Running...' : `▶️  Run Demo (${agentCount} Agents)`}
            </button>

            {demoRunning && (
              <button
                onClick={stopDemo}
                className="btn-stop"
              >
                🛑 Stop Demo
              </button>
            )}
          </div>
        </div>

        {currentActivity && (
          <div className={`activity ${currentActivity.startsWith('❌') ? 'activity-error' : ''}`}>
            {currentActivity}
          </div>
        )}
      </div>

      <ProcessVisualization state={state} winner={winner} />

      <div className="grid">
        <div className="panel">
          <h2>📊 Current State</h2>
          <div className="stats">
            <div className="stat">
              <label>Phase:</label>
              <span className={`phase-${state.phase}`}>{state.phase}</span>
            </div>
            <div className="stat">
              <label>Participants:</label>
              <span>{state.totalParticipants}</span>
            </div>
            <div className="stat stat-tier">
              <label>🎯 Current Tier:</label>
              <span className="tier-badge">Tier {state.currentTier}</span>
            </div>
            <div className="stat">
              <label>Cells (All Tiers):</label>
              <span>{state.cells.length}</span>
            </div>
            <div className="stat">
              <label>Active Ideas:</label>
              <span>{state.ideas.filter(i => i.status !== 'eliminated').length}</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>💬 Live Discussion ({comments.length} comments)</h2>
          <div className="comments">
            {comments.slice(-10).reverse().map((comment, i) => {
              const cell = state.cells.find(c => c.id === comment.cellId)
              const tierInfo = cell ? `Tier ${cell.tier}${cell.batch ? `, Batch ${cell.batch}` : ''}` : ''

              return (
                <div key={i} className="comment">
                  <div className="comment-header">
                    <span className={`personality-${comment.personality}`}>
                      {comment.participantName} <span className="cell-badge">({comment.cellId} - {tierInfo})</span>
                    </span>
                    <span className="time">
                      {new Date(comment.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="comment-text">{comment.text}</div>
                </div>
              )
            })}
            {comments.length === 0 && (
              <div className="empty">No comments yet. Run a demo to see AI agents discuss!</div>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>🗳️  Recent Votes ({votes.length} total)</h2>
        <div className="votes">
          {votes.slice(-20).reverse().map((vote, i) => (
            <div key={i} className="vote">
              {vote.participantName} → {vote.ideaId}
            </div>
          ))}
          {votes.length === 0 && (
            <div className="empty">No votes yet</div>
          )}
        </div>
      </div>

      {state.cells.length > 0 && (
        <div className="panel">
          <h2>📦 All Cells (Grouped by Tier)</h2>
          <div className="cells">
            {[...new Set(state.cells.map(c => c.tier))]
              .sort((a, b) => b - a)
              .map(tier => {
                const tierCells = state.cells.filter(c => c.tier === tier)
                const isTier1 = tier === 1

                return (
                  <div key={tier}>
                    <h3 className={`tier-header ${tier === state.currentTier ? 'tier-current' : ''}`}>
                      🎯 Tier {tier} {tier === state.currentTier ? '(Current)' : '(Completed)'} - {tierCells.length} cells
                    </h3>

                    {isTier1 ? (
                      // Tier 1: Different ideas per cell
                      <div className="tier-cells">
                        {tierCells.map(cell => (
                          <div key={cell.id} className={`cell cell-${cell.status} ${cell.tier === state.currentTier ? 'cell-current-tier' : ''}`}>
                            <div className="cell-header">
                              <strong>{cell.id}</strong>
                              <span className="status">{cell.status}</span>
                            </div>
                            <div className="cell-info">
                              <div>Participants: {cell.participants.length}</div>
                              <div>Ideas: {cell.ideaIds.length}</div>
                              <div>Votes: {cell.votesCast}/{cell.votesNeeded}</div>
                            </div>
                            {Object.keys(cell.voteTally).length > 0 && (
                              <div className="tally">
                                {Object.entries(cell.voteTally)
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([ideaId, count]) => (
                                    <div key={ideaId} className="tally-item">
                                      {ideaId}: {count}
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      // Tier 2+: Group by batch
                      <div className="tier-2-plus">
                        {[...new Set(tierCells.map(c => c.batch))].sort().map(batchNum => {
                          const batchCells = tierCells.filter(c => c.batch === batchNum)
                          const batchIdeas = batchCells[0]?.ideaIds || []
                          const completedCount = batchCells.filter(c => c.status === 'completed').length

                          return (
                            <div key={batchNum} className="batch">
                              <h4 className="batch-header">
                                Batch {batchNum}: {batchIdeas.length} ideas across {batchCells.length} cells ({completedCount}/{batchCells.length} complete)
                              </h4>
                              <div className="batch-ideas">
                                Voting on: {batchIdeas.join(', ')}
                              </div>
                              <div className="tier-cells">
                                {batchCells.map(cell => (
                                  <div key={cell.id} className={`cell cell-${cell.status} ${cell.tier === state.currentTier ? 'cell-current-tier' : ''}`}>
                                    <div className="cell-header">
                                      <strong>{cell.id}</strong>
                                      <span className="status">{cell.status}</span>
                                    </div>
                                    <div className="cell-info">
                                      <div>Participants: {cell.participants.length}</div>
                                      <div>Votes: {cell.votesCast}/{cell.votesNeeded}</div>
                                    </div>
                                    {Object.keys(cell.voteTally).length > 0 && (
                                      <div className="tally">
                                        {Object.entries(cell.voteTally)
                                          .sort((a, b) => b[1] - a[1])
                                          .map(([ideaId, count]) => (
                                            <div key={ideaId} className="tally-item">
                                              {ideaId}: {count}
                                            </div>
                                          ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {state.ideas.length > 0 && (
        <div className="panel">
          <h2>💡 Ideas ({state.ideas.length} total)</h2>
          <div className="ideas">
            {state.ideas.map(idea => (
              <div
                key={idea.id}
                className={`idea idea-${idea.status}`}
                title={`Status: ${idea.status} | Tier: ${idea.tier || 1}`}
              >
                <div className="idea-header">
                  <span className="idea-id">{idea.id}</span>
                  <span className={`idea-status status-${idea.status}`}>
                    {idea.status === 'in-voting' && '🗳️ Voting'}
                    {idea.status === 'cell-winner' && '🏆 Advancing'}
                    {idea.status === 'eliminated' && '❌ Eliminated'}
                    {idea.status === 'winner' && '👑 WINNER'}
                  </span>
                </div>
                <div className="idea-text">{idea.text}</div>
                <div className="idea-meta">
                  <span className="idea-author">{idea.author}</span>
                  {idea.tier && <span className="idea-tier">Tier {idea.tier}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
