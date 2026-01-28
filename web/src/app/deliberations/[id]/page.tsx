'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import CountdownTimer from '@/components/CountdownTimer'
import { getDisplayName } from '@/lib/user'
import Header from '@/components/Header'

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED'

type Idea = {
  id: string
  text: string
  status: string
  totalVotes: number
  losses: number
  isNew: boolean
  author: { name: string | null; status?: UserStatus }
}

type CellIdea = {
  ideaId: string
  idea: Idea
}

type Participant = {
  userId: string
  status: string
  user: { id: string; name: string | null; image: string | null; status?: UserStatus }
}

type Vote = {
  id: string
  ideaId: string
  isSecondVote: boolean
}

type Comment = {
  id: string
  text: string
  createdAt: string
  user: { id: string; name: string | null; image: string | null; status?: UserStatus }
}

type Cell = {
  id: string
  tier: number
  status: string
  votingDeadline: string | null
  ideas: CellIdea[]
  participants: Participant[]
  votes: Vote[]
}

type Deliberation = {
  id: string
  question: string
  description: string | null
  organization: string | null
  phase: string
  currentTier: number
  isPublic: boolean
  creatorId: string
  createdAt: string
  submissionEndsAt: string | null
  accumulationEndsAt: string | null
  challengeRound: number
  accumulationEnabled: boolean
  championId: string | null
  ideaGoal: number | null
  creator: { id: string; name: string | null; status?: UserStatus }
  ideas: Idea[]
  _count: { members: number }
  isMember?: boolean
  isCreator?: boolean
  inviteCode?: string
  userSubmittedIdea?: { id: string; text: string } | null
  userSubmittedChallenger?: { id: string; text: string } | null
}

type Prediction = {
  id: string
  tierPredictedAt: number
  predictedIdeaId: string
  predictedIdea: { id: string; text: string }
  wonImmediate: boolean | null
  ideaBecameChampion: boolean | null
  enteredForVoting: boolean
  resolvedAt: string | null
  createdAt: string
}

type TierInfo = {
  tier: number
  isBatch: boolean
  isComplete: boolean
  stats: {
    totalCells: number
    completedCells: number
    totalParticipants: number
    totalVotesCast: number
    totalVotesExpected: number
    votingProgress: number
  }
  ideas: { id: string; text: string; status: string; author: { name: string | null } }[]
  liveTally?: { ideaId: string; text: string; voteCount: number }[]
  cells: {
    id: string
    status: string
    participantCount: number
    votedCount: number
    votingDeadline?: string | null
    ideas?: { id: string; text: string; status: string; author: { name: string | null } }[]
  }[]
}

// Collapsible Section Component
function Section({
  title,
  badge,
  children,
  defaultOpen = true,
  variant = 'default'
}: {
  title: string
  badge?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  variant?: 'default' | 'warning' | 'success' | 'purple' | 'orange'
}) {
  const [open, setOpen] = useState(defaultOpen)

  const variantStyles = {
    default: 'border-border',
    warning: 'border-warning bg-warning-bg',
    success: 'border-success bg-success-bg',
    purple: 'border-purple bg-purple-bg',
    orange: 'border-orange bg-orange-bg',
  }

  return (
    <div className={`rounded-lg border ${variantStyles[variant]} mb-4 overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex justify-between items-center text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{title}</span>
          {badge}
        </div>
        <svg
          className={`w-5 h-5 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

// Compact Stats Row
function StatsRow({ items }: { items: { label: string; value: string | number; color?: string }[] }) {
  return (
    <div className="flex gap-4 text-sm">
      {items.map((item, i) => (
        <div key={i}>
          <span className="text-muted">{item.label}: </span>
          <span className={`font-mono font-medium ${item.color || 'text-foreground'}`}>{item.value}</span>
        </div>
      ))}
    </div>
  )
}

// Discussion component for a cell
function CellDiscussion({ cellId, isParticipant }: { cellId: string; isParticipant: boolean }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/cells/${cellId}/comments`)
      if (res.ok) {
        const data = await res.json()
        setComments(data)
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchComments()
    const interval = setInterval(fetchComments, 10000)
    return () => clearInterval(interval)
  }, [cellId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || !isParticipant) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/cells/${cellId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newComment }),
      })
      if (res.ok) {
        setNewComment('')
        fetchComments()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const timeAgo = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-muted hover:text-foreground text-sm"
      >
        <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Discussion ({comments.length})
      </button>

      {expanded && (
        <div className="mt-2">
          <div className="space-y-2 max-h-40 overflow-y-auto mb-2">
            {loading ? (
              <p className="text-muted text-sm">Loading...</p>
            ) : comments.length === 0 ? (
              <p className="text-muted text-sm">No messages yet</p>
            ) : (
              comments.map(c => (
                <div key={c.id} className="bg-surface rounded p-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium text-accent">{getDisplayName(c.user)}</span>
                    <span className="text-muted text-xs">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="text-foreground">{c.text}</p>
                </div>
              ))
            )}
          </div>

          {isParticipant && (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Message..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1 bg-background rounded border border-border px-3 py-1.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={submitting || !newComment.trim()}
                className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
              >
                {submitting ? '...' : 'Send'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// Compact Voting Cell
function VotingCell({
  cell,
  onVote,
  voting,
  onRefresh
}: {
  cell: Cell
  onVote: (cellId: string, ideaId: string) => void
  voting: string | null
  onRefresh: () => void
}) {
  const hasVoted = cell.votes.length > 0
  const votedIdeaId = cell.votes[0]?.ideaId
  const isActive = cell.status === 'VOTING' && !hasVoted

  return (
    <div className={`rounded-lg border p-3 ${isActive ? 'border-warning bg-warning-bg' : 'border-border'}`}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">Tier {cell.tier}</span>
          {isActive && <span className="w-2 h-2 bg-warning rounded-full animate-pulse" />}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {cell.status === 'VOTING' && cell.votingDeadline && (
            <CountdownTimer deadline={cell.votingDeadline} onExpire={onRefresh} compact />
          )}
          <span className={`px-2 py-0.5 rounded text-xs ${
            cell.status === 'COMPLETED' ? 'bg-success-bg text-success' :
            hasVoted ? 'bg-accent-light text-accent' :
            'bg-warning-bg text-warning'
          }`}>
            {hasVoted && cell.status === 'VOTING' ? 'Voted' : cell.status}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        {cell.ideas.map(({ idea }) => {
          const isVoted = votedIdeaId === idea.id
          const isWinner = idea.status === 'ADVANCING' || idea.status === 'WINNER'
          const isEliminated = idea.status === 'ELIMINATED'

          return (
            <div
              key={idea.id}
              className={`p-2 rounded flex justify-between items-center text-sm ${
                isWinner ? 'bg-success-bg border border-success' :
                isEliminated ? 'bg-surface text-muted' :
                isVoted ? 'bg-accent-light border border-accent' :
                'bg-background border border-border'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className={`truncate ${isEliminated ? 'text-muted' : 'text-foreground'}`}>{idea.text}</p>
                <p className="text-xs text-muted">{getDisplayName(idea.author)}</p>
              </div>

              <div className="flex items-center gap-2 ml-2">
                {cell.status === 'COMPLETED' && (
                  <span className="text-muted text-xs font-mono">{idea.totalVotes}v</span>
                )}

                {cell.status === 'VOTING' && !hasVoted && (
                  <button
                    onClick={() => onVote(cell.id, idea.id)}
                    disabled={voting === idea.id}
                    className="bg-warning hover:bg-warning-hover text-black px-3 py-1 rounded text-xs font-medium"
                  >
                    {voting === idea.id ? '...' : 'Vote'}
                  </button>
                )}

                {isVoted && <span className="text-accent text-xs">✓</span>}
                {isWinner && <span className="text-success text-xs">↑</span>}
              </div>
            </div>
          )
        })}
      </div>

      <CellDiscussion cellId={cell.id} isParticipant={true} />
    </div>
  )
}

// Tier Progress Panel - shows all cells in the current tier
function TierProgressPanel({ deliberationId, currentTier, onRefresh }: { deliberationId: string; currentTier: number; onRefresh: () => void }) {
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTierInfo = async () => {
      try {
        const res = await fetch(`/api/deliberations/${deliberationId}/tiers/${currentTier}`)
        if (res.ok) setTierInfo(await res.json())
      } catch (err) {
        console.error('Failed to fetch tier info:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTierInfo()
    const interval = setInterval(fetchTierInfo, 5000)
    return () => clearInterval(interval)
  }, [deliberationId, currentTier])

  if (loading || !tierInfo) return null

  const { stats, cells, ideas, liveTally, isBatch } = tierInfo

  return (
    <Section
      title={`Tier ${currentTier} Progress`}
      badge={
        <span className="text-xs bg-warning text-black px-2 py-0.5 rounded font-mono">
          {stats.completedCells}/{stats.totalCells} cells
        </span>
      }
      variant="warning"
      defaultOpen={true}
    >
      {/* Overall progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>{stats.totalVotesCast} of {stats.totalVotesExpected} votes cast</span>
          <span>{stats.votingProgress}%</span>
        </div>
        <div className="w-full bg-background rounded-full h-2">
          <div
            className="bg-warning h-2 rounded-full transition-all"
            style={{ width: `${stats.votingProgress}%` }}
          />
        </div>
      </div>

      {/* Live vote tally for batches (Tier 2+) */}
      {isBatch && liveTally && liveTally.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-muted uppercase tracking-wide mb-2">Live Vote Tally</p>
          <div className="space-y-1">
            {liveTally.map((item, index) => {
              const maxVotes = liveTally[0]?.voteCount || 1
              const percentage = maxVotes > 0 ? (item.voteCount / maxVotes) * 100 : 0
              return (
                <div key={item.ideaId} className="relative">
                  <div
                    className="absolute inset-y-0 left-0 bg-warning-bg rounded"
                    style={{ width: `${percentage}%` }}
                  />
                  <div className="relative flex justify-between items-center p-2 text-sm">
                    <span className="text-foreground truncate flex-1">{item.text}</span>
                    <span className="font-mono text-warning ml-2">{item.voteCount}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Cell grid */}
      <div className="mb-2">
        <p className="text-xs text-muted uppercase tracking-wide mb-2">Cells</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {cells.map((cell, index) => {
            const isComplete = cell.status === 'COMPLETED'
            const progress = cell.participantCount > 0
              ? Math.round((cell.votedCount / cell.participantCount) * 100)
              : 0

            return (
              <div
                key={cell.id}
                className={`rounded-lg p-2 text-xs ${
                  isComplete
                    ? 'bg-success-bg border border-success'
                    : 'bg-surface border border-border'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-foreground">Cell {index + 1}</span>
                  <span className={`text-xs ${isComplete ? 'text-success' : 'text-muted'}`}>
                    {isComplete ? '✓' : `${progress}%`}
                  </span>
                </div>
                <div className="text-muted">
                  {cell.votedCount}/{cell.participantCount} voted
                </div>
                {/* Show voting deadline if available */}
                {!isComplete && cell.votingDeadline && (
                  <div className="mt-1">
                    <CountdownTimer
                      deadline={cell.votingDeadline}
                      onExpire={onRefresh}
                      compact
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Ideas in tier (for Tier 1 with different ideas per cell) */}
      {!isBatch && ideas && ideas.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted uppercase tracking-wide mb-2">Ideas Competing ({ideas.length})</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {ideas.map(idea => (
              <div
                key={idea.id}
                className={`p-2 rounded text-xs ${
                  idea.status === 'ADVANCING' ? 'bg-success-bg border border-success' :
                  idea.status === 'ELIMINATED' ? 'bg-surface text-muted' :
                  'bg-background border border-border'
                }`}
              >
                <p className="text-foreground truncate">{idea.text}</p>
                <p className="text-muted text-xs">{idea.author?.name || 'Anonymous'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats summary */}
      <div className="mt-3 pt-3 border-t border-border flex justify-between text-xs text-muted">
        <span>{stats.totalParticipants} participants</span>
        <span>{ideas?.length || 0} ideas</span>
      </div>
    </Section>
  )
}

// Predictions Component (archived but kept for reference)
function PredictionsPanel({ deliberationId, currentTier }: { deliberationId: string; currentTier: number }) {
  const { data: session } = useSession()
  const router = useRouter()
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [predicting, setPredicting] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tierRes, predRes] = await Promise.all([
          fetch(`/api/deliberations/${deliberationId}/tiers/${currentTier}`),
          session ? fetch(`/api/predictions?deliberationId=${deliberationId}`) : null
        ])

        if (tierRes.ok) setTierInfo(await tierRes.json())
        if (predRes?.ok) {
          const data = await predRes.json()
          setPredictions(data.predictions || [])
        }
      } catch (err) {
        console.error('Failed to fetch:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [deliberationId, currentTier, session])

  const handlePredict = async (ideaId: string) => {
    if (!session) {
      router.push('/auth/signin')
      return
    }
    setPredicting(ideaId)
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliberationId, predictedIdeaId: ideaId, tier: currentTier }),
      })
      if (res.ok) {
        const predRes = await fetch(`/api/predictions?deliberationId=${deliberationId}`)
        if (predRes.ok) {
          const data = await predRes.json()
          setPredictions(data.predictions || [])
        }
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to predict')
      }
    } finally {
      setPredicting(null)
    }
  }

  if (loading || !tierInfo) return null

  const currentPred = predictions.find(p => p.tierPredictedAt === currentTier)

  return (
    <Section
      title="Predict Winner"
      badge={
        <span className="text-xs bg-purple text-white px-2 py-0.5 rounded">
          {tierInfo.stats.votingProgress}% voted
        </span>
      }
      variant="purple"
      defaultOpen={true}
    >
      <div className="w-full bg-background rounded-full h-1.5 mb-3">
        <div className="bg-purple h-1.5 rounded-full transition-all" style={{ width: `${tierInfo.stats.votingProgress}%` }} />
      </div>

      <div className="space-y-1.5">
        {(tierInfo.liveTally || tierInfo.ideas).map((item) => {
          const idea = 'voteCount' in item ? { ...item, id: item.ideaId } : item
          const voteCount = 'voteCount' in item ? item.voteCount : undefined
          const isPredicted = currentPred?.predictedIdeaId === idea.id

          return (
            <div
              key={idea.id}
              className={`p-2 rounded flex justify-between items-center text-sm ${
                isPredicted ? 'bg-purple text-white' : 'bg-background border border-border'
              }`}
            >
              <div className="flex-1">
                <p className={isPredicted ? 'text-white' : 'text-foreground'}>{idea.text}</p>
                {voteCount !== undefined && (
                  <span className={`text-xs font-mono ${isPredicted ? 'text-purple-light' : 'text-muted'}`}>
                    {voteCount} votes
                  </span>
                )}
              </div>

              {isPredicted ? (
                <span className="text-xs bg-purple-hover px-2 py-0.5 rounded">Your pick</span>
              ) : !currentPred ? (
                <button
                  onClick={() => handlePredict(idea.id)}
                  disabled={predicting === idea.id}
                  className="bg-purple hover:bg-purple-hover text-white px-3 py-1 rounded text-xs"
                >
                  {predicting === idea.id ? '...' : 'Pick'}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      {predictions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-purple-border">
          <p className="text-xs text-purple mb-2">Your predictions:</p>
          <div className="space-y-1">
            {predictions.map(p => (
              <div key={p.id} className="flex justify-between text-xs">
                <span className="text-foreground truncate flex-1">{p.predictedIdea.text}</span>
                <span className={
                  p.resolvedAt === null ? 'text-purple' :
                  p.wonImmediate || p.ideaBecameChampion ? 'text-success' : 'text-error'
                }>
                  {p.resolvedAt === null ? 'T' + p.tierPredictedAt :
                   p.ideaBecameChampion ? '🏆' : p.wonImmediate ? '✓' : '✗'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

// History types
type HistoryIdea = { id: string; text: string; author: string; votes: number; isWinner: boolean; status: string }
type HistoryCell = { id: string; tier: number; completedAt: string; ideas: HistoryIdea[]; totalVotes: number }
type VotingHistory = {
  challengeRound: number
  currentChampion: { id: string; text: string; author: { name: string } } | null
  tiers: Record<number, HistoryCell[]>
  totalCells: number
}

function HistoryPanel({ deliberationId }: { deliberationId: string }) {
  const [history, setHistory] = useState<VotingHistory | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/deliberations/${deliberationId}/history`)
        if (res.ok) setHistory(await res.json())
      } catch (err) {
        console.error('Failed to fetch history:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [deliberationId])

  if (loading) return null

  // Show message if no completed cells yet
  if (!history || history.totalCells === 0) {
    return (
      <Section title="Voting History" defaultOpen={false}>
        <p className="text-muted text-sm">No completed voting rounds yet.</p>
      </Section>
    )
  }

  const tiers = Object.keys(history.tiers).map(Number).sort((a, b) => a - b)

  return (
    <Section
      title="History"
      badge={<span className="text-xs text-muted font-mono">{history.totalCells} cells</span>}
      defaultOpen={false}
    >
      {tiers.map(tier => (
        <div key={tier} className="mb-3">
          <p className="text-sm font-medium text-foreground mb-1">Tier {tier}</p>
          {history.tiers[tier].map(cell => (
            <div key={cell.id} className="bg-surface rounded p-2 mb-1">
              {cell.ideas.sort((a, b) => b.votes - a.votes).map(idea => (
                <div key={idea.id} className={`flex justify-between text-xs py-0.5 ${
                  idea.isWinner ? 'text-success' : 'text-muted'
                }`}>
                  <span className="truncate flex-1">{idea.text}</span>
                  <span className="font-mono ml-2">{idea.votes}{idea.isWinner && ' ✓'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </Section>
  )
}

// Comments Panel - shows all comments organized by tier/cell with up-pollinated highlights
type DelibComment = {
  id: string
  text: string
  createdAt: string
  upvoteCount: number
  reachTier: number
  isUpPollinated?: boolean
  sourceTier?: number
  userHasUpvoted: boolean
  user: { id: string; name: string | null; image: string | null }
}

type CommentsTier = {
  tier: number
  cells: {
    cellId: string
    status: string
    comments: DelibComment[]
  }[]
}

type CommentsData = {
  tiers: CommentsTier[]
  upPollinated: DelibComment[]
  totalComments: number
  currentTier: number
}

function CommentsPanel({ deliberationId }: { deliberationId: string }) {
  const [data, setData] = useState<CommentsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchComments = async () => {
      try {
        const res = await fetch(`/api/deliberations/${deliberationId}/comments`)
        if (res.ok) setData(await res.json())
      } catch (err) {
        console.error('Failed to fetch comments:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchComments()
  }, [deliberationId])

  if (loading) return null

  if (!data || data.totalComments === 0) {
    return (
      <Section title="Discussion" defaultOpen={false}>
        <p className="text-muted text-sm">No comments yet.</p>
      </Section>
    )
  }

  return (
    <Section
      title="Discussion"
      badge={<span className="text-xs text-muted font-mono">{data.totalComments} comments</span>}
      defaultOpen={false}
    >
      {/* Up-pollinated comments section */}
      {data.upPollinated.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-purple text-sm font-medium">Top Comments</span>
            <span className="text-xs text-muted">(up-pollinated from earlier tiers)</span>
          </div>
          <div className="space-y-2">
            {data.upPollinated.slice(0, 5).map(comment => (
              <div key={comment.id} className="bg-purple-bg border border-purple rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <p className="text-foreground text-sm">{comment.text}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                      <span>{comment.user.name || 'Anonymous'}</span>
                      <span>from Tier {comment.sourceTier}</span>
                      <span className="text-purple">reached Tier {comment.reachTier}</span>
                      <span>{comment.upvoteCount} upvotes</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments by tier */}
      {data.tiers.map(tierData => (
        <div key={tierData.tier} className="mb-4">
          <p className="text-sm font-medium text-foreground mb-2">Tier {tierData.tier}</p>
          <div className="space-y-2">
            {tierData.cells.map((cell, cellIndex) => (
              <div key={cell.cellId} className="bg-surface rounded-lg p-2">
                <p className="text-xs text-muted mb-1">
                  Cell {cellIndex + 1} ({cell.comments.length} comments)
                </p>
                <div className="space-y-1.5">
                  {cell.comments.slice(0, 5).map(comment => (
                    <div key={comment.id} className={`p-2 rounded text-sm ${
                      comment.isUpPollinated ? 'bg-purple-bg border-l-2 border-purple' : 'bg-background'
                    }`}>
                      <p className="text-foreground">{comment.text}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                        <span>{comment.user.name || 'Anonymous'}</span>
                        {comment.upvoteCount > 0 && (
                          <span className="text-orange">{comment.upvoteCount} upvotes</span>
                        )}
                        {comment.isUpPollinated && (
                          <span className="text-purple">reached Tier {comment.reachTier}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {cell.comments.length > 5 && (
                    <p className="text-xs text-muted text-center">
                      +{cell.comments.length - 5} more comments
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Section>
  )
}

// Main Page Component
export default function DeliberationPage() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null)
  const [cells, setCells] = useState<Cell[]>([])
  const [loading, setLoading] = useState(true)
  const [newIdea, setNewIdea] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [joining, setJoining] = useState(false)
  const [startingVote, setStartingVote] = useState(false)
  const [startingChallenge, setStartingChallenge] = useState(false)
  const [voting, setVoting] = useState<string | null>(null)
  const [enteringVoting, setEnteringVoting] = useState(false)

  const id = params.id as string

  const fetchDeliberation = async () => {
    try {
      const res = await fetch(`/api/deliberations/${id}`)
      if (!res.ok) {
        if (res.status === 404) router.push('/deliberations')
        return
      }
      setDeliberation(await res.json())
    } catch {
      router.push('/deliberations')
    } finally {
      setLoading(false)
    }
  }

  const fetchCells = async () => {
    if (!session) return
    try {
      const res = await fetch(`/api/deliberations/${id}/cells`)
      if (res.ok) setCells(await res.json())
    } catch (err) {
      console.error('Failed to fetch cells:', err)
    }
  }

  useEffect(() => { fetchDeliberation() }, [id])

  useEffect(() => {
    if (deliberation?.phase === 'VOTING') {
      const interval = setInterval(() => {
        fetchDeliberation()
        fetchCells()
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [deliberation?.phase])

  useEffect(() => {
    if (deliberation?.phase === 'VOTING' || deliberation?.phase === 'COMPLETED') {
      fetchCells()
    }
  }, [deliberation?.phase, session])

  const handleJoin = async () => {
    if (!session) { router.push('/auth/signin'); return }
    setJoining(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/join`, { method: 'POST' })
      if (res.ok) fetchDeliberation()
    } finally {
      setJoining(false)
    }
  }

  const handleSubmitIdea = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newIdea.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newIdea }),
      })
      if (res.ok) { setNewIdea(''); fetchDeliberation() }
    } finally {
      setSubmitting(false)
    }
  }

  const handleStartVoting = async () => {
    setStartingVote(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/start-voting`, { method: 'POST' })
      if (res.ok) { fetchDeliberation(); fetchCells() }
      else { const d = await res.json(); alert(d.error || 'Failed') }
    } finally {
      setStartingVote(false)
    }
  }

  const handleStartChallenge = async () => {
    setStartingChallenge(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/start-challenge`, { method: 'POST' })
      if (res.ok) { fetchDeliberation(); fetchCells() }
      else { const d = await res.json(); alert(d.error || 'Failed') }
    } finally {
      setStartingChallenge(false)
    }
  }

  const handleEnterVoting = async () => {
    if (!session) { router.push('/auth/signin'); return }
    setEnteringVoting(true)
    try {
      // First join the deliberation if not a member
      await fetch(`/api/deliberations/${id}/join`, { method: 'POST' })
      // Then enter voting to get assigned to a cell
      const res = await fetch(`/api/deliberations/${id}/enter`, { method: 'POST' })
      if (res.ok) {
        fetchCells()
        fetchDeliberation()
      } else {
        const data = await res.json()
        alert(data.error || 'No spots available')
      }
    } catch (err) {
      console.error('Enter voting error:', err)
      alert('Failed to join voting')
    } finally {
      setEnteringVoting(false)
    }
  }

  const handleVote = async (cellId: string, ideaId: string) => {
    setVoting(ideaId)
    try {
      const res = await fetch(`/api/cells/${cellId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId }),
      })
      if (res.ok) { fetchCells(); fetchDeliberation() }
      else { const d = await res.json(); alert(d.error || 'Failed') }
    } finally {
      setVoting(null)
    }
  }

  const handleRefresh = () => {
    fetchCells()
    fetchDeliberation()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    )
  }

  if (!deliberation) return null

  const winner = deliberation.ideas.find(i => i.status === 'WINNER')
  const defender = deliberation.ideas.find(i => i.status === 'DEFENDING')
  const activeCells = cells.filter(c => c.status === 'VOTING' && c.votes.length === 0)
  const votedCells = cells.filter(c => c.status !== 'VOTING' || c.votes.length > 0)
  const isCreator = deliberation.isCreator || false

  const phaseColor = {
    SUBMISSION: 'text-accent',
    VOTING: 'text-warning',
    COMPLETED: 'text-success',
    ACCUMULATING: 'text-purple',
  }[deliberation.phase] || 'text-muted'

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Back link */}
        <Link href="/deliberations" className="text-muted hover:text-foreground text-sm mb-3 inline-block">
          ← Back
        </Link>

        {/* Header */}
        <div className="mb-4">
          <div className="flex justify-between items-start gap-2 mb-2">
            <h1 className="text-xl font-bold text-foreground leading-tight">{deliberation.question}</h1>
            <span className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${phaseColor} bg-surface`}>
              {deliberation.phase}
            </span>
          </div>

          {deliberation.description && (
            <p className="text-muted text-sm mb-2">{deliberation.description}</p>
          )}

          {deliberation.organization && (
            <p className="text-muted text-sm mb-2">
              <span className="text-foreground font-medium">{deliberation.organization}</span>
            </p>
          )}

          <StatsRow items={[
            { label: 'Tier', value: deliberation.currentTier, color: 'text-accent' },
            { label: 'Ideas', value: deliberation.ideas.length },
            { label: 'Members', value: deliberation._count.members },
          ]} />
        </div>

        {/* Phase-specific banners */}
        {deliberation.phase === 'SUBMISSION' && deliberation.submissionEndsAt && (
          <div className="bg-accent-light rounded-lg p-3 mb-4 flex justify-between items-center">
            <span className="text-accent text-sm font-medium">Submissions close:</span>
            <CountdownTimer deadline={deliberation.submissionEndsAt} onExpire={fetchDeliberation} compact />
          </div>
        )}

        {deliberation.challengeRound > 0 && deliberation.phase === 'VOTING' && (
          <div className="bg-orange-bg border border-orange rounded-lg p-3 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-orange font-semibold text-sm">Challenge Round {deliberation.challengeRound}</span>
            </div>
            {defender && (
              <div className="mt-2 text-sm">
                <span className="text-muted">Defending: </span>
                <span className="text-foreground">{defender.text}</span>
              </div>
            )}
          </div>
        )}

        {winner && deliberation.phase !== 'ACCUMULATING' && (
          <div className="bg-success-bg border border-success rounded-lg p-3 mb-4">
            <div className="text-success text-xs font-semibold mb-1">🏆 CHAMPION</div>
            <p className="text-foreground font-medium">{winner.text}</p>
            <p className="text-success text-sm">{getDisplayName(winner.author)}</p>
          </div>
        )}

        {deliberation.phase === 'ACCUMULATING' && (
          <div className="bg-purple-bg border border-purple rounded-lg p-3 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-purple font-semibold text-sm">Accepting Challengers</span>
              {deliberation.accumulationEndsAt && (
                <CountdownTimer deadline={deliberation.accumulationEndsAt} onExpire={fetchDeliberation} compact />
              )}
            </div>
            {winner && (
              <div className="text-sm">
                <span className="text-muted">Champion: </span>
                <span className="text-foreground">{winner.text}</span>
              </div>
            )}
            <div className="mt-2 text-xs text-purple">
              {deliberation.ideas.filter(i => i.status === 'PENDING' && i.isNew).length} challengers waiting
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap mb-4">
          {session && !deliberation.isMember && deliberation.phase === 'SUBMISSION' && (
            <button onClick={handleJoin} disabled={joining} className="bg-success hover:bg-success-hover text-white px-4 py-2 rounded text-sm font-medium">
              {joining ? '...' : 'Join'}
            </button>
          )}

          {/* Only show Start Voting if manual triggering (no ideaGoal and no submissionEndsAt) */}
          {isCreator && deliberation.phase === 'SUBMISSION' && !deliberation.ideaGoal && !deliberation.submissionEndsAt && (
            <button
              onClick={handleStartVoting}
              disabled={startingVote || deliberation.ideas.length < 2}
              className="bg-warning hover:bg-warning-hover disabled:opacity-50 text-black px-4 py-2 rounded text-sm font-medium"
            >
              {startingVote ? '...' : 'Start Voting'}
            </button>
          )}

          {isCreator && deliberation.phase === 'ACCUMULATING' && (
            <button
              onClick={handleStartChallenge}
              disabled={startingChallenge || deliberation.ideas.filter(i => i.status === 'PENDING' && i.isNew).length === 0}
              className="bg-orange hover:bg-orange-hover disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
            >
              {startingChallenge ? '...' : 'Start Challenge'}
            </button>
          )}

          {!session && (
            <Link href="/auth/signin" className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm font-medium">
              Sign in
            </Link>
          )}

          {deliberation.inviteCode && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/invite/${deliberation.inviteCode}`)
                alert('Link copied!')
              }}
              className="border border-border hover:border-muted text-foreground px-4 py-2 rounded text-sm"
            >
              Share
            </button>
          )}

          {/* Export dropdown */}
          <div className="relative group">
            <button className="border border-border hover:border-muted text-foreground px-4 py-2 rounded text-sm">
              Export
            </button>
            <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <a
                href={`/api/deliberations/${deliberation.id}/export?format=pdf`}
                download
                className="block px-4 py-2 text-sm text-foreground hover:bg-surface whitespace-nowrap"
              >
                Download PDF
              </a>
              <a
                href={`/api/deliberations/${deliberation.id}/export?format=csv`}
                download
                className="block px-4 py-2 text-sm text-foreground hover:bg-surface whitespace-nowrap"
              >
                Download CSV
              </a>
              <a
                href={`/api/deliberations/${deliberation.id}/export?format=json`}
                download
                className="block px-4 py-2 text-sm text-foreground hover:bg-surface whitespace-nowrap"
              >
                Download JSON
              </a>
            </div>
          </div>
        </div>

        {/* Submit Idea Form */}
        {deliberation.isMember && deliberation.phase === 'SUBMISSION' && (
          deliberation.userSubmittedIdea ? (
            <div className="bg-success-bg border border-success rounded-lg p-3 mb-4">
              <p className="text-success font-medium text-sm mb-1">Your idea submitted:</p>
              <p className="text-foreground text-sm italic">"{deliberation.userSubmittedIdea.text}"</p>
            </div>
          ) : (
            <form onSubmit={handleSubmitIdea} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Your idea..."
                value={newIdea}
                onChange={(e) => setNewIdea(e.target.value)}
                className="flex-1 bg-surface border border-border rounded px-3 py-2 text-foreground placeholder-muted text-sm focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={submitting || !newIdea.trim()}
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
              >
                {submitting ? '...' : 'Submit'}
              </button>
            </form>
          )
        )}

        {/* Submit Challenger Form */}
        {deliberation.isMember && (deliberation.phase === 'VOTING' || deliberation.phase === 'ACCUMULATING') && (
          deliberation.userSubmittedChallenger ? (
            <div className="bg-purple-bg border border-purple rounded-lg p-3 mb-4">
              <p className="text-purple font-medium text-sm mb-1">Your challenger submitted:</p>
              <p className="text-foreground text-sm italic">"{deliberation.userSubmittedChallenger.text}"</p>
            </div>
          ) : (
            <form onSubmit={handleSubmitIdea} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Submit challenger..."
                value={newIdea}
                onChange={(e) => setNewIdea(e.target.value)}
                className="flex-1 bg-surface border border-border rounded px-3 py-2 text-foreground placeholder-muted text-sm focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={submitting || !newIdea.trim()}
                className="bg-purple hover:bg-purple-hover text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
              >
                {submitting ? '...' : 'Submit'}
              </button>
            </form>
          )
        )}

        {/* Active Voting Cells */}
        {activeCells.length > 0 && (
          <Section
            title="Vote Now"
            badge={<span className="w-2 h-2 bg-warning rounded-full animate-pulse" />}
            variant="warning"
          >
            <div className="space-y-3">
              {activeCells.map(cell => (
                <VotingCell key={cell.id} cell={cell} onVote={handleVote} voting={voting} onRefresh={handleRefresh} />
              ))}
            </div>
          </Section>
        )}

        {/* Join Voting - when in VOTING phase but no active cells */}
        {deliberation.phase === 'VOTING' && activeCells.length === 0 && session && (
          <Section
            title="Join Voting"
            badge={<span className="w-2 h-2 bg-warning rounded-full animate-pulse" />}
            variant="warning"
          >
            <div className="text-center py-4">
              <p className="text-muted mb-4">
                Voting is in progress at Tier {deliberation.currentTier}.
                {deliberation.challengeRound > 0 && ` (Challenge Round ${deliberation.challengeRound})`}
              </p>
              <button
                onClick={handleEnterVoting}
                disabled={enteringVoting}
                className="bg-warning hover:bg-warning-hover text-black px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {enteringVoting ? 'Joining...' : 'Join & Vote'}
              </button>
              <p className="text-xs text-muted mt-2">You'll be assigned to an available voting cell</p>
            </div>
          </Section>
        )}

        {/* Tier & Cell Progress - during voting */}
        {deliberation.phase === 'VOTING' && (
          <TierProgressPanel
            deliberationId={id}
            currentTier={deliberation.currentTier}
            onRefresh={handleRefresh}
          />
        )}

        {/* Previous/Completed Cells */}
        {votedCells.length > 0 && (
          <Section title="Your Cells" defaultOpen={activeCells.length === 0}>
            <div className="space-y-3">
              {votedCells.map(cell => (
                <VotingCell key={cell.id} cell={cell} onVote={handleVote} voting={voting} onRefresh={handleRefresh} />
              ))}
            </div>
          </Section>
        )}

        {/* History */}
        <HistoryPanel deliberationId={id} key={`history-${deliberation.phase}-${deliberation.challengeRound}`} />

        {/* Discussion / Comments */}
        <CommentsPanel deliberationId={id} key={`comments-${deliberation.phase}-${deliberation.challengeRound}`} />

        {/* All Ideas */}
        <Section
          title="All Ideas"
          badge={<span className="text-xs text-muted font-mono">{deliberation.ideas.length}</span>}
          defaultOpen={deliberation.phase === 'SUBMISSION'}
        >
          {deliberation.ideas.length === 0 ? (
            <p className="text-muted text-sm">No ideas yet</p>
          ) : (
            <div className="space-y-1.5">
              {deliberation.ideas.map(idea => {
                const statusColor = {
                  WINNER: 'border-success bg-success-bg',
                  DEFENDING: 'border-orange bg-orange-bg',
                  ADVANCING: 'border-accent bg-accent-light',
                  IN_VOTING: 'border-warning bg-warning-bg',
                  ELIMINATED: 'border-border bg-surface opacity-60',
                  RETIRED: 'border-border bg-surface opacity-40',
                  BENCHED: 'border-border bg-surface',
                  PENDING: 'border-border bg-background',
                }[idea.status] || 'border-border bg-background'

                return (
                  <div key={idea.id} className={`p-2 rounded border text-sm ${statusColor}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground">{idea.text}</p>
                        <p className="text-xs text-muted">{getDisplayName(idea.author)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs font-medium ${
                          idea.status === 'WINNER' ? 'text-success' :
                          idea.status === 'DEFENDING' ? 'text-orange' :
                          idea.status === 'ADVANCING' ? 'text-accent' :
                          idea.status === 'IN_VOTING' ? 'text-warning' :
                          'text-muted'
                        }`}>
                          {idea.status}
                        </span>
                        {idea.totalVotes > 0 && (
                          <p className="text-xs text-muted font-mono">{idea.totalVotes}v</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
