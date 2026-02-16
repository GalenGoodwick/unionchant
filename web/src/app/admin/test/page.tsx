'use client'

import { useState, useEffect, Suspense, useCallback } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'
import { startRegistration } from '@simplewebauthn/browser'

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

interface ChallengeStats {
  totalLogs: number
  resultCounts: { result: string; count: number }[]
  recentFails: { id: string; result: string; pointerEvents: number; chaseDurationMs: number; evadeCount: number; createdAt: string; user: { id: string; name: string | null; email: string; challengeFailCount: number; botFlaggedAt: string | null } }[]
  flaggedUsers: { id: string; name: string | null; email: string; botFlaggedAt: string | null; challengeFailCount: number; createdAt: string }[]
}

export default function AdminTestPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
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

  // System utilities state
  const [recalculating, setRecalculating] = useState(false)
  const [recalcResult, setRecalcResult] = useState<string | null>(null)

  // Passkey state
  const [isAdminVerified, setIsAdminVerified] = useState(false)
  const [hasPasskeys, setHasPasskeys] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [registerMsg, setRegisterMsg] = useState<string | null>(null)

  // Challenge state
  const [challengeTriggering, setChallengeTriggering] = useState(false)
  const [challengeStats, setChallengeStats] = useState<ChallengeStats | null>(null)
  const [challengeStatsLoading, setChallengeStatsLoading] = useState(false)
  const [challengeResult, setChallengeResult] = useState<string | null>(null)

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, {
      timestamp: new Date().toISOString().split('T')[1].split('.')[0],
      type,
      message
    }])
  }

  const clearLogs = () => setLogs([])

  const handleRecalculateXP = async () => {
    if (!window.confirm('Recalculate XP for all ideas? This will fix any XP calculation bugs.')) return
    setRecalculating(true)
    setRecalcResult(null)
    try {
      const res = await fetch('/api/admin/recalculate-xp', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setRecalcResult(`✅ Recalculated ${data.stats.ideasWithXP} ideas (Total XP: ${data.stats.totalXP}, Max: ${data.stats.maxXP})`)
        addLog('success', `Recalculated ${data.stats.ideasWithXP} ideas`)
      } else {
        setRecalcResult(`❌ ${data.error}`)
        addLog('error', data.error)
      }
    } catch {
      setRecalcResult('❌ Failed to recalculate XP')
      addLog('error', 'Failed to recalculate XP')
    } finally {
      setRecalculating(false)
    }
  }


  const fetchChallengeStats = useCallback(async () => {
    setChallengeStatsLoading(true)
    try {
      const res = await fetch('/api/admin/trigger-challenge')
      if (res.ok) setChallengeStats(await res.json())
    } catch { /* silent */ }
    setChallengeStatsLoading(false)
  }, [])

  const triggerChallenge = async () => {
    if (!window.confirm('Force ALL users to re-verify now?')) return
    setChallengeTriggering(true)
    setChallengeResult(null)
    try {
      const res = await fetch('/api/admin/trigger-challenge', { method: 'POST' })
      const data = await res.json()
      setChallengeResult(`Triggered for ${data.affected} users`)
      addLog('success', `Triggered challenge for ${data.affected} users`)
      fetchChallengeStats()
    } catch {
      setChallengeResult('Failed to trigger')
      addLog('error', 'Failed to trigger challenge')
    }
    setChallengeTriggering(false)
  }

  const handleRegisterPasskey = async () => {
    setRegistering(true)
    setRegisterMsg(null)
    try {
      const optRes = await fetch('/api/admin/webauthn/register-options')
      if (!optRes.ok) throw new Error('Failed to get registration options')
      const options = await optRes.json()
      const credential = await startRegistration({ optionsJSON: options })
      const verifyRes = await fetch('/api/admin/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, deviceName: 'Admin device' }),
      })
      if (!verifyRes.ok) throw new Error('Registration failed')
      setHasPasskeys(true)
      setRegisterMsg('Passkey registered!')
      addLog('success', 'Passkey registered')
      setTimeout(() => setRegisterMsg(null), 5000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed'
      setRegisterMsg(msg)
      addLog('error', msg)
    } finally {
      setRegistering(false)
    }
  }

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/admin/check')
        .then(res => res.json())
        .then(data => {
          setIsAdminVerified(data.isAdminVerified === true)
          setHasPasskeys(data.hasPasskeys === true)
        })
    }
  }, [status])

  useEffect(() => { fetchChallengeStats() }, [fetchChallengeStats])
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
    <FrameLayout active="chants" showBack>
      <div className="py-4 space-y-4">
        <Link href="/admin" className="text-muted hover:text-foreground text-xs inline-block">
          &larr; Back to admin
        </Link>

        <h1 className="text-sm font-bold text-foreground">Admin Test Page</h1>
        <p className="text-muted text-xs">Automated testing for deliberation flows.</p>

        {/* Auth Status */}
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 flex items-center justify-between">
          {status === 'loading' ? (
            <span className="text-muted text-xs">Loading...</span>
          ) : session ? (
            <>
              <span className="text-success text-xs">Signed in as {session.user?.email}</span>
              <button
                onClick={() => signOut()}
                className="px-3 py-1 bg-muted hover:bg-subtle text-white rounded-lg text-xs"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <span className="text-warning text-xs">Not signed in</span>
              <button
                onClick={() => signIn('google')}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs"
              >
                Sign in with Google
              </button>
            </>
          )}
        </div>

        {!session && status !== 'loading' && (
          <div className="bg-warning-bg border border-warning rounded-lg p-3">
            <p className="text-warning-hover text-xs">Please sign in to run tests.</p>
          </div>
        )}


        {/* Passkey Section */}
        <div className={`rounded-lg p-2.5 ${hasPasskeys ? 'bg-success/10 border border-success' : 'bg-warning/10 border border-warning'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div>
                <span className="text-foreground font-semibold text-xs">
                  {hasPasskeys ? 'Passkey Active' : 'No Passkey'}
                </span>
                <span className="text-muted text-[10px] ml-1">
                  {hasPasskeys
                    ? isAdminVerified ? '(4h)' : '(needs verify)'
                    : '(unprotected)'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {registerMsg && (
                <span className={`text-[10px] ${registerMsg.includes('failed') ? 'text-error' : 'text-success'}`}>
                  {registerMsg}
                </span>
              )}
              {!hasPasskeys ? (
                <button
                  onClick={handleRegisterPasskey}
                  disabled={registering}
                  className="bg-warning hover:bg-warning/80 text-background font-semibold text-xs px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {registering ? '...' : 'Register'}
                </button>
              ) : (
                <Link
                  href="/settings#security"
                  className="text-muted hover:text-foreground text-[10px] underline"
                >
                  Manage
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Challenge Control */}
        <div className="bg-error/10 border border-error rounded-lg p-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={triggerChallenge}
              disabled={challengeTriggering}
              className="bg-error hover:bg-error-hover text-white font-bold text-xs px-3 py-2 rounded-lg transition-colors disabled:opacity-50 shrink-0"
            >
              {challengeTriggering ? '...' : 'TRIGGER CHALLENGE'}
            </button>
            <div className="flex-1 min-w-0">
              {challengeResult && (
                <p className="text-success font-semibold text-[10px]">{challengeResult}</p>
              )}
              {challengeStatsLoading ? (
                <p className="text-muted text-[10px]">Loading...</p>
              ) : challengeStats && (
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <span className="text-muted">Total: <span className="text-foreground font-mono">{challengeStats.totalLogs}</span></span>
                  {challengeStats.resultCounts.map(r => (
                    <span key={r.result} className={r.result === 'passed' ? 'text-success' : 'text-error'}>
                      {r.result}: <span className="font-mono">{r.count}</span>
                    </span>
                  ))}
                  {challengeStats.flaggedUsers.length > 0 && (
                    <span className="text-warning">Flagged: <span className="font-mono">{challengeStats.flaggedUsers.length}</span></span>
                  )}
                </div>
              )}
              {challengeStats && challengeStats.recentFails.length > 0 && (
                <details className="mt-1">
                  <summary className="text-[10px] text-muted cursor-pointer hover:text-foreground">
                    Failures ({challengeStats.recentFails.length})
                  </summary>
                  <div className="mt-0.5 max-h-24 overflow-y-auto space-y-0.5">
                    {challengeStats.recentFails.slice(0, 5).map(f => (
                      <div key={f.id} className="text-[10px] text-muted bg-background rounded px-1.5 py-0.5 flex gap-2">
                        <span className="text-error font-mono">{f.result}</span>
                        <span className="truncate">{f.user.email}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>


        {/* System Utilities */}
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">System Utilities</h2>
          <div className="flex items-center gap-4">
            <button
              onClick={handleRecalculateXP}
              disabled={recalculating}
              className="px-4 py-2 bg-warning hover:bg-warning-hover text-white rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {recalculating ? 'Recalculating...' : 'Recalculate All XP'}
            </button>
            {recalcResult && (
              <span className="text-sm text-foreground">{recalcResult}</span>
            )}
          </div>
          <p className="text-xs text-muted mt-2">Fixes broken XP values by recalculating from vote records. Safe to run multiple times.</p>
        </div>

        {/* Configuration */}
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Test Configuration</h2>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-muted mb-1">Number of Users</label>
              <input
                type="number"
                value={testConfig.userCount}
                onChange={(e) => setTestConfig(prev => ({ ...prev, userCount: parseInt(e.target.value) || 10 }))}
                className="w-full bg-surface border border-border text-foreground rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
                min={5}
                max={200}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Question</label>
              <input
                type="text"
                value={testConfig.question}
                onChange={(e) => setTestConfig(prev => ({ ...prev, question: e.target.value }))}
                className="w-full bg-surface border border-border text-foreground rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="flex gap-3 mb-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-subtle">
              <input
                type="checkbox"
                checked={testConfig.simulateVoting}
                onChange={(e) => setTestConfig(prev => ({ ...prev, simulateVoting: e.target.checked }))}
                className="rounded"
              />
              Simulate voting
            </label>
            <label className="flex items-center gap-1.5 text-xs text-subtle">
              <input
                type="checkbox"
                checked={testConfig.leaveFinaVote}
                onChange={(e) => setTestConfig(prev => ({ ...prev, leaveFinaVote: e.target.checked }))}
                className="rounded"
              />
              Leave final vote
            </label>
            <label className="flex items-center gap-1.5 text-xs text-subtle">
              <input
                type="checkbox"
                checked={testConfig.accumulationEnabled}
                onChange={(e) => setTestConfig(prev => ({ ...prev, accumulationEnabled: e.target.checked }))}
                className="rounded"
              />
              Rolling mode
            </label>
          </div>

          <div className="mb-3">
            <label className="block text-xs text-muted mb-1">Additional Emails (comma-separated)</label>
            <input
              type="text"
              value={testConfig.additionalUserEmails}
              onChange={(e) => setTestConfig(prev => ({ ...prev, additionalUserEmails: e.target.value }))}
              placeholder="user2@gmail.com, user3@gmail.com"
              className="w-full bg-surface border border-border text-foreground rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={runTest}
              disabled={isRunning}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                isRunning
                  ? 'bg-muted-light text-muted cursor-not-allowed'
                  : 'bg-accent hover:bg-accent-hover text-white'
              }`}
            >
              {isRunning ? 'Running...' : 'Run Test'}
            </button>
          </div>
        </div>

        {/* Created Deliberation Link */}
        {createdDeliberation && (
          <div className="bg-success-bg border border-success rounded-lg p-3">
            <p className="text-success text-xs font-medium mb-1.5">Test Deliberation Created</p>
            <div className="flex gap-3">
              <Link
                href={`/chants/${createdDeliberation.id}`}
                className="text-accent hover:text-accent-hover underline text-xs"
              >
                View Deliberation
              </Link>
              <Link
                href={`/invite/${createdDeliberation.inviteCode}`}
                className="text-accent hover:text-accent-hover underline text-xs"
              >
                Invite Link
              </Link>
            </div>
          </div>
        )}

        {/* Logs */}
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-foreground">Logs</h2>
            <button
              onClick={clearLogs}
              className="text-xs text-muted hover:text-foreground"
            >
              Clear
            </button>
          </div>

          <div className="bg-surface rounded-lg p-3 font-mono text-xs h-48 overflow-y-auto border border-border">
            {logs.length === 0 ? (
              <p className="text-muted-light">No logs yet. Run a test to see output.</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`mb-0.5 ${
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

      </div>
    </FrameLayout>
  )
}
