'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { phaseLabel } from '@/lib/labels'

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
  votingTimeoutMs: number
  accumulationEnabled: boolean
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

export default function DashboardDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const deliberationId = params.id as string

  const [deliberation, setDeliberation] = useState<Deliberation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Invite state
  const [inviteEmails, setInviteEmails] = useState('')
  const [sendingInvites, setSendingInvites] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ sent: number; failed: number } | null>(null)
  const [copiedInviteLink, setCopiedInviteLink] = useState(false)

  // Settings state
  const [editingTimer, setEditingTimer] = useState(false)
  const [timerValue, setTimerValue] = useState(0)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalValue, setGoalValue] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Linked podiums
  const [linkedPodiums, setLinkedPodiums] = useState<Array<{
    id: string; title: string; views: number; pinned: boolean; createdAt: string
    author: { id: string; name: string | null }
  }>>([])
  const [podiumsLoading, setPodiumsLoading] = useState(true)

  // Action state
  const [actionLoading, setActionLoading] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmForce, setConfirmForce] = useState(false)
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [confirmChallenge, setConfirmChallenge] = useState(false)

  const fetchDeliberation = useCallback(async () => {
    try {
      const res = await fetch(`/api/deliberations/${deliberationId}/manage`)
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/auth/signin')
          return
        }
        if (res.status === 403) {
          setError('You do not have access to manage this deliberation.')
          setLoading(false)
          return
        }
        throw new Error('Failed to fetch')
      }
      const data = await res.json()
      setDeliberation(data)
      if (!editingTimer) setTimerValue(Math.round(data.votingTimeoutMs / 60000))
      if (!editingGoal) setGoalValue(data.ideaGoal)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [deliberationId, router, editingTimer, editingGoal])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }
    if (status === 'authenticated') {
      fetchDeliberation()
      // Fetch linked podiums
      fetch(`/api/podiums?deliberationId=${deliberationId}&limit=20`)
        .then(res => res.ok ? res.json() : { items: [] })
        .then(data => setLinkedPodiums(data.items || []))
        .catch(() => {})
        .finally(() => setPodiumsLoading(false))
      const interval = setInterval(fetchDeliberation, 5000)
      return () => clearInterval(interval)
    }
  }, [status, fetchDeliberation])

  const patchSettings = async (data: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/deliberations/${deliberationId}/manage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json()
        setActionMessage(`Error: ${body.error || 'Failed to update'}`)
        return false
      }
      await fetchDeliberation()
      return true
    } catch {
      setActionMessage('Failed to save settings')
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/talks/${deliberationId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setActionMessage(`Error: ${data.error || 'Failed to delete'}`)
        setDeleting(false)
        setConfirmDelete(false)
        return
      }
      router.push('/dashboard')
    } catch {
      setActionMessage('Failed to delete deliberation')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleAction = async (action: string, endpoint: string) => {
    setActionLoading(action)
    setActionMessage('')
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setActionMessage(`Error: ${data.error || 'Action failed'}`)
      } else {
        const messages: Record<string, string> = {
          'start-voting': 'Voting started!',
          'force-next-tier': `Processed ${data.cellsProcessed || 0} cells`,
          'release-extra-votes': `Extra votes released! ${data.eligibleUsers || 0} users eligible (${data.windowMinutes || 15}min window)`,
          'start-challenge': 'Challenge round started!',
          'advance-discussion': `Voting opened for ${data.cellsAdvanced || 0} cells`,
        }
        setActionMessage(messages[action] || 'Done!')
        fetchDeliberation()
      }
    } catch {
      setActionMessage('Action failed')
    } finally {
      setActionLoading('')
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-xl mx-auto px-4 py-8">
          <div className="animate-pulse h-8 bg-surface rounded w-1/3" />
        </div>
      </div>
    )
  }

  if (error || !deliberation) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-xl mx-auto px-4 py-8">
          <Link href="/dashboard" className="text-muted hover:text-foreground text-sm mb-4 inline-block">
            &larr; Back to Dashboard
          </Link>
          <div className="bg-error-bg text-error p-4 rounded-xl">
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

      <div className="max-w-xl mx-auto px-4 py-6">
        <Link href="/dashboard" className="text-muted hover:text-foreground text-sm mb-4 inline-block">
          &larr; Back to Dashboard
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{deliberation.question}</h1>
            {deliberation.organization && (
              <div className="text-sm text-muted mt-1">{deliberation.organization}</div>
            )}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`px-2 py-1 rounded text-white text-sm ${phaseColors[deliberation.phase] || 'bg-muted'}`}>
                {phaseLabel(deliberation.phase)}
              </span>
              <span className={`px-2 py-1 rounded text-sm ${deliberation.isPublic ? 'bg-success-bg text-success border border-success' : 'bg-surface-hover text-muted border border-border'}`}>
                {deliberation.isPublic ? 'Public' : 'Private'}
              </span>
              <span className="text-muted">Tier {deliberation.currentTier}</span>
              <span className="text-muted">{deliberation._count.members} members</span>
              <span className="text-muted">{deliberation._count.ideas} ideas</span>
            </div>
            {/* Voting trigger info */}
            <div className="mt-2 text-sm space-y-0.5">
              <div>
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
              <div>
                <span className="text-muted">Tier advancement: </span>
                <span className="text-foreground">
                  {deliberation.votingTimeoutMs === 0
                    ? 'No timer (all vote or facilitator forces)'
                    : `${Math.round(deliberation.votingTimeoutMs / 60000)}min per tier`}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 shrink-0 text-right">
            <Link
              href={`/talks/${deliberation.id}`}
              className="text-accent hover:underline text-sm"
            >
              View Public Page &rarr;
            </Link>
            <Link
              href={`/talks/${deliberation.id}/details`}
              className="text-accent hover:underline text-sm"
            >
              View Details &rarr;
            </Link>
            <Link
              href={`/dashboard/${deliberation.id}/analytics`}
              className="text-accent hover:underline text-sm"
            >
              Analytics &rarr;
            </Link>
          </div>
        </div>

        {/* Champion Banner */}
        {(() => {
          const champion = deliberation.ideas.find(i => i.isChampion || i.status === 'WINNER')
          if (!champion) return null
          return (
            <div className={`mb-6 p-4 rounded-xl border ${
              deliberation.phase === 'ACCUMULATING'
                ? 'bg-purple-bg border-purple'
                : 'bg-success-bg border-success'
            }`}>
              <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${
                deliberation.phase === 'ACCUMULATING' ? 'text-purple' : 'text-success'
              }`}>
                {deliberation.phase === 'ACCUMULATING' ? 'Priority (Accepting Challengers)' : 'Winner'}
              </div>
              <p className="text-foreground font-medium text-lg">{champion.text}</p>
              <p className="text-muted text-sm mt-1">{champion.totalVotes} total votes</p>
            </div>
          )
        })()}

        {/* Action message */}
        {actionMessage && (
          <div className={`mb-4 p-3 rounded-xl text-sm ${
            actionMessage.startsWith('Error') ? 'bg-error-bg text-error' : 'bg-success-bg text-success'
          }`}>
            {actionMessage}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {/* Left Column - Controls & Invites */}
          <div className="space-y-4">
            {/* Facilitator Controls */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <h2 className="text-lg font-semibold text-foreground mb-2">Facilitator Controls</h2>
              <p className="text-sm text-muted mb-4">
                Current phase: <span className="font-medium text-foreground">{phaseLabel(deliberation.phase)}</span>
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => handleAction('start-voting', `/api/deliberations/${deliberationId}/start-voting`)}
                  disabled={deliberation.phase !== 'SUBMISSION' || actionLoading === 'start-voting'}
                  className="w-full bg-warning hover:bg-warning/80 disabled:opacity-40 disabled:cursor-not-allowed text-black font-medium px-4 py-2 rounded transition-colors"
                >
                  {actionLoading === 'start-voting' ? 'Starting...' : 'Start Voting Now'}
                </button>

                {deliberation.cells.some(c => c.status === 'DELIBERATING') && (
                  <button
                    onClick={() => handleAction('advance-discussion', `/api/deliberations/${deliberationId}/advance-discussion`)}
                    disabled={actionLoading === 'advance-discussion'}
                    className="w-full bg-blue hover:bg-blue/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded transition-colors"
                  >
                    {actionLoading === 'advance-discussion' ? 'Opening...' : `Open Voting (${deliberation.cells.filter(c => c.status === 'DELIBERATING').length} cells discussing)`}
                  </button>
                )}

                {!confirmForce ? (
                  <button
                    onClick={() => setConfirmForce(true)}
                    disabled={deliberation.phase !== 'VOTING' || actionLoading === 'force-next-tier'}
                    className="w-full bg-orange hover:bg-orange/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded transition-colors"
                  >
                    Force Complete Current Round
                  </button>
                ) : (
                  <div className="space-y-3 border border-orange rounded p-3">
                    <p className="text-sm text-foreground">
                      This will end the current voting round immediately, tally all votes cast so far, and advance winners. Participants who haven&apos;t voted yet will be skipped.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setConfirmForce(false); handleAction('force-next-tier', `/api/deliberations/${deliberationId}/force-next-tier`) }}
                        disabled={actionLoading === 'force-next-tier'}
                        className="flex-1 bg-orange hover:bg-orange/80 disabled:opacity-40 text-white font-medium px-4 py-2 rounded transition-colors"
                      >
                        {actionLoading === 'force-next-tier' ? 'Processing...' : 'Yes, Force Complete'}
                      </button>
                      <button
                        onClick={() => setConfirmForce(false)}
                        className="flex-1 border border-border text-foreground hover:bg-surface font-medium px-4 py-2 rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted">
                  Processes all active voting cells as if timer expired.
                </p>

                {!confirmRelease ? (
                  <button
                    onClick={() => setConfirmRelease(true)}
                    disabled={deliberation.phase !== 'VOTING' || actionLoading === 'release-extra-votes'}
                    className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded transition-colors"
                  >
                    Release Extra Votes
                  </button>
                ) : (
                  <div className="space-y-3 border border-accent rounded p-3">
                    <p className="text-sm text-foreground">
                      This will add extra voting slots so more participants can join the current round. Use this if people are waiting to vote but all cells are full.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setConfirmRelease(false); handleAction('release-extra-votes', `/api/deliberations/${deliberationId}/release-extra-votes`) }}
                        disabled={actionLoading === 'release-extra-votes'}
                        className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white font-medium px-4 py-2 rounded transition-colors"
                      >
                        {actionLoading === 'release-extra-votes' ? 'Releasing...' : 'Yes, Release'}
                      </button>
                      <button
                        onClick={() => setConfirmRelease(false)}
                        className="flex-1 border border-border text-foreground hover:bg-surface font-medium px-4 py-2 rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted">
                  Opens a window for participants whose cells completed to vote in another batch.
                </p>

                {!confirmChallenge ? (
                  <button
                    onClick={() => setConfirmChallenge(true)}
                    disabled={deliberation.phase !== 'ACCUMULATING' || actionLoading === 'start-challenge'}
                    className="w-full bg-purple hover:bg-purple/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded transition-colors"
                  >
                    Start Round 2
                  </button>
                ) : (
                  <div className="space-y-3 border border-purple rounded p-3">
                    <p className="text-sm text-foreground">
                      This will start a new round. Challenger ideas will compete against the current priority through tiered voting. The priority could be replaced.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setConfirmChallenge(false); handleAction('start-challenge', `/api/deliberations/${deliberationId}/start-challenge`) }}
                        disabled={actionLoading === 'start-challenge'}
                        className="flex-1 bg-purple hover:bg-purple/80 disabled:opacity-40 text-white font-medium px-4 py-2 rounded transition-colors"
                      >
                        {actionLoading === 'start-challenge' ? 'Starting...' : 'Yes, Start Round'}
                      </button>
                      <button
                        onClick={() => setConfirmChallenge(false)}
                        className="flex-1 border border-border text-foreground hover:bg-surface font-medium px-4 py-2 rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted">
                  Starts a new voting round where challengers compete against the current priority.
                </p>
              </div>
            </div>

            {/* Settings */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <h2 className="text-lg font-semibold text-foreground mb-4">Settings</h2>

              <div className="space-y-4">
                {/* Public/Private Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-foreground font-medium">Visibility</div>
                    <div className="text-xs text-muted">
                      {deliberation.isPublic ? 'Anyone can view and join' : 'Invite-only access'}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await patchSettings({ isPublic: !deliberation.isPublic })
                    }}
                    disabled={saving}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      deliberation.isPublic ? 'bg-success' : 'bg-muted'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      deliberation.isPublic ? 'left-6' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {/* Voting Timer */}
                <div>
                  <div className="text-sm text-foreground font-medium mb-1">Voting time per tier</div>
                  {editingTimer ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={timerValue}
                        onChange={(e) => setTimerValue(parseInt(e.target.value) || 0)}
                        className="w-24 bg-background border border-border rounded px-3 py-1.5 text-sm font-mono"
                      />
                      <span className="text-sm text-muted">minutes</span>
                      <button
                        onClick={async () => {
                          if (timerValue < 1) return
                          const ok = await patchSettings({ votingTimeoutMs: timerValue * 60000 })
                          if (ok) setEditingTimer(false)
                        }}
                        disabled={saving || timerValue < 1}
                        className="bg-accent hover:bg-accent-hover disabled:bg-muted text-white px-3 py-1.5 rounded text-sm transition-colors"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setTimerValue(Math.round(deliberation.votingTimeoutMs / 60000))
                          setEditingTimer(false)
                        }}
                        className="text-muted hover:text-foreground text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : deliberation.votingTimeoutMs === 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted">No timer (natural completion)</span>
                      <button
                        onClick={() => {
                          setTimerValue(60)
                          setEditingTimer(true)
                        }}
                        className="text-sm text-accent hover:underline"
                      >
                        (set timer)
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingTimer(true)}
                      className="text-sm text-accent hover:underline"
                    >
                      {Math.round(deliberation.votingTimeoutMs / 60000)} minutes (edit)
                    </button>
                  )}
                </div>

                {/* Idea Goal (SUBMISSION only) */}
                {deliberation.phase === 'SUBMISSION' && (
                  <div>
                    <div className="text-sm text-foreground font-medium mb-1">Idea goal (auto-start voting)</div>
                    {editingGoal ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={2}
                          max={1000}
                          value={goalValue ?? ''}
                          onChange={(e) => setGoalValue(e.target.value ? parseInt(e.target.value) : null)}
                          placeholder="No goal (manual)"
                          className="w-24 bg-background border border-border rounded px-3 py-1.5 text-sm font-mono"
                        />
                        <span className="text-sm text-muted">ideas</span>
                        <button
                          onClick={async () => {
                            const ok = await patchSettings({ ideaGoal: goalValue })
                            if (ok) setEditingGoal(false)
                          }}
                          disabled={saving}
                          className="bg-accent hover:bg-accent-hover disabled:bg-muted text-white px-3 py-1.5 rounded text-sm transition-colors"
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => {
                            setGoalValue(deliberation.ideaGoal)
                            setEditingGoal(false)
                          }}
                          className="text-muted hover:text-foreground text-sm transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingGoal(true)}
                        className="text-sm text-accent hover:underline"
                      >
                        {deliberation.ideaGoal
                          ? `${deliberation.ideaGoal} ideas (${deliberation._count.ideas}/${deliberation.ideaGoal}) (edit)`
                          : 'Not set (manual start) (edit)'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Up-Pollinated Comments */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Up-Pollinated Comments ({upPollinatedComments.length})
              </h2>

              {upPollinatedComments.length === 0 ? (
                <p className="text-muted text-sm">
                  No comments have up-pollinated yet. Comments need 60% of cell participants to upvote them to advance.
                </p>
              ) : (
                <div className="space-y-2">
                  {upPollinatedComments.slice(0, 10).map(comment => (
                    <div key={comment.id} className="bg-purple/10 border border-purple/30 rounded p-2">
                      <div className="flex items-center gap-2 text-xs text-purple mb-1">
                        <span>Reached Tier {comment.reachTier}</span>
                        <span>-</span>
                        <span>{comment.upvoteCount} upvotes</span>
                      </div>
                      <p className="text-sm text-foreground">{comment.text}</p>
                      <p className="text-xs text-muted mt-1">-- {comment.user.name || 'Anonymous'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invite Members */}
            <div className="bg-surface border border-border rounded-xl p-4">
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
                    setActionMessage(`Invite error: ${data.error || 'Failed to send'}`)
                  }
                } catch {
                  setActionMessage('Failed to send invites')
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
            {/* Export */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <h2 className="text-lg font-semibold text-foreground mb-2">Export Data</h2>
              <p className="text-sm text-muted mb-3">Download talk data as JSON, CSV, or PDF.</p>
              <div className="flex gap-2 flex-wrap">
                <a
                  href={`/api/deliberations/${deliberationId}/export?format=json`}
                  download
                  className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                >
                  JSON
                </a>
                <a
                  href={`/api/deliberations/${deliberationId}/export?format=csv`}
                  download
                  className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                >
                  CSV
                </a>
                <a
                  href={`/api/deliberations/${deliberationId}/export?format=pdf`}
                  download
                  className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                >
                  PDF
                </a>
              </div>
            </div>

            {/* Linked Podiums */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Linked Podiums ({linkedPodiums.length})
                </h2>
                <Link
                  href={`/podium/new?deliberationId=${deliberationId}`}
                  className="text-accent hover:text-accent-hover text-sm"
                >
                  Write Post
                </Link>
              </div>

              {podiumsLoading ? (
                <p className="text-muted text-sm">Loading...</p>
              ) : linkedPodiums.length === 0 ? (
                <p className="text-muted text-sm">
                  No podium posts linked to this talk yet. Write a post to explain context or make the case for this deliberation.
                </p>
              ) : (
                <div className="space-y-2">
                  {linkedPodiums.map(p => (
                    <Link
                      key={p.id}
                      href={`/podium/${p.id}`}
                      className="block bg-background rounded-lg p-3 hover:border-accent border border-border transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {p.pinned && (
                              <span className="text-xs bg-warning-bg text-warning px-1.5 py-0.5 rounded border border-warning shrink-0">Pinned</span>
                            )}
                            <h3 className="text-foreground font-medium text-sm truncate">{p.title}</h3>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                            <span>by {p.author.name || 'Anonymous'}</span>
                            <span>{p.views} views</span>
                            <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Danger Zone */}
            <div className="bg-surface border border-error/30 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-error mb-2">Danger Zone</h2>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full border border-error text-error hover:bg-error hover:text-white font-medium px-4 py-2 rounded transition-colors"
                >
                  Delete Talk
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-foreground">
                    This will permanently delete this talk and all its data (ideas, votes, cells, comments, notifications). This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 bg-error hover:bg-error-hover disabled:opacity-40 text-white font-medium px-4 py-2 rounded transition-colors"
                    >
                      {deleting ? 'Deleting...' : 'Yes, Delete Forever'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="flex-1 border border-border text-foreground hover:bg-surface font-medium px-4 py-2 rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Info (read-only) */}
          <div className="space-y-4">
            {/* Active Cells */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Active Cells ({deliberation.cells.filter(c => c.status === 'VOTING').length})
              </h2>

              <div className="space-y-4 max-h-96 overflow-y-auto">
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

            {/* Ideas */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <h2 className="text-lg font-semibold text-foreground mb-4">Ideas ({deliberation.ideas.length})</h2>

              {/* Status + Tier breakdown — only show when voting has started */}
              {deliberation.phase !== 'SUBMISSION' && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted uppercase tracking-wide mb-2">By Status</div>
                    {['SUBMITTED', 'PENDING', 'IN_VOTING', 'ADVANCING', 'WINNER', 'ELIMINATED', 'DEFENDING', 'BENCHED', 'RETIRED', 'POOLED']
                      .map(s => ({ status: s, count: deliberation.ideas.filter(i => i.status === s).length }))
                      .filter(({ count }) => count > 0)
                      .map(({ status, count }) => (
                        <div key={status} className="flex justify-between items-center">
                          <span className="text-sm text-foreground">{status}</span>
                          <span className="text-sm font-mono text-foreground">{count}</span>
                        </div>
                      ))}
                  </div>

                  {!deliberation.ideas.every(i => i.tier === 0) && (
                    <div className="space-y-1">
                      <div className="text-xs text-muted uppercase tracking-wide mb-2">By Tier Reached</div>
                      {(() => {
                        const maxTier = Math.max(...deliberation.ideas.map(i => i.tier), 0)
                        return Array.from({ length: maxTier + 1 }, (_, tier) => {
                          const count = deliberation.ideas.filter(i => i.tier === tier).length
                          return count > 0 ? (
                            <div key={tier} className="flex justify-between items-center">
                              <span className="text-sm text-foreground">Tier {tier}</span>
                              <span className="text-sm font-mono text-foreground">{count}</span>
                            </div>
                          ) : null
                        })
                      })()}
                    </div>
                  )}
                </div>
              )}

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
                        <span className="text-muted font-mono">{idea.totalVotes}v</span>
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
            </div>

            {/* Recent Comments */}
            <div className="bg-surface border border-border rounded-xl p-4">
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
                        <span>-</span>
                        <span>{comment.upvoteCount} upvotes</span>
                        {comment.reachTier > 1 && (
                          <span className="text-purple">- Reached T{comment.reachTier}</span>
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
