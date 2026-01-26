'use client'

import { useState } from 'react'
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
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [testConfig, setTestConfig] = useState({
    userCount: 40,
    question: 'Test Deliberation - Automated',
    description: 'This is an automated test deliberation created by the admin test page.',
    simulateVoting: true,
    voteThroughTiers: true,
    leaveFinaVote: true, // Leave one vote in final cell for manual testing
  })
  const [createdDeliberation, setCreatedDeliberation] = useState<{ id: string; inviteCode: string } | null>(null)

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
          throw new Error(`Failed to simulate voting: ${error.error}`)
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
        <p className="text-slate-400 mb-8">Automated testing for deliberation flows. Not for public use.</p>

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
      </div>
    </div>
  )
}
