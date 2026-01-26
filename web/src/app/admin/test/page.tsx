'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import Link from 'next/link'

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
          isPublic: false,
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

      // Step 4: Simulate voting through tiers
      if (testConfig.simulateVoting) {
        addLog('info', 'Simulating votes through tiers...')

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
        addLog('success', `Simulated ${simData.votesCreated} votes across ${simData.tiersProcessed} tiers`)

        if (simData.finalCellStatus) {
          addLog('info', `Final cell: ${simData.finalCellStatus}`)
        }

        if (simData.champion) {
          addLog('success', `Champion determined: "${simData.champion}"`)
        }
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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 p-6">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="text-slate-400 hover:text-slate-300 text-sm mb-8 inline-block">
          &larr; Back to home
        </Link>

        <h1 className="text-3xl font-bold text-white mb-2">Admin Test Page</h1>
        <p className="text-slate-400 mb-4">Automated testing for deliberation flows. Not for public use.</p>

        {/* Auth Status */}
        <div className="bg-slate-800 rounded-lg p-4 mb-6 flex items-center justify-between">
          {status === 'loading' ? (
            <span className="text-slate-400">Loading...</span>
          ) : session ? (
            <>
              <span className="text-green-400">Signed in as {session.user?.email}</span>
              <button
                onClick={() => signOut()}
                className="px-4 py-1 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <span className="text-yellow-400">Not signed in - tests require authentication</span>
              <button
                onClick={() => signIn('google')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
              >
                Sign in with Google
              </button>
            </>
          )}
        </div>

        {!session && status !== 'loading' && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-6">
            <p className="text-yellow-300">Please sign in to run tests. The test automation requires authentication to create deliberations and simulate voting.</p>
          </div>
        )}

        {/* Configuration */}
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Test Configuration</h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Number of Users</label>
              <input
                type="number"
                value={testConfig.userCount}
                onChange={(e) => setTestConfig(prev => ({ ...prev, userCount: parseInt(e.target.value) || 10 }))}
                className="w-full bg-slate-700 text-white rounded px-3 py-2"
                min={5}
                max={200}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Question</label>
              <input
                type="text"
                value={testConfig.question}
                onChange={(e) => setTestConfig(prev => ({ ...prev, question: e.target.value }))}
                className="w-full bg-slate-700 text-white rounded px-3 py-2"
              />
            </div>
          </div>

          <div className="flex gap-4 mb-4">
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={testConfig.simulateVoting}
                onChange={(e) => setTestConfig(prev => ({ ...prev, simulateVoting: e.target.checked }))}
                className="rounded"
              />
              Simulate voting through tiers
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={testConfig.leaveFinaVote}
                onChange={(e) => setTestConfig(prev => ({ ...prev, leaveFinaVote: e.target.checked }))}
                className="rounded"
              />
              Leave final vote for manual testing
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                checked={testConfig.accumulationEnabled}
                onChange={(e) => setTestConfig(prev => ({ ...prev, accumulationEnabled: e.target.checked }))}
                className="rounded"
              />
              Enable accumulation (rolling mode)
            </label>
          </div>

          <button
            onClick={runTest}
            disabled={isRunning}
            className={`px-6 py-2 rounded font-semibold ${
              isRunning
                ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {isRunning ? 'Running...' : 'Run Automated Test'}
          </button>
        </div>

        {/* Created Deliberation Link */}
        {createdDeliberation && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 mb-6">
            <p className="text-green-300 font-medium mb-2">Test Deliberation Created</p>
            <div className="flex gap-4">
              <Link
                href={`/deliberations/${createdDeliberation.id}`}
                className="text-indigo-400 hover:text-indigo-300 underline"
              >
                View Deliberation
              </Link>
              <Link
                href={`/invite/${createdDeliberation.inviteCode}`}
                className="text-indigo-400 hover:text-indigo-300 underline"
              >
                Invite Link
              </Link>
            </div>
          </div>
        )}

        {/* Logs */}
        <div className="bg-slate-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-white">Logs</h2>
            <button
              onClick={clearLogs}
              className="text-sm text-slate-400 hover:text-slate-300"
            >
              Clear
            </button>
          </div>

          <div className="bg-slate-900 rounded p-4 font-mono text-sm h-80 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-slate-500">No logs yet. Run a test to see output.</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`mb-1 ${
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'success' ? 'text-green-400' :
                  'text-slate-300'
                }`}>
                  <span className="text-slate-500">[{log.timestamp}]</span> {log.message}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 bg-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="flex gap-4 flex-wrap">
            <Link
              href="/deliberations"
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded"
            >
              Browse Deliberations
            </Link>
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
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
            >
              Cleanup Test Data
            </button>
          </div>
        </div>

        {/* Test Accumulation / Challenge Flow */}
        <AccumulationTestSection addLog={addLog} refreshKey={refreshKey} />

        {/* Delete Stuck Deliberations */}
        <DeleteDeliberationsSection addLog={addLog} />
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
      const res = await fetch('/api/admin/deliberations')
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
    <div className="mt-6 bg-slate-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-white">Accumulation / Challenge Test</h2>
        <button
          onClick={fetchAccumulating}
          className="text-sm text-slate-400 hover:text-slate-300"
        >
          Refresh
        </button>
      </div>
      <p className="text-slate-400 text-sm mb-4">
        Test the challenge flow: submit challengers, run voting, verify champion cycles.
      </p>

      <div className="mb-4">
        <label className="block text-sm text-slate-400 mb-1">Number of Challenger Ideas</label>
        <input
          type="number"
          value={challengerCount}
          onChange={(e) => setChallengerCount(parseInt(e.target.value) || 5)}
          className="w-32 bg-slate-700 text-white rounded px-3 py-2"
          min={3}
          max={50}
        />
      </div>

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : accumulatingDeliberations.length === 0 ? (
        <p className="text-slate-400">No deliberations in ACCUMULATING phase. Run a full test first to get a champion.</p>
      ) : (
        <div className="space-y-2">
          {accumulatingDeliberations.map(d => (
            <div key={d.id} className="flex justify-between items-center bg-slate-700 rounded p-3">
              <div>
                <span className="text-white">{d.question}</span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-purple-600">ACCUMULATING</span>
              </div>
              <button
                onClick={() => runAccumulationTest(d.id)}
                disabled={testing === d.id}
                className={`px-3 py-1 text-white text-sm rounded ${
                  testing === d.id
                    ? 'bg-slate-600 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700'
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

function DeleteDeliberationsSection({ addLog }: { addLog: (type: 'info' | 'success' | 'error', message: string) => void }) {
  const [deliberations, setDeliberations] = useState<Array<{ id: string; question: string; phase: string }>>([])
  const [loading, setLoading] = useState(true)

  const fetchDeliberations = async () => {
    try {
      const res = await fetch('/api/admin/deliberations')
      if (res.ok) {
        const data = await res.json()
        setDeliberations(data)
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

  const handleDelete = async (id: string, question: string) => {
    if (!confirm(`Delete "${question}"? This cannot be undone.`)) return

    try {
      const res = await fetch(`/api/admin/deliberations/${id}`, { method: 'DELETE' })
      if (res.ok) {
        addLog('success', `Deleted "${question}"`)
        fetchDeliberations()
      } else {
        const data = await res.json()
        addLog('error', `Failed to delete: ${data.error}`)
      }
    } catch (err) {
      addLog('error', 'Failed to delete deliberation')
    }
  }

  return (
    <div className="mt-6 bg-slate-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Your Deliberations</h2>
      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : deliberations.length === 0 ? (
        <p className="text-slate-400">No deliberations found.</p>
      ) : (
        <div className="space-y-2">
          {deliberations.map(d => (
            <div key={d.id} className="flex justify-between items-center bg-slate-700 rounded p-3">
              <div>
                <span className="text-white">{d.question}</span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                  d.phase === 'COMPLETED' ? 'bg-green-600' :
                  d.phase === 'VOTING' ? 'bg-yellow-600' :
                  d.phase === 'ACCUMULATING' ? 'bg-purple-600' :
                  'bg-blue-600'
                }`}>{d.phase}</span>
              </div>
              <button
                onClick={() => handleDelete(d.id, d.question)}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
