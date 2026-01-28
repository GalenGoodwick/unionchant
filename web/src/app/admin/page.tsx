'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { getDisplayName } from '@/lib/user'
import Header from '@/components/Header'

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED'

interface Deliberation {
  id: string
  question: string
  phase: string
  isPublic: boolean
  tags: string[]
  createdAt: string
  creator: {
    name: string | null
    email: string
    status?: UserStatus
  }
  _count: {
    members: number
    ideas: number
  }
}

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [deliberations, setDeliberations] = useState<Deliberation[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [testQuestion, setTestQuestion] = useState('')
  const [enableRolling, setEnableRolling] = useState(false)
  const [targetPhase, setTargetPhase] = useState<'SUBMISSION' | 'VOTING' | 'ACCUMULATING'>('SUBMISSION')
  const [testUsers, setTestUsers] = useState(20)
  const [createStatus, setCreateStatus] = useState('')
  // Voting trigger options
  const [votingTrigger, setVotingTrigger] = useState<'manual' | 'timer' | 'ideas' | 'participants'>('manual')
  const [timerMinutes, setTimerMinutes] = useState(60)
  const [ideaGoal, setIdeaGoal] = useState(20)
  const [participantGoal, setParticipantGoal] = useState(10)
  const [votingMinutes, setVotingMinutes] = useState(5)
  // Deliberation type
  const [delibType, setDelibType] = useState<'STANDARD' | 'META'>('STANDARD')

  const fetchDeliberations = async () => {
    try {
      const res = await fetch('/api/admin/deliberations')
      if (res.ok) {
        const data = await res.json()
        // Ensure we have an array
        setDeliberations(Array.isArray(data) ? data : [])
      } else {
        setDeliberations([])
      }
    } catch (error) {
      console.error('Failed to fetch deliberations:', error)
      setDeliberations([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }

    if (status === 'authenticated') {
      // Check admin status
      fetch('/api/admin/check')
        .then(res => res.json())
        .then(data => {
          setIsAdmin(data.isAdmin)
          if (data.isAdmin) {
            fetchDeliberations()
          }
        })
        .catch(() => setIsAdmin(false))
    }
  }, [status, router])

  const handleDelete = async (id: string, question: string) => {
    if (!confirm(`Are you sure you want to delete "${question}"?\n\nThis will permanently delete all ideas, votes, and comments.`)) {
      return
    }

    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/deliberations/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setDeliberations(prev => prev.filter(d => d.id !== id))
      } else {
        const error = await res.json()
        alert(`Failed to delete: ${error.error}`)
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete deliberation')
    } finally {
      setDeleting(null)
    }
  }

  const filteredDeliberations = deliberations.filter(d => {
    if (filter === 'public' && !d.isPublic) return false
    if (filter === 'private' && d.isPublic) return false
    if (search && !d.question.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const phaseStyles: Record<string, string> = {
    SUBMISSION: 'bg-accent text-white',
    VOTING: 'bg-warning text-white',
    COMPLETED: 'bg-success text-white',
    ACCUMULATING: 'bg-purple text-white',
  }

  // Loading state
  if (status === 'loading' || isAdmin === null) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    )
  }

  // Block non-admin users
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Access Denied</h1>
          <p className="text-muted mb-6">You don&apos;t have permission to access this page.</p>
          <Link href="/" className="text-accent hover:text-accent-hover">
            Go to homepage
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Link href="/" className="text-muted hover:text-foreground text-sm mb-2 inline-block">
              &larr; Back to home
            </Link>
            <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-muted text-sm mt-1">Manage deliberations, run tests, and monitor activity</p>
          </div>
        </div>

        {/* Test Tools */}
        <div className="bg-background rounded-lg border border-border p-4 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-3">Create Test Deliberation</h2>

          {/* Row 1: Basic settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs text-muted mb-1">Question (optional)</label>
              <input
                type="text"
                value={testQuestion}
                onChange={(e) => setTestQuestion(e.target.value)}
                placeholder="Auto-generated if blank"
                className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                disabled={creating}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Start in Phase</label>
              <select
                value={targetPhase}
                onChange={(e) => setTargetPhase(e.target.value as 'SUBMISSION' | 'VOTING' | 'ACCUMULATING')}
                className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                disabled={creating}
              >
                <option value="SUBMISSION">SUBMISSION (empty)</option>
                <option value="VOTING">VOTING (with test users & ideas)</option>
                <option value="ACCUMULATING">ACCUMULATING (with champion)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Test Users (for VOTING/ACCUM)</label>
              <input
                type="number"
                value={testUsers}
                onChange={(e) => setTestUsers(parseInt(e.target.value) || 20)}
                min={5}
                max={100}
                className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                disabled={creating || targetPhase === 'SUBMISSION'}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Type</label>
              <select
                value={delibType}
                onChange={(e) => setDelibType(e.target.value as 'STANDARD' | 'META')}
                className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                disabled={creating}
              >
                <option value="STANDARD">Standard</option>
                <option value="META">Meta (daily question picker)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Voting trigger settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div>
              <label className="block text-xs text-muted mb-1">Voting Starts</label>
              <select
                value={votingTrigger}
                onChange={(e) => setVotingTrigger(e.target.value as 'manual' | 'timer' | 'ideas' | 'participants')}
                className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                disabled={creating || targetPhase !== 'SUBMISSION'}
              >
                <option value="manual">Manual (facilitator)</option>
                <option value="timer">Timer</option>
                <option value="ideas">Idea goal</option>
                <option value="participants">Participant goal</option>
              </select>
            </div>
            {votingTrigger === 'timer' && (
              <div>
                <label className="block text-xs text-muted mb-1">Submission Time (min)</label>
                <input
                  type="number"
                  value={timerMinutes}
                  onChange={(e) => setTimerMinutes(parseInt(e.target.value) || 60)}
                  min={1}
                  className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  disabled={creating || targetPhase !== 'SUBMISSION'}
                />
              </div>
            )}
            {votingTrigger === 'ideas' && (
              <div>
                <label className="block text-xs text-muted mb-1">Idea Goal</label>
                <input
                  type="number"
                  value={ideaGoal}
                  onChange={(e) => setIdeaGoal(parseInt(e.target.value) || 20)}
                  min={2}
                  className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  disabled={creating || targetPhase !== 'SUBMISSION'}
                />
              </div>
            )}
            {votingTrigger === 'participants' && (
              <div>
                <label className="block text-xs text-muted mb-1">Participant Goal</label>
                <input
                  type="number"
                  value={participantGoal}
                  onChange={(e) => setParticipantGoal(parseInt(e.target.value) || 10)}
                  min={2}
                  className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  disabled={creating || targetPhase !== 'SUBMISSION'}
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-muted mb-1">Voting Time/Tier (min)</label>
              <input
                type="number"
                value={votingMinutes}
                onChange={(e) => setVotingMinutes(parseInt(e.target.value) || 5)}
                min={1}
                className="w-full bg-surface border border-border text-foreground rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                disabled={creating}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-muted pb-2">
                <input
                  type="checkbox"
                  checked={enableRolling}
                  onChange={(e) => setEnableRolling(e.target.checked)}
                  className="rounded"
                  disabled={creating}
                />
                Rolling mode
              </label>
            </div>
          </div>

          {createStatus && (
            <div className="mb-4 p-2 bg-surface rounded text-sm text-muted font-mono">
              {createStatus}
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={async () => {
                setCreating(true)
                setCreateStatus('Creating deliberation...')
                try {
                  const question = testQuestion.trim() || `[TEST] ${targetPhase} Test ${Date.now()}`

                  // Build creation payload with trigger settings
                  // API expects milliseconds, so convert from minutes
                  const createPayload: Record<string, unknown> = {
                    question,
                    description: `Auto-created test deliberation (target: ${targetPhase})`,
                    isPublic: true,
                    tags: ['test'],
                    accumulationEnabled: enableRolling || targetPhase === 'ACCUMULATING',
                    votingTimeoutMs: votingMinutes * 60 * 1000, // Convert minutes to ms
                    type: delibType,
                  }

                  // Add voting trigger based on selection
                  if (votingTrigger === 'timer') {
                    createPayload.submissionDurationMs = timerMinutes * 60 * 1000 // Convert minutes to ms
                  } else if (votingTrigger === 'ideas') {
                    createPayload.ideaGoal = ideaGoal
                  } else if (votingTrigger === 'participants') {
                    createPayload.participantGoal = participantGoal
                  }
                  // 'manual' = no trigger fields set (relies on facilitator starting voting)

                  // Step 1: Create deliberation
                  const createRes = await fetch('/api/deliberations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(createPayload),
                  })

                  if (!createRes.ok) {
                    const err = await createRes.json()
                    throw new Error(err.error || 'Failed to create')
                  }

                  const deliberation = await createRes.json()

                  if (targetPhase === 'SUBMISSION') {
                    // Done - just redirect
                    router.push(`/admin/deliberation/${deliberation.id}`)
                    return
                  }

                  // Step 2: Populate with test users and ideas
                  setCreateStatus(`Creating ${testUsers} test users and ideas...`)
                  const populateRes = await fetch('/api/admin/test/populate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      deliberationId: deliberation.id,
                      userCount: testUsers,
                    }),
                  })

                  if (!populateRes.ok) {
                    throw new Error('Failed to populate test users')
                  }

                  // Step 3: Start voting
                  setCreateStatus('Starting voting phase...')
                  const startRes = await fetch(`/api/deliberations/${deliberation.id}/start-voting`, {
                    method: 'POST',
                  })

                  if (!startRes.ok) {
                    throw new Error('Failed to start voting')
                  }

                  if (targetPhase === 'VOTING') {
                    // Done - redirect to voting state
                    setCreateStatus('Done! Redirecting...')
                    router.push(`/admin/deliberation/${deliberation.id}`)
                    return
                  }

                  // Step 4: Simulate voting to get champion (for ACCUMULATING)
                  setCreateStatus('Simulating voting through tiers...')
                  const simRes = await fetch('/api/admin/test/simulate-voting', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      deliberationId: deliberation.id,
                      leaveFinalVote: false,
                    }),
                  })

                  if (!simRes.ok) {
                    throw new Error('Failed to simulate voting')
                  }

                  setCreateStatus('Done! Redirecting...')
                  router.push(`/admin/deliberation/${deliberation.id}`)

                } catch (err) {
                  setCreateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
                } finally {
                  setCreating(false)
                }
              }}
              disabled={creating}
              className="bg-accent hover:bg-accent-hover disabled:bg-muted text-white px-6 py-2 rounded transition-colors text-sm font-medium"
            >
              {creating ? 'Creating...' : 'Create & Open'}
            </button>
            <button
              onClick={async () => {
                if (!confirm('Delete all deliberations with [TEST] in the name?')) return
                try {
                  const res = await fetch('/api/admin/test/cleanup', { method: 'POST' })
                  if (res.ok) {
                    const data = await res.json()
                    alert(`Cleaned up ${data.deleted} test deliberations`)
                    fetchDeliberations()
                  }
                } catch {
                  alert('Cleanup failed')
                }
              }}
              className="bg-error hover:bg-error-hover text-white px-4 py-2 rounded transition-colors text-sm"
            >
              Cleanup [TEST]
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/cron/tick')
                  const data = await res.json()
                  alert(`Timer check: ${data.processed} transitions processed`)
                  fetchDeliberations()
                } catch {
                  alert('Timer check failed')
                }
              }}
              className="bg-surface hover:bg-header hover:text-white text-muted border border-border px-4 py-2 rounded transition-colors text-sm"
            >
              Check Timers
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-background rounded-lg border border-border p-4">
            <div className="text-3xl font-bold text-foreground font-mono">{deliberations.length}</div>
            <div className="text-muted text-sm">{isAdmin ? 'All Deliberations' : 'Your Deliberations'}</div>
          </div>
          <div className="bg-background rounded-lg border border-border p-4">
            <div className="text-3xl font-bold text-accent font-mono">
              {deliberations.filter(d => d.phase === 'SUBMISSION').length}
            </div>
            <div className="text-muted text-sm">In Submission</div>
          </div>
          <div className="bg-background rounded-lg border border-border p-4">
            <div className="text-3xl font-bold text-warning font-mono">
              {deliberations.filter(d => d.phase === 'VOTING').length}
            </div>
            <div className="text-muted text-sm">In Voting</div>
          </div>
          <div className="bg-background rounded-lg border border-border p-4">
            <div className="text-3xl font-bold text-success font-mono">
              {deliberations.filter(d => d.phase === 'COMPLETED').length}
            </div>
            <div className="text-muted text-sm">Completed</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-background rounded-lg border border-border p-4 mb-6 flex gap-4 items-center flex-wrap">
          <input
            type="text"
            placeholder="Search deliberations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-surface border border-border text-foreground rounded-lg px-3 py-2 flex-1 min-w-[200px] focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'all' ? 'bg-header text-white' : 'bg-surface text-muted border border-border'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('public')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'public' ? 'bg-header text-white' : 'bg-surface text-muted border border-border'
              }`}
            >
              Public
            </button>
            <button
              onClick={() => setFilter('private')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'private' ? 'bg-header text-white' : 'bg-surface text-muted border border-border'
              }`}
            >
              Private
            </button>
          </div>
          <button
            onClick={fetchDeliberations}
            className="bg-surface hover:bg-surface-alt text-muted border border-border px-3 py-2 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Deliberations Table */}
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted">Loading...</div>
          ) : filteredDeliberations.length === 0 ? (
            <div className="p-8 text-center text-muted">No deliberations found</div>
          ) : (
            <table className="w-full">
              <thead className="bg-surface border-b border-border">
                <tr>
                  <th className="text-left p-4 text-muted font-medium text-sm">Question</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Phase</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Members</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Ideas</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Creator</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Created</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeliberations.map((d) => (
                  <tr key={d.id} className="border-t border-border hover:bg-surface">
                    <td className="p-4">
                      <Link href={`/admin/deliberation/${d.id}`} className="text-foreground hover:text-accent font-medium">
                        {d.question.length > 50 ? d.question.slice(0, 50) + '...' : d.question}
                      </Link>
                      <div className="flex gap-1 mt-1">
                        {!d.isPublic && (
                          <span className="text-xs bg-surface text-muted px-1.5 py-0.5 rounded border border-border">
                            Private
                          </span>
                        )}
                        {d.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-xs bg-accent-light text-accent px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${phaseStyles[d.phase] || 'bg-surface text-muted'}`}>
                        {d.phase}
                      </span>
                    </td>
                    <td className="p-4 text-muted font-mono">{d._count.members}</td>
                    <td className="p-4 text-muted font-mono">{d._count.ideas}</td>
                    <td className="p-4 text-muted-light text-sm">
                      {getDisplayName(d.creator, d.creator.email.split('@')[0])}
                    </td>
                    <td className="p-4 text-muted-light text-sm font-mono">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-3">
                        <Link
                          href={`/admin/deliberation/${d.id}`}
                          className="text-accent hover:text-accent-hover text-sm font-medium"
                        >
                          Manage
                        </Link>
                        <Link
                          href={`/deliberations/${d.id}`}
                          className="text-muted hover:text-foreground text-sm"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => handleDelete(d.id, d.question)}
                          disabled={deleting === d.id}
                          className="text-error hover:text-error-hover text-sm disabled:opacity-50"
                        >
                          {deleting === d.id ? '...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
