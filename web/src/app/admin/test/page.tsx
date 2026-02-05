'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'

interface TestResult {
  success: boolean
  message: string
  data?: Record<string, unknown>
}

interface LogEntry {
  timestamp: string
  type: 'info' | 'success' | 'error'
  message: string
}

export default function AdminTestPage() {
  const { data: session, status } = useSession()
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [testConfig, setTestConfig] = useState({
    userCount: 40,
    question: 'Test Deliberation - Automated',
    description: 'This is an automated test deliberation created by the admin test page.',
    simulateVoting: true,
    voteThroughTiers: true,
    leaveFinaVote: true, // Leave one vote in final cell for manual testing
    accumulationEnabled: true, // Enable rolling mode
    additionalUserEmails: '', // Comma-separated emails for multi-account testing
  })
  const [createdDeliberation, setCreatedDeliberation] = useState<{ id: string; inviteCode: string } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, {
      timestamp: new Date().toISOString().split('T')[1].split('.')[0],
      type,
      message
    }])
  }

  const clearLogs = () => setLogs([])

  const runTest = async () => {
    setIsRunning(true)
    clearLogs()
    setCreatedDeliberation(null)

    try {
      addLog('info', 'Starting automated test...')

      // Step 1: Create deliberation
      addLog('info', 'Creating deliberation...')
      const createRes = await fetch('/api/deliberations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: testConfig.question + ' ' + Date.now(),
          description: testConfig.description,
          isPublic: true,
          tags: ['test', 'automated'],
          accumulationEnabled: testConfig.accumulationEnabled,
        }),
      })

      if (!createRes.ok) {
        const error = await createRes.json()
        throw new Error(`Failed to create deliberation: ${error.error}`)
      }

      const deliberation = await createRes.json()
      addLog('success', `Created deliberation: ${deliberation.id}`)
      setCreatedDeliberation({ id: deliberation.id, inviteCode: deliberation.inviteCode })

      // Step 2: Create test users and have them join + submit ideas
      addLog('info', `Creating ${testConfig.userCount} test participants with ideas...`)

      const testRes = await fetch('/api/admin/test/populate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliberationId: deliberation.id,
          userCount: testConfig.userCount,
        }),
      })

      if (!testRes.ok) {
        const error = await testRes.json()
        throw new Error(`Failed to populate test data: ${error.error}`)
      }

      const testData = await testRes.json()
      addLog('success', `Created ${testData.usersCreated} users and ${testData.ideasCreated} ideas`)

      // Step 3: Start voting
      addLog('info', 'Starting voting phase...')
      const startVotingRes = await fetch(`/api/deliberations/${deliberation.id}/start-voting`, {
        method: 'POST',
      })

      if (!startVotingRes.ok) {
        const error = await startVotingRes.json()
        throw new Error(`Failed to start voting: ${error.error}`)
      }

      const votingData = await startVotingRes.json()
      addLog('success', `Voting started! Created ${votingData.cellsCreated} cells`)

      // Step 4: Simulate voting through tiers (one tier per request, loop client-side)
      if (testConfig.simulateVoting) {
        addLog('info', 'Simulating votes through tiers...')

        let totalVotes = 0
        let tiersProcessed = 0

        for (let safety = 0; safety < 20; safety++) {
          const simulateRes = await fetch('/api/admin/test/simulate-voting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deliberationId: deliberation.id,
              leaveFinalVote: testConfig.leaveFinaVote,
            }),
          })

          if (!simulateRes.ok) {
            const error = await simulateRes.json()
            throw new Error(`Failed to simulate voting: ${error.error}${error.details ? ' - ' + error.details : ''}`)
          }

          const simData = await simulateRes.json()
          totalVotes += simData.votesCreated
          if (simData.tierProcessed) tiersProcessed++

          addLog('info', `Tier ${simData.tierProcessed}: ${simData.votesCreated} votes created`)

          if (simData.isComplete) {
            if (simData.champion) {
              addLog('success', `Champion determined: "${simData.champion}"`)
            }
            break
          }

          if (simData.waitingForFinalVote) {
            addLog('info', `Final cell: ${simData.finalCellStatus}`)
            break
          }
        }

        addLog('success', `Simulated ${totalVotes} votes across ${tiersProcessed} tiers`)
      }

      addLog('success', 'Test completed successfully!')
      setRefreshKey(k => k + 1) // Trigger refresh of accumulation section

    } catch (error) {
      addLog('error', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-4xl mx-auto px-6 py-8">
        <Link href="/admin" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Back to admin
        </Link>

        <h1 className="text-3xl font-bold text-foreground mb-2">Admin Test Page</h1>
        <p className="text-muted mb-4">Automated testing for deliberation flows. Not for public use.</p>

        {/* Auth Status */}
        <div className="bg-background rounded-lg p-4 mb-6 flex items-center justify-between border border-border">
          {status === 'loading' ? (
            <span className="text-muted">Loading...</span>
          ) : session ? (
            <>
              <span className="text-success">Signed in as {session.user?.email}</span>
              <button
                onClick={() => signOut()}
                className="px-4 py-1 bg-muted hover:bg-subtle text-white rounded-lg text-sm"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <span className="text-warning">Not signed in - tests require authentication</span>
              <button
                onClick={() => signIn('google')}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg"
              >
                Sign in with Google
              </button>
            </>
          )}
        </div>

        {!session && status !== 'loading' && (
          <div className="bg-warning-bg border border-warning rounded-lg p-4 mb-6">
            <p className="text-warning-hover">Please sign in to run tests. The test automation requires authentication to create deliberations and simulate voting.</p>
          </div>
        )}

        {/* Configuration */}
        <div className="bg-background rounded-lg p-6 mb-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Test Configuration</h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-muted mb-1">Number of Users</label>
              <input
                type="number"
                value={testConfig.userCount}
                onChange={(e) => setTestConfig(prev => ({ ...prev, userCount: parseInt(e.target.value) || 10 }))}
                className="w-full bg-surface border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
                min={5}
                max={200}
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Question</label>
              <input
                type="text"
                value={testConfig.question}
                onChange={(e) => setTestConfig(prev => ({ ...prev, question: e.target.value }))}
                className="w-full bg-surface border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="flex gap-4 mb-4 flex-wrap">
            <label className="flex items-center gap-2 text-subtle">
              <input
                type="checkbox"
                checked={testConfig.simulateVoting}
                onChange={(e) => setTestConfig(prev => ({ ...prev, simulateVoting: e.target.checked }))}
                className="rounded"
              />
              Simulate voting through tiers
            </label>
            <label className="flex items-center gap-2 text-subtle">
              <input
                type="checkbox"
                checked={testConfig.leaveFinaVote}
                onChange={(e) => setTestConfig(prev => ({ ...prev, leaveFinaVote: e.target.checked }))}
                className="rounded"
              />
              Leave final vote for manual testing
            </label>
            <label className="flex items-center gap-2 text-subtle">
              <input
                type="checkbox"
                checked={testConfig.accumulationEnabled}
                onChange={(e) => setTestConfig(prev => ({ ...prev, accumulationEnabled: e.target.checked }))}
                className="rounded"
              />
              Enable accumulation (rolling mode)
            </label>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-muted mb-1">Additional User Emails (comma-separated, for multi-account testing)</label>
            <input
              type="text"
              value={testConfig.additionalUserEmails}
              onChange={(e) => setTestConfig(prev => ({ ...prev, additionalUserEmails: e.target.value }))}
              placeholder="user2@gmail.com, user3@gmail.com"
              className="w-full bg-surface border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={runTest}
              disabled={isRunning}
              className={`px-6 py-2 rounded-lg font-semibold ${
                isRunning
                  ? 'bg-muted-light text-muted cursor-not-allowed'
                  : 'bg-accent hover:bg-accent-hover text-white'
              }`}
            >
              {isRunning ? 'Running...' : 'Run Automated Test'}
            </button>

            <button
              onClick={async () => {
                addLog('info', 'Seeding all feed card types...')
                try {
                  const emails = testConfig.additionalUserEmails.split(',').map(e => e.trim()).filter(Boolean)
                  const res = await fetch('/api/admin/test/seed-feed', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ additionalUserEmails: emails, userEmail: session?.user?.email }),
                  })
                  const data = await res.json()
                  if (res.ok) {
                    addLog('success', data.message || 'Feed data seeded')
                    data.results?.forEach((r: string) => addLog('success', `  ${r}`))
                    if (data.cardTypes) {
                      addLog('info', '--- Card types created ---')
                      data.cardTypes.forEach((ct: string) => addLog('info', `  ${ct}`))
                    }
                    addLog('success', 'Visit /feed to see all cards!')
                  } else {
                    addLog('error', data.error || 'Failed to seed')
                    if (data.details) addLog('error', data.details)
                  }
                } catch (err) {
                  addLog('error', 'Failed to seed feed data')
                }
              }}
              disabled={isRunning}
              className="px-6 py-2 rounded-lg font-semibold bg-purple hover:bg-purple-hover text-white"
            >
              Seed Feed Demo Cards
            </button>

            <button
              onClick={async () => {
                addLog('info', 'Creating Tier 3 up-pollination test...')
                try {
                  const emails = testConfig.additionalUserEmails.split(',').map(e => e.trim()).filter(Boolean)
                  const res = await fetch('/api/admin/test/seed-tier3', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ additionalUserEmails: emails }),
                  })
                  const data = await res.json()
                  if (res.ok) {
                    addLog('success', data.message)
                    addLog('info', `Deliberation ID: ${data.deliberationId}`)
                    addLog('info', `Cell ID: ${data.cellId}`)
                    addLog('info', `Comment needs ${data.upPollinationInfo.votesNeeded} more upvote(s) to up-pollinate`)
                    setCreatedDeliberation({ id: data.deliberationId, inviteCode: '' })
                  } else {
                    addLog('error', data.error || 'Failed to create Tier 3 test')
                    if (data.details) addLog('error', data.details)
                  }
                } catch (err) {
                  addLog('error', 'Failed to create Tier 3 test')
                }
              }}
              disabled={isRunning}
              className="px-6 py-2 rounded-lg font-semibold bg-orange hover:bg-orange-hover text-white"
            >
              Create Tier 3 Up-Pollination Test
            </button>

            <button
              onClick={async () => {
                setIsRunning(true)
                addLog('info', 'Creating viral spread demo...')
                try {
                  const res = await fetch('/api/admin/test/seed-viral-spread', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                  })
                  const data = await res.json()
                  if (res.ok) {
                    addLog('success', data.message)
                    addLog('info', `Your cell: ${data.yourCellId}`)
                    for (const cell of data.cells) {
                      addLog('info', `Cell ${cell.index}: ${cell.ideas.join(' | ')}`)
                    }
                    setCreatedDeliberation({ id: data.deliberationId, inviteCode: '' })
                  } else {
                    addLog('error', data.error || 'Failed to create viral spread demo')
                    if (data.details) addLog('error', data.details)
                  }
                } catch (err) {
                  addLog('error', 'Failed to create viral spread demo')
                } finally {
                  setIsRunning(false)
                }
              }}
              disabled={isRunning}
              className="px-6 py-2 rounded-lg font-semibold bg-purple hover:bg-purple-hover text-white"
            >
              Viral Spread Demo
            </button>
          </div>
        </div>

        {/* Created Deliberation Link */}
        {createdDeliberation && (
          <div className="bg-success-bg border border-success rounded-lg p-4 mb-6">
            <p className="text-success font-medium mb-2">Test Deliberation Created</p>
            <div className="flex gap-4">
              <Link
                href={`/talks/${createdDeliberation.id}`}
                className="text-accent hover:text-accent-hover underline"
              >
                View Deliberation
              </Link>
              <Link
                href={`/invite/${createdDeliberation.inviteCode}`}
                className="text-accent hover:text-accent-hover underline"
              >
                Invite Link
              </Link>
            </div>
          </div>
        )}

        {/* Logs */}
        <div className="bg-background rounded-lg p-6 border border-border">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-foreground">Logs</h2>
            <button
              onClick={clearLogs}
              className="text-sm text-muted hover:text-foreground"
            >
              Clear
            </button>
          </div>

          <div className="bg-surface rounded-lg p-4 font-mono text-sm h-80 overflow-y-auto border border-border">
            {logs.length === 0 ? (
              <p className="text-muted-light">No logs yet. Run a test to see output.</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`mb-1 ${
                  log.type === 'error' ? 'text-error' :
                  log.type === 'success' ? 'text-success' :
                  'text-subtle'
                }`}>
                  <span className="text-muted-light">[{log.timestamp}]</span> {log.message}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 bg-background rounded-lg p-6 border border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="flex gap-4 flex-wrap">
            <Link
              href="/feed"
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium"
            >
              View Feed
            </Link>
            <Link
              href="/talks"
              className="px-4 py-2 bg-surface hover:bg-border text-foreground rounded-lg border border-border"
            >
              Browse Deliberations
            </Link>
            <button
              onClick={async () => {
                addLog('info', 'Creating test deliberation with completed cell...')
                try {
                  const res = await fetch('/api/admin/test/create-completed-cell', { method: 'POST' })
                  const data = await res.json()
                  if (res.ok) {
                    addLog('success', `Created deliberation with completed cell`)
                    addLog('info', `URL: ${data.url}`)
                    setCreatedDeliberation({ id: data.deliberationId, inviteCode: '' })
                  } else {
                    addLog('error', data.error || 'Failed to create test')
                  }
                } catch (err) {
                  addLog('error', 'Failed to create test')
                }
              }}
              className="px-4 py-2 bg-success hover:bg-success-hover text-white rounded-lg"
            >
              Create Completed Cell Test
            </button>
            <button
              onClick={async () => {
                const res = await fetch('/api/admin/test/cleanup', { method: 'POST' })
                if (res.ok) {
                  const data = await res.json()
                  addLog('success', `Cleaned up ${data.deleted} test deliberations`)
                } else {
                  addLog('error', 'Cleanup failed')
                }
              }}
              className="px-4 py-2 bg-error hover:bg-error-hover text-white rounded-lg"
            >
              Cleanup Test Data
            </button>
          </div>
        </div>

        {/* Test Accumulation / Challenge Flow */}
        <AccumulationTestSection addLog={addLog} refreshKey={refreshKey} />

        {/* AI Agent Testing */}
        <Suspense fallback={<div className="animate-pulse bg-surface rounded-lg h-48" />}>
          <AIAgentTestSection addLog={addLog} />
        </Suspense>
      </div>
    </div>
  )
}

function AccumulationTestSection({ addLog, refreshKey }: { addLog: (type: 'info' | 'success' | 'error', message: string) => void; refreshKey: number }) {
  const [accumulatingDeliberations, setAccumulatingDeliberations] = useState<Array<{ id: string; question: string; championId: string | null }>>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState<string | null>(null)
  const [challengerCount, setChallengerCount] = useState(10)

  const fetchAccumulating = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/talks')
      if (res.ok) {
        const data = await res.json()
        setAccumulatingDeliberations(data.filter((d: { phase: string }) => d.phase === 'ACCUMULATING'))
      }
    } catch (err) {
      console.error('Failed to fetch:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAccumulating()
  }, [refreshKey])

  const runAccumulationTest = async (deliberationId: string) => {
    setTesting(deliberationId)
    addLog('info', `Starting accumulation test for ${deliberationId}...`)

    try {
      const res = await fetch('/api/admin/test/simulate-accumulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliberationId,
          challengerCount,
        }),
      })

      const data = await res.json()

      if (data.logs) {
        data.logs.forEach((log: string) => addLog('info', log))
      }

      if (data.success) {
        addLog('success', `Accumulation test complete! Challenge round ${data.challengeRound}, ${data.votesCreated} votes, ${data.tiersProcessed} tiers`)
        addLog('success', `Final phase: ${data.finalPhase}, New champion: ${data.newChampionId}`)
      } else {
        addLog('error', data.error || 'Unknown error')
      }

      // Refresh the list
      fetchAccumulating()
    } catch (err) {
      addLog('error', err instanceof Error ? err.message : 'Failed to run accumulation test')
    } finally {
      setTesting(null)
    }
  }

  return (
    <div className="mt-6 bg-background rounded-lg p-6 border border-border">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground">Accumulation / Challenge Test</h2>
        <button
          onClick={fetchAccumulating}
          className="text-sm text-muted hover:text-foreground"
        >
          Refresh
        </button>
      </div>
      <p className="text-muted text-sm mb-4">
        Test the challenge flow: submit challengers, run voting, verify champion cycles.
      </p>

      <div className="mb-4">
        <label className="block text-sm text-muted mb-1">Number of Challenger Ideas</label>
        <input
          type="number"
          value={challengerCount}
          onChange={(e) => setChallengerCount(parseInt(e.target.value) || 5)}
          className="w-32 bg-surface border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
          min={3}
          max={50}
        />
      </div>

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : accumulatingDeliberations.length === 0 ? (
        <p className="text-muted">No deliberations in ACCUMULATING phase. Run a full test first to get a champion.</p>
      ) : (
        <div className="space-y-2">
          {accumulatingDeliberations.map(d => (
            <div key={d.id} className="flex justify-between items-center bg-surface rounded-lg p-3 border border-border">
              <div>
                <span className="text-foreground">{d.question}</span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-purple text-white">ACCUMULATING</span>
              </div>
              <button
                onClick={() => runAccumulationTest(d.id)}
                disabled={testing === d.id}
                className={`px-3 py-1 text-white text-sm rounded-lg ${
                  testing === d.id
                    ? 'bg-muted-light cursor-not-allowed'
                    : 'bg-accent hover:bg-accent-hover'
                }`}
              >
                {testing === d.id ? 'Testing...' : 'Run Challenge Test'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AIAgentTestSection({ addLog }: { addLog: (type: 'info' | 'success' | 'error', message: string) => void }) {
  const searchParams = useSearchParams()
  const [deliberations, setDeliberations] = useState<Array<{ id: string; question: string; phase: string }>>([])
  const [selectedDelibId, setSelectedDelibId] = useState(searchParams.get('deliberationId') || '')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{
    phase: string
    currentTier: number
    totalTiers: number
    agentsCreated: number
    ideasSubmitted: number
    votescast: number
    commentsPosted: number
    upvotesGiven: number
    dropouts: number
    errors: string[]
  } | null>(null)
  const [config, setConfig] = useState({
    totalAgents: 1000,
    votingTimePerTierMs: 30000,
    dropoutRate: 0.1,
    commentRate: 0.2,
    upvoteRate: 0.3,
    newJoinRate: 0.05,
    forceStartVoting: true, // Force start even if trigger not met
  })

  const fetchDeliberations = async () => {
    try {
      const res = await fetch('/api/admin/talks')
      if (res.ok) {
        const data = await res.json()
        setDeliberations(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.error('Failed to fetch deliberations:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDeliberations()
  }, [])

  // Poll for progress while running
  useEffect(() => {
    if (!running) return

    const pollProgress = async () => {
      try {
        const res = await fetch('/api/admin/test/ai-agents')
        if (res.ok) {
          const data = await res.json()
          setProgress(data)

          if (data.phase === 'completed') {
            setRunning(false)
            addLog('success', `AI Agent test completed! ${data.agentsCreated} agents, ${data.votescast} votes, ${data.commentsPosted} comments`)
          }
        }
      } catch (err) {
        console.error('Failed to fetch progress:', err)
      }
    }

    pollProgress()
    const interval = setInterval(pollProgress, 2000)
    return () => clearInterval(interval)
  }, [running, addLog])

  const startTest = async () => {
    if (!selectedDelibId) {
      addLog('error', 'Please select a deliberation')
      return
    }

    setRunning(true)
    setProgress(null)
    addLog('info', 'Starting AI agent test...')

    try {
      const res = await fetch('/api/admin/test/ai-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliberationId: selectedDelibId,
          ...config,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start test')
      }

      addLog('success', 'AI agent test started in background')
    } catch (err) {
      addLog('error', err instanceof Error ? err.message : 'Failed to start test')
      setRunning(false)
    }
  }

  const cleanupAgents = async () => {
    addLog('info', 'Cleaning up test agents...')
    try {
      const res = await fetch('/api/admin/test/ai-agents', { method: 'DELETE' })
      if (res.ok) {
        const data = await res.json()
        addLog('success', `Cleaned up ${data.deleted} test agents`)
      } else {
        addLog('error', 'Failed to cleanup test agents')
      }
    } catch (err) {
      addLog('error', 'Failed to cleanup test agents')
    }
  }

  return (
    <div className="mt-6 bg-background rounded-lg p-6 border border-border">
      <h2 className="text-lg font-semibold text-foreground mb-4">AI Agent Load Testing (Haiku)</h2>
      <p className="text-muted text-sm mb-4">
        Simulate realistic user behavior with AI agents powered by Claude Haiku. Agents submit ideas, vote intelligently, comment, and upvote.
      </p>

      {/* Deliberations List */}
      <div className="mb-6 bg-surface rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold text-foreground mb-3">All Deliberations</h3>
        {loading ? (
          <p className="text-muted text-sm">Loading...</p>
        ) : deliberations.length === 0 ? (
          <p className="text-muted text-sm">No deliberations found</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {deliberations.map(d => (
              <div key={d.id} className="flex items-center justify-between bg-background rounded p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{d.question}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    d.phase === 'VOTING' ? 'bg-warning/20 text-warning' :
                    d.phase === 'SUBMISSION' ? 'bg-accent/20 text-accent' :
                    d.phase === 'ACCUMULATING' ? 'bg-purple/20 text-purple' :
                    d.phase === 'COMPLETED' ? 'bg-success/20 text-success' :
                    'bg-muted/20 text-muted'
                  }`}>
                    {d.phase}
                  </span>
                </div>
                <Link
                  href={`/admin/deliberation/${d.id}`}
                  className="ml-2 bg-accent hover:bg-accent-hover text-white text-xs px-3 py-1.5 rounded transition-colors whitespace-nowrap"
                >
                  Admin View
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Configuration */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm text-muted mb-1">Deliberation</label>
          <select
            value={selectedDelibId}
            onChange={(e) => setSelectedDelibId(e.target.value)}
            className="w-full bg-surface border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
            disabled={running}
          >
            <option value="">Select...</option>
            {deliberations.map(d => (
              <option key={d.id} value={d.id}>
                {d.question.slice(0, 40)}... ({d.phase})
              </option>
            ))}
          </select>
        </div>

        {selectedDelibId && (
          <Link
            href={`/admin/deliberation/${selectedDelibId}`}
            className="w-full bg-purple hover:bg-purple/80 text-white font-medium px-4 py-3 rounded-lg transition-colors text-center block"
          >
            Open Admin View for This Deliberation
          </Link>
        )}

        <div>
          <label className="block text-sm text-muted mb-1">Total Agents</label>
          <input
            type="number"
            value={config.totalAgents}
            onChange={(e) => setConfig(c => ({ ...c, totalAgents: parseInt(e.target.value) || 10 }))}
            className="w-full bg-surface border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
            min={5}
            max={1000}
            disabled={running}
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">Voting Time per Tier (ms)</label>
          <input
            type="number"
            value={config.votingTimePerTierMs}
            onChange={(e) => setConfig(c => ({ ...c, votingTimePerTierMs: parseInt(e.target.value) || 30000 }))}
            className="w-full bg-surface border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
            min={5000}
            max={300000}
            step={5000}
            disabled={running}
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">Dropout Rate</label>
          <input
            type="number"
            value={config.dropoutRate}
            onChange={(e) => setConfig(c => ({ ...c, dropoutRate: parseFloat(e.target.value) || 0 }))}
            className="w-full bg-surface border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
            min={0}
            max={0.5}
            step={0.05}
            disabled={running}
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">Comment Rate</label>
          <input
            type="number"
            value={config.commentRate}
            onChange={(e) => setConfig(c => ({ ...c, commentRate: parseFloat(e.target.value) || 0 }))}
            className="w-full bg-surface border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
            min={0}
            max={1}
            step={0.1}
            disabled={running}
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1">Upvote Rate</label>
          <input
            type="number"
            value={config.upvoteRate}
            onChange={(e) => setConfig(c => ({ ...c, upvoteRate: parseFloat(e.target.value) || 0 }))}
            className="w-full bg-surface border border-border text-foreground rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
            min={0}
            max={1}
            step={0.1}
            disabled={running}
          />
        </div>
      </div>

      {/* Force Start Option */}
      <label className="flex items-center gap-2 text-subtle mb-4">
        <input
          type="checkbox"
          checked={config.forceStartVoting}
          onChange={(e) => setConfig(c => ({ ...c, forceStartVoting: e.target.checked }))}
          disabled={running}
          className="rounded"
        />
        Force start voting (ignore timer/ideas/manual triggers)
      </label>

      {/* Live Console Display */}
      {(running || progress) && (
        <div className="bg-surface rounded-lg border border-border mb-4 overflow-hidden">
          {/* Phase Header */}
          <div className={`px-4 py-3 flex justify-between items-center ${
            progress?.phase === 'completed' ? 'bg-success-bg' :
            progress?.phase === 'voting' ? 'bg-warning-bg' :
            progress?.phase === 'submission' ? 'bg-accent-light' :
            'bg-purple-bg'
          }`}>
            <div className="flex items-center gap-3">
              {running && progress?.phase !== 'completed' && (
                <div className="w-4 h-4 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
              )}
              {progress?.phase === 'completed' && (
                <span className="text-success text-lg">✓</span>
              )}
              <span className="font-semibold text-foreground">
                {progress?.phase === 'setup' ? 'Setting Up...' :
                 progress?.phase === 'submission' ? 'Submission Phase' :
                 progress?.phase === 'voting' ? `Voting - Tier ${progress.currentTier}` :
                 progress?.phase === 'completed' ? 'Test Complete!' :
                 'Initializing...'}
              </span>
            </div>
            {progress?.totalTiers && progress.totalTiers > 0 && (
              <span className="text-sm text-muted font-mono">
                {progress.totalTiers} tiers total
              </span>
            )}
          </div>

          {/* Stats Grid */}
          <div className="p-4 grid grid-cols-3 md:grid-cols-6 gap-4">
            <div className="bg-background rounded-lg p-3 text-center">
              <div className={`text-2xl font-mono font-bold ${progress?.agentsCreated ? 'text-accent' : 'text-muted'}`}>
                {progress?.agentsCreated || 0}
              </div>
              <div className="text-xs text-muted">Agents</div>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <div className={`text-2xl font-mono font-bold ${progress?.ideasSubmitted ? 'text-purple' : 'text-muted'}`}>
                {progress?.ideasSubmitted || 0}
              </div>
              <div className="text-xs text-muted">Ideas</div>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <div className={`text-2xl font-mono font-bold ${progress?.votescast ? 'text-warning' : 'text-muted'}`}>
                {progress?.votescast || 0}
              </div>
              <div className="text-xs text-muted">Votes</div>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <div className={`text-2xl font-mono font-bold ${progress?.commentsPosted ? 'text-success' : 'text-muted'}`}>
                {progress?.commentsPosted || 0}
              </div>
              <div className="text-xs text-muted">Comments</div>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <div className={`text-2xl font-mono font-bold ${progress?.upvotesGiven ? 'text-orange' : 'text-muted'}`}>
                {progress?.upvotesGiven || 0}
              </div>
              <div className="text-xs text-muted">Upvotes</div>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <div className={`text-2xl font-mono font-bold ${progress?.dropouts ? 'text-error' : 'text-muted'}`}>
                {progress?.dropouts || 0}
              </div>
              <div className="text-xs text-muted">Dropouts</div>
            </div>
          </div>

          {/* Progress Bars */}
          {progress?.phase === 'voting' && progress.currentTier > 0 && (
            <div className="px-4 pb-4">
              <div className="bg-background rounded-lg p-3">
                <div className="flex justify-between text-xs text-muted mb-2">
                  <span>Tier Progress</span>
                  <span>{progress.currentTier} / {progress.totalTiers || '?'}</span>
                </div>
                <div className="h-2 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-warning transition-all duration-500"
                    style={{ width: `${progress.totalTiers ? (progress.currentTier / progress.totalTiers) * 100 : 10}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tier Visualization */}
          {progress?.phase === 'voting' && progress.currentTier > 0 && (
            <div className="px-4 pb-4">
              <div className="flex items-center gap-2 overflow-x-auto py-2">
                {Array.from({ length: progress.totalTiers || progress.currentTier + 2 }, (_, i) => i + 1).map(tier => (
                  <div
                    key={tier}
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      tier < progress.currentTier ? 'bg-success text-white' :
                      tier === progress.currentTier ? 'bg-warning text-white ring-2 ring-warning ring-offset-2 ring-offset-surface' :
                      'bg-border text-muted'
                    }`}
                  >
                    {tier < progress.currentTier ? '✓' : tier}
                  </div>
                ))}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-success-bg border-2 border-success flex items-center justify-center">
                  🏆
                </div>
              </div>
            </div>
          )}

          {/* Errors */}
          {progress?.errors && progress.errors.length > 0 && (
            <div className="px-4 pb-4">
              <div className="bg-error-bg border border-error rounded-lg p-3">
                <div className="text-error text-xs font-semibold mb-1">Errors ({progress.errors.length})</div>
                <div className="text-error text-xs max-h-24 overflow-y-auto space-y-1">
                  {progress.errors.slice(-5).map((e, i) => (
                    <div key={i} className="truncate">{e}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Completion Summary */}
          {progress?.phase === 'completed' && (
            <div className="px-4 pb-4">
              <div className="bg-success-bg border border-success rounded-lg p-4 text-center">
                <div className="text-success text-4xl mb-2">🎉</div>
                <div className="text-success font-semibold">Load Test Complete!</div>
                <div className="text-muted text-sm mt-2">
                  {progress.agentsCreated} agents processed {progress.votescast} votes across {progress.totalTiers} tiers
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4 flex-wrap">
        <button
          onClick={startTest}
          disabled={running || !selectedDelibId}
          className={`px-6 py-2 rounded-lg font-semibold ${
            running || !selectedDelibId
              ? 'bg-muted-light text-muted cursor-not-allowed'
              : 'bg-accent hover:bg-accent-hover text-white'
          }`}
        >
          {running ? 'Running...' : 'Start AI Agent Test'}
        </button>

        <button
          onClick={cleanupAgents}
          disabled={running}
          className="px-4 py-2 bg-error hover:bg-error-hover text-white rounded-lg disabled:opacity-50"
        >
          Cleanup Test Agents
        </button>

        <button
          onClick={fetchDeliberations}
          className="px-4 py-2 bg-surface hover:bg-border text-muted border border-border rounded-lg"
        >
          Refresh List
        </button>
      </div>

      <p className="text-muted text-xs mt-4">
        Note: Test agents are created with @test.bot email addresses and can be cleaned up using the button above.
        Agents are named &quot;TestBot 1&quot;, &quot;TestBot 2&quot;, etc. for transparency.
      </p>
    </div>
  )
}