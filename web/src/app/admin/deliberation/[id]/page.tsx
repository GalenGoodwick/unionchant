'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'

interface Deliberation {
  id: string
  question: string
  description: string | null
  organization: string | null
  inviteCode: string | null
  phase: string
  currentTier: number
  createdAt: string
  ideaGoal: number | null
  submissionEndsAt: string | null
  isPublic: boolean
  _count: {
    ideas: number
    members: number
    cells: number
  }
  cells: Cell[]
  ideas: Idea[]
}

interface Cell {
  id: string
  tier: number
  batch: number | null
  status: string
  participants: { userId: string; status: string }[]
  ideas: { idea: { id: string; text: string; totalVotes: number } }[]
  comments: Comment[]
  _count: { votes: number }
}

interface Idea {
  id: string
  text: string
  status: string
  tier: number
  totalVotes: number
  totalXP: number
  isChampion: boolean
}

interface Comment {
  id: string
  text: string
  upvoteCount: number
  reachTier: number
  user: { name: string | null }
  idea: { text: string } | null
}

interface TestProgress {
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
  logs: string[]
  existingTestAgents?: number
}

export default function AdminDeliberationPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const deliberationId = params.id as string

  const [deliberation, setDeliberation] = useState<Deliberation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Email invite state
  const [inviteEmails, setInviteEmails] = useState('')
  const [sendingInvites, setSendingInvites] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ sent: number; failed: number } | null>(null)
  const [copiedInviteLink, setCopiedInviteLink] = useState(false)

  // AI Test state
  const [testRunning, setTestRunning] = useState(false)
  const [testProgress, setTestProgress] = useState<TestProgress | null>(null)
  const [agentCount, setAgentCount] = useState(20)
  const [commentRate, setCommentRate] = useState(0.4)
  const [upvoteRate, setUpvoteRate] = useState(0.6)
  const [votingTime, setVotingTime] = useState(5000)
  const [excludeAdmin, setExcludeAdmin] = useState(true)
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-50), `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  const fetchDeliberation = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/deliberation/${deliberationId}`)
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/auth/signin')
          return
        }
        throw new Error('Failed to fetch')
      }
      const data = await res.json()
      setDeliberation(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [deliberationId, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchDeliberation()
      const interval = setInterval(fetchDeliberation, 3000)
      return () => clearInterval(interval)
    }
  }, [status, fetchDeliberation])

  // Poll for test progress
  useEffect(() => {
    if (!testRunning) return

    const pollProgress = async () => {
      try {
        const res = await fetch('/api/admin/test/ai-agents')
        if (res.ok) {
          const data = await res.json()
          setTestProgress(data)

          if (data.phase === 'completed') {
            setTestRunning(false)
            addLog(`Test completed! Tiers: ${data.totalTiers}, Votes: ${data.votescast}`)
            if (data.errors?.length > 0) {
              data.errors.forEach((e: string) => addLog(`Error: ${e}`))
            }
          }
        }
      } catch (err) {
        console.error('Failed to poll progress:', err)
      }
    }

    const interval = setInterval(pollProgress, 1000)
    return () => clearInterval(interval)
  }, [testRunning])

  const startAITest = async () => {
    // Validate required fields
    if (!agentCount || agentCount < 5) {
      alert('Agents must be at least 5')
      return
    }
    if (!votingTime || votingTime < 1000) {
      alert('Voting time must be at least 1000ms')
      return
    }

    setTestRunning(true)
    setLogs([])
    addLog(`Starting AI test with ${agentCount} agents...`)

    try {
      const res = await fetch('/api/admin/test/ai-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliberationId,
          totalAgents: agentCount,
          votingTimePerTierMs: votingTime,
          commentRate,
          upvoteRate,
          forceStartVoting: true,
          excludeAdmin,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start')
      }

      addLog('AI test started successfully')
    } catch (err) {
      setTestRunning(false)
      addLog(`Failed to start: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const cleanupAgents = async () => {
    addLog('Cleaning up test agents...')
    try {
      const res = await fetch('/api/admin/test/ai-agents', { method: 'DELETE' })
      if (res.ok) {
        const data = await res.json()
        addLog(`Cleaned up ${data.deleted} test agents`)
      }
    } catch (err) {
      addLog('Failed to cleanup')
    }
  }

  const forceProcessTier = async () => {
    addLog('Force processing current tier...')
    try {
      const res = await fetch(`/api/admin/deliberation/${deliberationId}/force-process-tier`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        addLog(`Processed ${data.cellsProcessed} cells`)
        fetchDeliberation()
      } else {
        const data = await res.json()
        addLog(`Failed: ${data.error}`)
      }
    } catch (err) {
      addLog('Failed to process tier')
    }
  }

  const forceEndVoting = async () => {
    if (!confirm('This will end all voting and complete the deliberation. Are you sure?')) {
      return
    }
    addLog('Force ending voting...')
    try {
      const res = await fetch(`/api/admin/deliberation/${deliberationId}/force-end-voting`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        addLog(`Voting ended. Winner: ${data.winner || 'None'}`)
        fetchDeliberation()
      } else {
        const data = await res.json()
        addLog(`Failed: ${data.error}`)
      }
    } catch (err) {
      addLog('Failed to end voting')
    }
  }

  const resetDeliberation = async () => {
    if (!confirm('This will delete all votes, cells, and reset ideas. Are you sure?')) {
      return
    }
    addLog('Resetting deliberation...')
    try {
      const res = await fetch(`/api/admin/deliberation/${deliberationId}/reset`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        addLog(`Reset complete. Deleted ${data.deletedCells} cells.`)
        setTestProgress(null)
        fetchDeliberation()
      } else {
        const data = await res.json()
        addLog(`Failed: ${data.error}`)
      }
    } catch (err) {
      addLog('Failed to reset deliberation')
    }
  }

  const startVoting = async () => {
    addLog('Starting voting phase...')
    try {
      const res = await fetch(`/api/deliberations/${deliberationId}/start-voting`, {
        method: 'POST',
      })
      if (res.ok) {
        addLog('Voting started!')
        fetchDeliberation()
      } else {
        const data = await res.json()
        addLog(`Failed: ${data.error}`)
      }
    } catch (err) {
      addLog('Failed to start voting')
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse h-8 bg-surface rounded w-1/3" />
        </div>
      </div>
    )
  }

  if (error || !deliberation) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-error-bg text-error p-4 rounded-lg">
            {error || 'Deliberation not found'}
          </div>
        </div>
      </div>
    )
  }

  const phaseColors: Record<string, string> = {
    SUBMISSION: 'bg-accent',
    VOTING: 'bg-warning',
    ACCUMULATING: 'bg-purple',
    COMPLETED: 'bg-success',
  }

  const upPollinatedComments = deliberation.cells
    .flatMap(c => c.comments)
    .filter(c => c.reachTier > 1)
    .sort((a, b) => b.reachTier - a.reachTier)

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-6xl mx-auto px-4 py-6">
        <Link href="/admin" className="text-muted hover:text-foreground text-sm mb-4 inline-block">
          &larr; Back to Admin
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{deliberation.question}</h1>
            {deliberation.organization && (
              <div className="text-sm text-muted mt-1">{deliberation.organization}</div>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className={`px-2 py-1 rounded text-white text-sm ${phaseColors[deliberation.phase] || 'bg-muted'}`}>
                {deliberation.phase}
              </span>
              <span className={`px-2 py-1 rounded text-sm ${deliberation.isPublic ? 'bg-success-bg text-success border border-success' : 'bg-error-bg text-error border border-error'}`}>
                {deliberation.isPublic ? 'Public' : 'Private'}
              </span>
              <span className="text-muted">Tier {deliberation.currentTier}</span>
              <span className="text-muted">{deliberation._count.members} members</span>
              <span className="text-muted">{deliberation._count.ideas} ideas</span>
            </div>
            {/* Voting Trigger */}
            <div className="mt-2 text-sm">
              <span className="text-muted">Voting starts: </span>
              <span className="text-foreground">
                {deliberation.ideaGoal ? (
                  `At ${deliberation.ideaGoal} ideas (${deliberation._count.ideas}/${deliberation.ideaGoal})`
                ) : deliberation.submissionEndsAt ? (
                  `Timer: ${new Date(deliberation.submissionEndsAt).toLocaleString()}`
                ) : (
                  'Facilitator-controlled (manual)'
                )}
              </span>
            </div>
          </div>
          <Link
            href={`/chants/${deliberation.id}`}
            className="text-accent hover:underline"
          >
            View Public Page &rarr;
          </Link>
        </div>

        {/* Champion Banner */}
        {(() => {
          const champion = deliberation.ideas.find(i => i.isChampion || i.status === 'WINNER')
          if (!champion) return null
          return (
            <div className={`mb-6 p-4 rounded-lg border ${
              deliberation.phase === 'ACCUMULATING'
                ? 'bg-purple-bg border-purple'
                : 'bg-success-bg border-success'
            }`}>
              <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${
                deliberation.phase === 'ACCUMULATING' ? 'text-purple' : 'text-success'
              }`}>
                {deliberation.phase === 'ACCUMULATING' ? 'Champion (Accepting Challengers)' : 'Winner'}
              </div>
              <p className="text-foreground font-medium text-lg">{champion.text}</p>
              <p className="text-muted text-sm mt-1">{champion.totalXP || champion.totalVotes} total VP</p>
            </div>
          )
        })()}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - AI Testing */}
          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-lg p-4">
              <h2 className="text-lg font-semibold text-foreground mb-4">AI Agent Testing</h2>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-muted mb-1">Agents</label>
                    <input
                      type="number"
                      min={5}
                      max={200}
                      value={agentCount || ''}
                      onChange={(e) => setAgentCount(parseInt(e.target.value) || 0)}
                      disabled={testRunning}
                      className="w-full bg-background border border-border rounded px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-muted mb-1">Comment Rate</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={commentRate > 0}
                        onChange={(e) => setCommentRate(e.target.checked ? 0.4 : 0)}
                        disabled={testRunning}
                        className="w-4 h-4 accent-accent"
                      />
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.1}
                        value={commentRate}
                        onChange={(e) => setCommentRate(parseFloat(e.target.value) || 0)}
                        disabled={testRunning || commentRate === 0}
                        className={`flex-1 border border-border rounded px-3 py-2 font-mono text-sm ${commentRate === 0 ? 'bg-surface text-muted' : 'bg-background'}`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-muted mb-1">Upvote Rate</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={upvoteRate > 0}
                        onChange={(e) => setUpvoteRate(e.target.checked ? 0.6 : 0)}
                        disabled={testRunning}
                        className="w-4 h-4 accent-accent"
                      />
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.1}
                        value={upvoteRate}
                        onChange={(e) => setUpvoteRate(parseFloat(e.target.value) || 0)}
                        disabled={testRunning || upvoteRate === 0}
                        className={`flex-1 border border-border rounded px-3 py-2 font-mono text-sm ${upvoteRate === 0 ? 'bg-surface text-muted' : 'bg-background'}`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-muted mb-1">Voting Time (ms)</label>
                    <input
                      type="number"
                      min={1000}
                      max={60000}
                      step={1000}
                      value={votingTime || ''}
                      onChange={(e) => setVotingTime(parseInt(e.target.value) || 0)}
                      disabled={testRunning}
                      className="w-full bg-background border border-border rounded px-3 py-2 font-mono text-sm"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excludeAdmin}
                    onChange={(e) => setExcludeAdmin(e.target.checked)}
                    disabled={testRunning}
                    className="w-4 h-4 accent-accent"
                  />
                  Remove me from deliberation (skip voting)
                </label>

                {(deliberation.phase === 'COMPLETED' || deliberation.phase === 'ACCUMULATING') && (
                  <div className={`p-3 rounded text-sm mb-2 ${
                    deliberation.phase === 'COMPLETED'
                      ? 'bg-success-bg border border-success text-success'
                      : 'bg-purple-bg border border-purple text-purple'
                  }`}>
                    Deliberation is {deliberation.phase.toLowerCase()} — reset to submission to re-test.
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={startAITest}
                    disabled={testRunning || deliberation.phase === 'COMPLETED' || deliberation.phase === 'ACCUMULATING'}
                    className="bg-accent hover:bg-accent-hover disabled:bg-muted text-white px-4 py-2 rounded transition-colors"
                  >
                    {testRunning ? 'Running...' : 'Start AI Test'}
                  </button>
                  <button
                    onClick={async () => {
                      addLog('Stopping test...')
                      await fetch('/api/admin/test/ai-agents', { method: 'PUT' })
                    }}
                    disabled={!testRunning}
                    className="bg-warning hover:bg-warning-hover disabled:bg-muted text-black px-4 py-2 rounded transition-colors"
                  >
                    Stop Test
                  </button>
                  <button
                    onClick={cleanupAgents}
                    disabled={testRunning}
                    className="bg-error hover:bg-error-hover disabled:bg-muted text-white px-4 py-2 rounded transition-colors"
                  >
                    Cleanup Agents
                  </button>
                </div>

                {/* Progress */}
                {testProgress && (
                  <div className="bg-background rounded p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Phase:</span>
                      <span className="text-foreground font-medium">{testProgress.phase}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Tier:</span>
                      <span className="text-foreground font-mono">{testProgress.currentTier}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Agents:</span>
                      <span className="text-foreground font-mono">{testProgress.agentsCreated}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Ideas:</span>
                      <span className="text-foreground font-mono">{testProgress.ideasSubmitted}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Votes:</span>
                      <span className="text-foreground font-mono">{testProgress.votescast}</span>
                    </div>
                  </div>
                )}

                {/* Logs - combine client and server logs */}
                <div className="bg-black rounded p-3 h-48 overflow-y-auto font-mono text-xs">
                  {logs.length === 0 && (!testProgress?.logs || testProgress.logs.length === 0) ? (
                    <span className="text-muted">Logs will appear here...</span>
                  ) : (
                    <>
                      {logs.map((log, i) => (
                        <div key={`client-${i}`} className="text-success">{log}</div>
                      ))}
                      {testProgress?.logs?.map((log, i) => (
                        <div key={`server-${i}`} className="text-cyan-400">{log}</div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Manual Controls */}
            <div className="bg-surface border border-border rounded-lg p-4">
              <h2 className="text-lg font-semibold text-foreground mb-2">Manual Controls</h2>
              <p className="text-sm text-muted mb-4">Current phase: <span className="font-medium text-foreground">{deliberation.phase}</span></p>

              <div className="space-y-3">
                <button
                  onClick={startVoting}
                  disabled={deliberation.phase !== 'SUBMISSION'}
                  className="w-full bg-warning hover:bg-warning/80 disabled:bg-muted disabled:text-muted-light text-black font-medium px-4 py-2 rounded transition-colors"
                >
                  Start Voting Now
                </button>

                <button
                  onClick={forceProcessTier}
                  disabled={deliberation.phase !== 'VOTING'}
                  className="w-full bg-orange hover:bg-orange/80 disabled:bg-muted disabled:text-muted-light text-white font-medium px-4 py-2 rounded transition-colors"
                >
                  Force Process Current Tier
                </button>
                <p className="text-xs text-muted">
                  Processes all active voting cells as if timer expired.
                </p>

                <button
                  onClick={forceEndVoting}
                  disabled={deliberation.phase !== 'VOTING'}
                  className="w-full bg-error hover:bg-error-hover disabled:bg-muted disabled:text-muted-light text-white font-medium px-4 py-2 rounded transition-colors"
                >
                  Force End All Voting
                </button>
                <p className="text-xs text-muted">
                  Immediately ends voting and picks winner with most votes.
                </p>

                <button
                  onClick={resetDeliberation}
                  className="w-full bg-error hover:bg-error-hover text-white font-medium px-4 py-2 rounded transition-colors mt-4"
                >
                  Reset to Submission
                </button>
                <p className="text-xs text-muted">
                  Deletes all cells, votes, and resets ideas. Use for re-testing.
                </p>
              </div>
            </div>

            {/* Up-Pollination Status */}
            <div className="bg-surface border border-border rounded-lg p-4">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Up-Pollinated Comments ({upPollinatedComments.length})
              </h2>

              {upPollinatedComments.length === 0 ? (
                <p className="text-muted text-sm">
                  No comments have up-pollinated yet. Comments need 60% of cell participants to upvote them to advance to the next tier.
                </p>
              ) : (
                <div className="space-y-2">
                  {upPollinatedComments.slice(0, 10).map(comment => (
                    <div key={comment.id} className="bg-purple/10 border border-purple/30 rounded p-2">
                      <div className="flex items-center gap-2 text-xs text-purple mb-1">
                        <span>Reached Tier {comment.reachTier}</span>
                        <span>•</span>
                        <span>{comment.upvoteCount} upvotes</span>
                      </div>
                      <p className="text-sm text-foreground">{comment.text}</p>
                      <p className="text-xs text-muted mt-1">— {comment.user.name || 'Anonymous'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Email Invites */}
            <div className="bg-surface border border-border rounded-lg p-4">
              <h2 className="text-lg font-semibold text-foreground mb-4">Invite Members</h2>

              {/* Invite link */}
              {deliberation.inviteCode && (
                <div className="mb-4">
                  <label className="text-xs text-muted block mb-1">Invite link</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${deliberation.inviteCode}`}
                      className="flex-1 bg-background border border-border text-foreground rounded px-3 py-2 text-sm font-mono"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/invite/${deliberation.inviteCode}`)
                        setCopiedInviteLink(true)
                        setTimeout(() => setCopiedInviteLink(false), 2000)
                      }}
                      className="bg-accent hover:bg-accent-hover text-white px-3 py-2 rounded text-sm transition-colors"
                    >
                      {copiedInviteLink ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              {/* Email invites */}
              <form onSubmit={async (e) => {
                e.preventDefault()
                const emails = inviteEmails.split(/[,\n]/).map(e => e.trim()).filter(Boolean)
                if (emails.length === 0) return
                setSendingInvites(true)
                setInviteResult(null)
                try {
                  const res = await fetch(`/api/deliberations/${deliberationId}/invite`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ emails }),
                  })
                  const data = await res.json()
                  if (res.ok) {
                    setInviteResult({ sent: data.sent, failed: data.failed })
                    setInviteEmails('')
                  } else {
                    addLog(`Invite error: ${data.error || 'Failed to send'}`)
                  }
                } catch {
                  addLog('Failed to send invites')
                } finally {
                  setSendingInvites(false)
                }
              }}>
                <label className="text-xs text-muted block mb-1">Send email invites</label>
                <textarea
                  placeholder="Enter emails, separated by commas or newlines"
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                  rows={3}
                  className="w-full bg-background border border-border text-foreground rounded px-3 py-2 text-sm mb-2 resize-none"
                />
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={sendingInvites || !inviteEmails.trim()}
                    className="bg-accent hover:bg-accent-hover disabled:bg-muted text-white px-4 py-2 rounded text-sm transition-colors"
                  >
                    {sendingInvites ? 'Sending...' : 'Send Invites'}
                  </button>
                  {inviteResult && (
                    <span className="text-sm text-success">
                      {inviteResult.sent} sent{inviteResult.failed > 0 ? `, ${inviteResult.failed} failed` : ''}
                    </span>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Right Column - Deliberation State */}
          <div className="space-y-4">
            {/* Active Cells - Grouped by Tier and Batch */}
            <div className="bg-surface border border-border rounded-lg p-4">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Active Cells ({deliberation.cells.filter(c => c.status === 'VOTING').length})
              </h2>

              <div className="space-y-4 max-h-96 overflow-y-auto">
                {/* Group by tier */}
                {Array.from(new Set(deliberation.cells.map(c => c.tier)))
                  .sort((a, b) => b - a)
                  .map(tier => {
                    const tierCells = deliberation.cells.filter(c => c.tier === tier)
                    const batches = [...new Set(tierCells.map(c => c.batch ?? 0))].sort((a, b) => a - b)
                    const hasMultipleBatches = tier > 1 && batches.length > 1
                    const isCurrentTier = tier === deliberation.currentTier

                    return (
                      <div key={tier} className={isCurrentTier ? '' : 'opacity-60'}>
                        <div className="text-xs text-muted mb-2 flex items-center gap-2">
                          <span className={`font-medium ${isCurrentTier ? 'text-warning' : 'text-success'}`}>
                            Tier {tier}
                          </span>
                          <span>
                            {(() => {
                              const totalParticipants = tierCells.reduce((sum, c) => sum + c.participants.length, 0)
                              return hasMultipleBatches
                                ? `(${batches.length} batches, ${tierCells.length} cells, ${totalParticipants} people)`
                                : `(${tierCells.length} cells, ${totalParticipants} people)`
                            })()}
                          </span>
                        </div>

                        {/* Group by batch if tier 2+ */}
                        {tier > 1 && hasMultipleBatches ? (
                          <div className="space-y-2">
                            {batches.map(batch => {
                              const batchCells = tierCells.filter(c => (c.batch ?? 0) === batch)
                              const batchIdeas = batchCells[0]?.ideas.map(i => i.idea.text.slice(0, 30)) || []

                              return (
                                <div key={batch} className="border-l-2 border-accent/30 pl-3">
                                  <div className="text-xs text-accent mb-1 flex items-center gap-2">
                                    <span className="font-medium">Batch {batch + 1}</span>
                                    <span className="text-muted">({batchCells.length} cells, {batchCells[0]?.ideas.length || 0} ideas, {batchCells.reduce((sum, c) => sum + c.participants.length, 0)} people)</span>
                                  </div>
                                  <div className="flex gap-2 flex-wrap">
                                    {batchCells.map(cell => (
                                      <div
                                        key={cell.id}
                                        className={`px-2 py-1 rounded text-xs font-mono ${
                                          cell.status === 'VOTING'
                                            ? 'bg-warning-bg border border-warning text-warning'
                                            : 'bg-success-bg border border-success text-success'
                                        }`}
                                        title={batchIdeas.join(', ')}
                                      >
                                        {cell._count.votes}/{cell.participants.length}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          /* Flat layout for tier 1 or single batch */
                          <div className="flex gap-2 flex-wrap">
                            {tierCells.map(cell => (
                              <div
                                key={cell.id}
                                className={`px-2 py-1 rounded text-xs font-mono ${
                                  cell.status === 'VOTING'
                                    ? 'bg-warning-bg border border-warning text-warning'
                                    : 'bg-success-bg border border-success text-success'
                                }`}
                              >
                                {cell._count.votes}/{cell.participants.length}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                {deliberation.cells.length === 0 && (
                  <p className="text-muted text-sm">No cells yet</p>
                )}
              </div>

              {/* Legend */}
              <div className="flex gap-4 mt-4 pt-3 border-t border-border text-xs text-muted">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-warning-bg border border-warning"></div>
                  <span>Voting</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-success-bg border border-success"></div>
                  <span>Complete</span>
                </div>
              </div>
            </div>

            {/* Ideas by Status */}
            <div className="bg-surface border border-border rounded-lg p-4">
              <h2 className="text-lg font-semibold text-foreground mb-4">Ideas by Status ({deliberation.ideas.length} total)</h2>

              <div className="grid grid-cols-2 gap-4">
                {/* Status breakdown */}
                <div className="space-y-2">
                  <div className="text-xs text-muted uppercase tracking-wide mb-2">By Status</div>
                  {['SUBMITTED', 'PENDING', 'IN_VOTING', 'ADVANCING', 'WINNER', 'ELIMINATED', 'DEFENDING', 'BENCHED', 'RETIRED', 'POOLED'].map(status => {
                    const ideas = deliberation.ideas.filter(i => i.status === status)
                    return (
                      <div key={status} className="flex justify-between items-center">
                        <span className={`text-sm ${ideas.length > 0 ? 'text-foreground' : 'text-muted-light'}`}>{status}</span>
                        <span className={`text-sm font-mono ${ideas.length > 0 ? 'text-foreground' : 'text-muted-light'}`}>{ideas.length}</span>
                      </div>
                    )
                  })}
                </div>

                {/* Tier breakdown */}
                <div className="space-y-2">
                  <div className="text-xs text-muted uppercase tracking-wide mb-2">By Tier Reached</div>
                  {(() => {
                    const maxTier = Math.max(...deliberation.ideas.map(i => i.tier), 0)
                    return Array.from({ length: maxTier + 1 }, (_, tier) => {
                      const ideas = deliberation.ideas.filter(i => i.tier === tier)
                      return (
                        <div key={tier} className="flex justify-between items-center">
                          <span className={`text-sm ${ideas.length > 0 ? 'text-foreground' : 'text-muted-light'}`}>
                            Tier {tier}
                          </span>
                          <span className={`text-sm font-mono ${ideas.length > 0 ? 'text-foreground' : 'text-muted-light'}`}>
                            {ideas.length}
                          </span>
                        </div>
                      )
                    })
                  })()}
                  {deliberation.ideas.every(i => i.tier === 0) && (
                    <div className="text-muted text-sm">No tiers yet</div>
                  )}
                </div>
              </div>

              {/* All Ideas List */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="text-xs text-muted uppercase tracking-wide mb-2">All Ideas</div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {deliberation.ideas
                    .sort((a, b) => b.tier - a.tier || b.totalVotes - a.totalVotes)
                    .map(idea => (
                      <div key={idea.id} className="flex items-center gap-2 text-xs p-1.5 bg-background rounded">
                        <span className={`px-1.5 py-0.5 rounded text-white ${
                          idea.isChampion ? 'bg-success' :
                          idea.status === 'WINNER' ? 'bg-success' :
                          idea.status === 'ADVANCING' ? 'bg-accent' :
                          idea.status === 'ELIMINATED' ? 'bg-error' :
                          'bg-muted'
                        }`}>
                          T{idea.tier}
                        </span>
                        <span className="text-muted font-mono">{idea.totalXP || idea.totalVotes} VP</span>
                        <span className="text-foreground truncate flex-1" title={idea.text}>
                          {idea.text.slice(0, 60)}{idea.text.length > 60 ? '...' : ''}
                        </span>
                        <span className={`text-xs ${
                          idea.status === 'WINNER' ? 'text-success' :
                          idea.status === 'ADVANCING' ? 'text-accent' :
                          idea.status === 'ELIMINATED' ? 'text-error' :
                          'text-muted'
                        }`}>
                          {idea.status}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Show any unexpected statuses */}
              {deliberation.ideas
                .filter(i => !['SUBMITTED', 'PENDING', 'IN_VOTING', 'ADVANCING', 'WINNER', 'ELIMINATED', 'DEFENDING', 'BENCHED', 'RETIRED', 'POOLED'].includes(i.status))
                .length > 0 && (
                  <div className="text-warning text-sm mt-2">
                    Unknown statuses: {[...new Set(deliberation.ideas.filter(i => !['SUBMITTED', 'PENDING', 'IN_VOTING', 'ADVANCING', 'WINNER', 'ELIMINATED', 'DEFENDING', 'BENCHED', 'RETIRED', 'POOLED'].includes(i.status)).map(i => i.status))].join(', ')}
                  </div>
                )}

              {/* Champion */}
              {deliberation.ideas.filter(i => i.isChampion).map(idea => (
                <div key={idea.id} className="mt-4 bg-success/10 border border-success/30 rounded p-2">
                  <div className="text-xs text-success mb-1">Champion</div>
                  <p className="text-sm text-foreground">{idea.text}</p>
                </div>
              ))}
            </div>

            {/* All Comments */}
            <div className="bg-surface border border-border rounded-lg p-4">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Recent Comments ({deliberation.cells.reduce((sum, c) => sum + c.comments.length, 0)})
              </h2>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {deliberation.cells
                  .flatMap(c => c.comments.map(comment => ({ ...comment, tier: c.tier })))
                  .slice(0, 20)
                  .map(comment => (
                    <div key={comment.id} className="bg-background rounded p-2">
                      <div className="flex items-center gap-2 text-xs text-muted mb-1">
                        <span>Tier {comment.tier}</span>
                        <span>•</span>
                        <span>{comment.upvoteCount} upvotes</span>
                        {comment.reachTier > 1 && (
                          <span className="text-purple">• Reached T{comment.reachTier}</span>
                        )}
                      </div>
                      {comment.idea && (
                        <p className="text-xs text-accent mb-1 truncate">Re: {comment.idea.text}</p>
                      )}
                      <p className="text-sm text-foreground">{comment.text}</p>
                    </div>
                  ))}
                {deliberation.cells.reduce((sum, c) => sum + c.comments.length, 0) === 0 && (
                  <p className="text-muted text-sm">No comments yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
