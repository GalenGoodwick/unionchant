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
  creator: { id: string; name: string | null; status?: UserStatus }
  ideas: Idea[]
  _count: { members: number }
  isMember?: boolean
  inviteCode?: string
}

// Prediction types
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
  cells: { id: string; status: string; participantCount: number; votedCount: number }[]
}

// Spectator Predictions Component
function SpectatorPredictions({ deliberationId, currentTier }: { deliberationId: string; currentTier: number }) {
  const { data: session } = useSession()
  const router = useRouter()
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [predicting, setPredicting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  const fetchTierInfo = async () => {
    try {
      const res = await fetch(`/api/deliberations/${deliberationId}/tiers/${currentTier}`)
      if (res.ok) {
        const data = await res.json()
        setTierInfo(data)
      }
    } catch (err) {
      console.error('Failed to fetch tier info:', err)
    }
  }

  const fetchPredictions = async () => {
    if (!session) return
    try {
      const res = await fetch(`/api/predictions?deliberationId=${deliberationId}`)
      if (res.ok) {
        const data = await res.json()
        setPredictions(data.predictions || [])
      }
    } catch (err) {
      console.error('Failed to fetch predictions:', err)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([fetchTierInfo(), fetchPredictions()])
      setLoading(false)
    }
    loadData()

    // Poll for updates
    const interval = setInterval(() => {
      fetchTierInfo()
      fetchPredictions()
    }, 5000)
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
        body: JSON.stringify({
          deliberationId,
          predictedIdeaId: ideaId,
          tierPredictedAt: currentTier,
        }),
      })
      if (res.ok) {
        fetchPredictions()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to make prediction')
      }
    } finally {
      setPredicting(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-purple-border bg-purple-bg p-6 mb-6">
        <p className="text-muted">Loading predictions...</p>
      </div>
    )
  }

  if (!tierInfo) return null

  // Check if user already predicted this tier
  const currentTierPrediction = predictions.find(p => p.tierPredictedAt === currentTier)

  return (
    <div className="rounded-lg border border-purple-border bg-purple-bg p-6 mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex justify-between items-center"
      >
        <h2 className="text-lg font-semibold text-purple">
          Predict the Winner
          {tierInfo.isBatch && <span className="text-sm font-normal ml-2">(Batch - Same ideas across {tierInfo.stats.totalCells} cells)</span>}
        </h2>
        <svg
          className={`w-5 h-5 text-purple transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-4">
          {/* Voting Progress */}
          <div className="mb-4 p-3 bg-purple-light rounded-lg">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-purple">Voting Progress</span>
              <span className="text-purple font-mono">{tierInfo.stats.votingProgress}%</span>
            </div>
            <div className="w-full bg-background rounded-full h-2">
              <div
                className="bg-purple h-2 rounded-full transition-all"
                style={{ width: `${tierInfo.stats.votingProgress}%` }}
              />
            </div>
            <div className="text-xs text-muted mt-1">
              {tierInfo.stats.totalVotesCast} / {tierInfo.stats.totalVotesExpected} votes cast
              ({tierInfo.stats.completedCells} / {tierInfo.stats.totalCells} cells complete)
            </div>
          </div>

          {/* Ideas to predict */}
          <div className="space-y-2">
            {(tierInfo.liveTally || tierInfo.ideas).map((item) => {
              const idea = 'voteCount' in item ? { ...item, id: item.ideaId } : item
              const voteCount = 'voteCount' in item ? item.voteCount : undefined
              const isPredicted = currentTierPrediction?.predictedIdeaId === idea.id

              return (
                <div
                  key={idea.id}
                  className={`p-4 flex justify-between items-center rounded-lg ${
                    isPredicted ? 'bg-purple border-2 border-purple-hover' : 'bg-background border border-border'
                  }`}
                >
                  <div className="flex-1">
                    <p className={isPredicted ? 'text-white font-medium' : 'text-foreground'}>{idea.text}</p>
                    {voteCount !== undefined && (
                      <p className={`text-sm font-mono ${isPredicted ? 'text-purple-light' : 'text-muted'}`}>
                        {voteCount} votes
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isPredicted ? (
                      <span className="text-white text-sm font-medium px-3 py-1 bg-purple-hover rounded">
                        Your Pick
                      </span>
                    ) : !currentTierPrediction ? (
                      <button
                        onClick={() => handlePredict(idea.id)}
                        disabled={predicting === idea.id}
                        className="bg-purple hover:bg-purple-hover disabled:bg-muted-light text-white px-4 py-2 text-sm transition-colors rounded"
                      >
                        {predicting === idea.id ? '...' : 'Predict'}
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          {/* User's predictions history */}
          {predictions.length > 0 && (
            <div className="mt-6 pt-4 border-t border-purple-border">
              <h3 className="text-sm font-medium text-purple mb-2">Your Predictions</h3>
              <div className="space-y-2">
                {predictions.map(pred => (
                  <div key={pred.id} className="flex justify-between items-center text-sm p-2 bg-background rounded">
                    <div>
                      <span className="text-foreground">{pred.predictedIdea.text}</span>
                      <span className="text-muted ml-2">(Tier {pred.tierPredictedAt})</span>
                    </div>
                    <div>
                      {pred.resolvedAt === null ? (
                        <span className="text-warning">Pending</span>
                      ) : pred.wonImmediate ? (
                        <span className="text-success">Won!</span>
                      ) : pred.ideaBecameChampion ? (
                        <span className="text-success">Champion Pick!</span>
                      ) : (
                        <span className="text-error">Lost</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// History types
type HistoryIdea = {
  id: string
  text: string
  author: string
  votes: number
  isWinner: boolean
  status: string
}

type HistoryCell = {
  id: string
  tier: number
  completedAt: string
  ideas: HistoryIdea[]
  totalVotes: number
}

type VotingHistory = {
  challengeRound: number
  currentChampion: { id: string; text: string; author: { name: string } } | null
  tiers: Record<number, HistoryCell[]>
  totalCells: number
}

// History component
function VotingHistorySection({ deliberationId }: { deliberationId: string }) {
  const [history, setHistory] = useState<VotingHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/deliberations/${deliberationId}/history`)
        if (res.ok) {
          const data = await res.json()
          setHistory(data)
        }
      } catch (err) {
        console.error('Failed to fetch history:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [deliberationId])

  if (loading) {
    return (
      <div className="rounded-lg border border-border p-6 mb-6">
        <p className="text-muted">Loading history...</p>
      </div>
    )
  }

  if (!history || history.totalCells === 0) {
    return null
  }

  const tierNumbers = Object.keys(history.tiers).map(Number).sort((a, b) => a - b)

  return (
    <div className="rounded-lg border border-border p-6 mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex justify-between items-center"
      >
        <h2 className="text-lg font-semibold text-foreground">
          Voting History
          {history.challengeRound > 0 && (
            <span className="text-muted font-normal text-sm ml-2">
              (Challenge Round {history.challengeRound})
            </span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-muted text-sm font-mono">{history.totalCells} cells completed</span>
          <svg
            className={`w-5 h-5 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {tierNumbers.map(tier => (
            <div key={tier} className="border-l-2 border-border-strong pl-4">
              <h3 className="text-md font-medium text-foreground mb-2">Tier {tier}</h3>
              <div className="space-y-3">
                {history.tiers[tier].map(cell => (
                  <div key={cell.id} className="bg-surface p-3">
                    <div className="text-xs text-muted-light mb-2 font-mono">
                      Cell completed - {cell.totalVotes} votes cast
                    </div>
                    <div className="space-y-1">
                      {cell.ideas
                        .sort((a, b) => b.votes - a.votes)
                        .map(idea => (
                          <div
                            key={idea.id}
                            className={`flex justify-between items-center text-sm p-2 ${
                              idea.isWinner
                                ? 'bg-success-bg text-success border border-success-border'
                                : 'text-muted'
                            }`}
                          >
                            <span className="truncate flex-1">{idea.text}</span>
                            <span className="ml-2 font-mono">
                              {idea.votes} {idea.isWinner && '✓'}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
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
    // Poll for new comments every 10 seconds
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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-muted hover:text-foreground text-sm mb-3"
      >
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Discussion ({comments.length} messages)
      </button>

      {expanded && (
        <>
          {/* Comments list */}
          <div className="space-y-3 max-h-64 overflow-y-auto mb-3">
            {loading ? (
              <p className="text-muted-light text-sm">Loading...</p>
            ) : comments.length === 0 ? (
              <p className="text-muted-light text-sm">No messages yet. Start the discussion!</p>
            ) : (
              comments.map(comment => (
                <div key={comment.id} className="bg-surface p-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-foreground">
                      {getDisplayName(comment.user)}
                    </span>
                    <span className="text-xs text-muted-light font-mono">{formatTime(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm text-muted">{comment.text}</p>
                </div>
              ))
            )}
          </div>

          {/* Comment input */}
          {isParticipant && (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Share your thoughts..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1 bg-background rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={submitting || !newComment.trim()}
                className="bg-accent hover:bg-accent-hover disabled:bg-muted-light disabled:cursor-not-allowed text-white px-4 py-2 text-sm transition-colors"
              >
                {submitting ? '...' : 'Send'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  )
}

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
  const [isWatching, setIsWatching] = useState(false)
  const [watchLoading, setWatchLoading] = useState(false)

  const id = params.id as string

  const fetchWatchStatus = async () => {
    try {
      const res = await fetch(`/api/deliberations/${id}/watch`)
      if (res.ok) {
        const data = await res.json()
        setIsWatching(data.isWatching)
      }
    } catch (err) {
      console.error('Failed to fetch watch status:', err)
    }
  }

  const toggleWatch = async () => {
    if (!session) {
      router.push('/auth/signin')
      return
    }
    setWatchLoading(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/watch`, {
        method: isWatching ? 'DELETE' : 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setIsWatching(data.isWatching)
      }
    } finally {
      setWatchLoading(false)
    }
  }

  const fetchDeliberation = async () => {
    try {
      const res = await fetch(`/api/deliberations/${id}`)
      if (!res.ok) {
        if (res.status === 404) {
          router.push('/deliberations')
          return
        }
        throw new Error('Failed to fetch')
      }
      const data = await res.json()
      setDeliberation(data)
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
      if (res.ok) {
        const data = await res.json()
        setCells(data)
      }
    } catch (err) {
      console.error('Failed to fetch cells:', err)
    }
  }

  useEffect(() => {
    fetchDeliberation()
  }, [id])

  useEffect(() => {
    if (session) {
      fetchWatchStatus()
    }
  }, [id, session])

  // Poll for updates during VOTING phase
  useEffect(() => {
    if (deliberation?.phase === 'VOTING') {
      const interval = setInterval(() => {
        fetchDeliberation()
        fetchCells()
      }, 5000) // Poll every 5 seconds
      return () => clearInterval(interval)
    }
  }, [deliberation?.phase])

  useEffect(() => {
    if (deliberation?.phase === 'VOTING' || deliberation?.phase === 'COMPLETED') {
      fetchCells()
    }
  }, [deliberation?.phase, session])

  const handleJoin = async () => {
    if (!session) {
      router.push('/auth/signin')
      return
    }
    setJoining(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/join`, { method: 'POST' })
      if (res.ok) {
        fetchDeliberation()
      }
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
      if (res.ok) {
        setNewIdea('')
        fetchDeliberation()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleStartVoting = async () => {
    setStartingVote(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/start-voting`, { method: 'POST' })
      if (res.ok) {
        fetchDeliberation()
        fetchCells()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to start voting')
      }
    } finally {
      setStartingVote(false)
    }
  }

  const handleStartChallenge = async () => {
    setStartingChallenge(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/start-challenge`, { method: 'POST' })
      if (res.ok) {
        fetchDeliberation()
        fetchCells()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to start challenge round')
      }
    } finally {
      setStartingChallenge(false)
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
      if (res.ok) {
        fetchCells()
        fetchDeliberation()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to vote')
      }
    } finally {
      setVoting(null)
    }
  }

  const phaseStyles: Record<string, string> = {
    SUBMISSION: 'bg-accent-light text-accent border border-accent',
    VOTING: 'bg-warning-bg text-warning border border-warning-border',
    COMPLETED: 'bg-success-bg text-success border border-success-border',
    ACCUMULATING: 'bg-purple-bg text-purple border border-purple-border',
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    )
  }

  if (!deliberation) return null

  // Find winning idea
  const winner = deliberation.ideas.find(i => i.status === 'WINNER')

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-6xl mx-auto px-6 py-8">
        <Link href="/deliberations" className="text-muted hover:text-foreground text-sm mb-4 inline-block">
          &larr; Back to deliberations
        </Link>

        {/* Header Card */}
        <div className="rounded-lg border border-border p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{deliberation.question}</h1>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  const url = window.location.href
                  if (navigator.share) {
                    navigator.share({
                      title: deliberation.question,
                      text: `Join this deliberation: ${deliberation.question}`,
                      url,
                    }).catch(() => {})
                  } else {
                    navigator.clipboard.writeText(url)
                    alert('Link copied to clipboard!')
                  }
                }}
                className="p-2 text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors"
                title="Share"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
              <button
                onClick={() => {
                  window.open(`/api/deliberations/${deliberation.id}/export?format=json`, '_blank')
                }}
                className="p-2 text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors"
                title="Export data"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              <button
                onClick={toggleWatch}
                disabled={watchLoading}
                className={`p-2 rounded-lg transition-colors ${
                  isWatching
                    ? 'text-accent bg-accent-light hover:bg-surface'
                    : 'text-muted hover:text-foreground hover:bg-surface'
                }`}
                title={isWatching ? 'Stop watching' : 'Watch for updates'}
              >
                <svg className="w-5 h-5" fill={isWatching ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
              <span className={`text-xs px-2 py-1 font-medium ${phaseStyles[deliberation.phase]}`}>
                {deliberation.phase}
              </span>
            </div>
          </div>

          {deliberation.description && (
            <p className="text-muted mb-4">{deliberation.description}</p>
          )}

          <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm text-muted-light font-mono mb-4">
            <span>Created by {getDisplayName(deliberation.creator)}</span>
            <span>{deliberation._count.members} participants</span>
            <span>Tier {deliberation.currentTier}</span>
          </div>

          {/* Submission deadline countdown */}
          {deliberation.phase === 'SUBMISSION' && deliberation.submissionEndsAt && (
            <div className="bg-accent-light rounded-lg border border-accent p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="text-accent font-semibold">Submission Period</div>
                <CountdownTimer
                  deadline={deliberation.submissionEndsAt}
                  onExpire={fetchDeliberation}
                  compact
                  className="text-sm font-mono"
                />
              </div>
              <p className="text-muted text-sm mt-1">
                Submit your ideas before the deadline
              </p>
            </div>
          )}

          {/* Challenge round indicator */}
          {deliberation.challengeRound > 0 && deliberation.phase === 'VOTING' && (
            <div className="bg-orange-bg rounded-lg border border-orange p-4 mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-orange-hover font-semibold">
                    Challenge Round {deliberation.challengeRound}
                  </div>
                  <p className="text-muted text-sm mt-1">
                    Challengers are competing to dethrone the champion
                  </p>
                </div>
              </div>
              {/* Show defending champion */}
              {(() => {
                const defender = deliberation.ideas.find(i => i.status === 'DEFENDING')
                if (defender) {
                  return (
                    <div className="mt-3 bg-orange-light p-3">
                      <div className="text-orange-hover text-xs mb-1 font-medium">Defending Champion</div>
                      <div className="text-foreground text-sm">{defender.text}</div>
                    </div>
                  )
                }
                return null
              })()}
            </div>
          )}

          {/* Winner banner */}
          {winner && deliberation.phase !== 'ACCUMULATING' && (
            <div className="bg-success-bg rounded-lg border border-success-border p-4 mb-4">
              <div className="text-success font-semibold mb-1">Champion Idea</div>
              <div className="text-foreground text-lg">{winner.text}</div>
              <div className="text-success text-sm mt-1">by {getDisplayName(winner.author)}</div>
            </div>
          )}

          {/* Accumulation phase banner */}
          {deliberation.phase === 'ACCUMULATING' && (
            <div className="bg-purple-bg rounded-lg border border-purple-border p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-purple font-semibold text-lg">
                  Champion Crowned - Accepting Challengers
                </div>
                {deliberation.accumulationEndsAt && (
                  <CountdownTimer
                    deadline={deliberation.accumulationEndsAt}
                    label="Next round:"
                    onExpire={fetchDeliberation}
                    compact
                    className="text-sm font-mono"
                  />
                )}
              </div>
              {winner && (
                <div className="bg-purple-light p-3 mb-3">
                  <div className="text-purple text-sm mb-1">Current Champion</div>
                  <div className="text-foreground">{winner.text}</div>
                  <div className="text-purple text-sm mt-1">by {getDisplayName(winner.author)}</div>
                </div>
              )}
              <div className="flex gap-4 text-sm">
                <div className="text-muted">
                  Accumulated challengers:{' '}
                  <span className="text-purple font-medium font-mono">
                    {deliberation.ideas.filter(i => i.status === 'PENDING' && i.isNew).length}
                  </span>
                </div>
                {deliberation.ideas.filter(i => i.status === 'BENCHED').length > 0 && (
                  <div className="text-muted">
                    Benched:{' '}
                    <span className="text-warning font-medium font-mono">
                      {deliberation.ideas.filter(i => i.status === 'BENCHED').length}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 flex-wrap">
            {session && !deliberation.isMember && deliberation.phase === 'SUBMISSION' && (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="bg-success hover:bg-success-hover disabled:bg-muted-light text-white px-4 py-2 transition-colors"
              >
                {joining ? 'Joining...' : 'Join Deliberation'}
              </button>
            )}

            {deliberation.isMember && deliberation.phase === 'SUBMISSION' && deliberation.creatorId === deliberation.creator.id && (
              <button
                onClick={handleStartVoting}
                disabled={startingVote || deliberation.ideas.length < 2}
                className="bg-warning hover:bg-warning-hover disabled:bg-muted-light disabled:cursor-not-allowed text-white px-4 py-2 transition-colors"
              >
                {startingVote ? 'Starting...' : 'Start Voting'}
              </button>
            )}

            {deliberation.isMember && deliberation.phase === 'ACCUMULATING' && deliberation.creatorId === deliberation.creator.id && (
              <button
                onClick={handleStartChallenge}
                disabled={startingChallenge || deliberation.ideas.filter(i => i.status === 'PENDING' && i.isNew).length === 0}
                className="bg-orange hover:bg-orange-hover disabled:bg-muted-light disabled:cursor-not-allowed text-white px-4 py-2 transition-colors"
              >
                {startingChallenge ? 'Starting...' : 'Start Challenge Round'}
              </button>
            )}

            {deliberation.isMember && deliberation.inviteCode && (
              <button
                onClick={() => {
                  const url = `${window.location.origin}/invite/${deliberation.inviteCode}`
                  navigator.clipboard.writeText(url)
                  alert('Invite link copied!')
                }}
                className="rounded-lg border border-border hover:border-muted-light text-foreground px-4 py-2 transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
                Copy Invite Link
              </button>
            )}

            {!session && (
              <Link
                href="/auth/signin"
                className="inline-block bg-accent hover:bg-accent-hover text-white px-4 py-2 transition-colors"
              >
                Sign in to participate
              </Link>
            )}
          </div>
        </div>

        {/* Submit Idea Form - Submission Phase */}
        {deliberation.isMember && deliberation.phase === 'SUBMISSION' && (
          <div className="rounded-lg border border-border p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Submit an Idea</h2>
            <form onSubmit={handleSubmitIdea} className="flex gap-3">
              <input
                type="text"
                placeholder="Your idea..."
                value={newIdea}
                onChange={(e) => setNewIdea(e.target.value)}
                className="flex-1 bg-background rounded-lg border border-border px-4 py-2 text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={submitting || !newIdea.trim()}
                className="bg-accent hover:bg-accent-hover disabled:bg-muted-light disabled:cursor-not-allowed text-white px-6 py-2 transition-colors"
              >
                {submitting ? '...' : 'Submit'}
              </button>
            </form>
          </div>
        )}

        {/* Accumulation Form - During Voting or Accumulating Phase */}
        {deliberation.isMember && (deliberation.phase === 'VOTING' || deliberation.phase === 'ACCUMULATING') && (
          <div className="bg-purple-bg rounded-lg border border-purple-border p-6 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {deliberation.phase === 'ACCUMULATING' ? 'Challenge the Champion' : 'Submit for Next Round'}
            </h2>
            <p className="text-purple text-sm mb-4">
              {deliberation.phase === 'ACCUMULATING'
                ? 'Submit ideas to challenge the current champion in the next round.'
                : 'Voting is in progress. Your idea will be saved for the next challenge round.'}
            </p>
            <form onSubmit={handleSubmitIdea} className="flex gap-3">
              <input
                type="text"
                placeholder="Your challenger idea..."
                value={newIdea}
                onChange={(e) => setNewIdea(e.target.value)}
                className="flex-1 bg-background border border-purple-border px-4 py-2 text-foreground placeholder-muted-light focus:outline-none focus:border-purple"
              />
              <button
                type="submit"
                disabled={submitting || !newIdea.trim()}
                className="bg-purple hover:bg-purple-hover disabled:bg-muted-light disabled:cursor-not-allowed text-white px-6 py-2 transition-colors"
              >
                {submitting ? '...' : 'Submit'}
              </button>
            </form>
          </div>
        )}

        {/* Voting Progress - during voting phase */}
        {deliberation.phase === 'VOTING' && (
          <div className="bg-warning-bg rounded-lg border border-warning-border p-6 mb-6">
            <h2 className="text-lg font-semibold text-warning mb-3">
              Tier {deliberation.currentTier} Voting {cells.length === 0 ? '- Watching' : ''}
            </h2>

            <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
              <div className="bg-background rounded-lg border border-border p-2 sm:p-3 text-center">
                <div className="text-lg sm:text-2xl font-bold text-accent font-mono">
                  {deliberation.ideas.filter(i => i.status === 'IN_VOTING').length}
                </div>
                <div className="text-xs text-muted">Competing</div>
              </div>
              <div className="bg-background rounded-lg border border-border p-2 sm:p-3 text-center">
                <div className="text-lg sm:text-2xl font-bold text-success font-mono">
                  {deliberation.ideas.filter(i => i.status === 'ADVANCING').length}
                </div>
                <div className="text-xs text-muted">Advancing</div>
              </div>
              <div className="bg-background rounded-lg border border-border p-2 sm:p-3 text-center">
                <div className="text-lg sm:text-2xl font-bold text-error font-mono">
                  {deliberation.ideas.filter(i => i.status === 'ELIMINATED').length}
                </div>
                <div className="text-xs text-muted">Eliminated</div>
              </div>
            </div>

            {cells.length === 0 ? (
              <p className="text-muted text-sm">
                You&apos;re not assigned to vote in this tier. You may vote in a later tier or the final showdown.
              </p>
            ) : (
              <p className="text-muted text-sm">
                You have {cells.filter(c => c.status === 'VOTING').length} active cell(s) to vote in below.
              </p>
            )}
          </div>
        )}

        {/* Spectator Predictions - During Voting Phase */}
        {deliberation.phase === 'VOTING' && session && (
          <SpectatorPredictions deliberationId={id} currentTier={deliberation.currentTier} />
        )}

        {/* Voting Cells */}
        {(deliberation.phase === 'VOTING' || deliberation.phase === 'COMPLETED') && cells.length > 0 && (() => {
          // Separate active cells (need vote) from completed/voted cells
          const activeCells = cells.filter(c => c.status === 'VOTING' && c.votes.length === 0)
          const otherCells = cells.filter(c => c.status !== 'VOTING' || c.votes.length > 0)

          return (
          <div className="space-y-6 mb-6">
            {/* Priority: Show active cell needing vote */}
            {activeCells.length > 0 && (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-warning rounded-full animate-pulse" />
                  <h2 className="text-xl font-semibold text-foreground">Vote Now</h2>
                </div>
                {activeCells.map(cell => {
              const hasVoted = cell.votes.length > 0
              const votedIdeaId = cell.votes[0]?.ideaId

              return (
                <div key={cell.id} className="rounded-lg border border-border p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-foreground">Tier {cell.tier} Cell</h3>
                    <div className="flex items-center gap-3">
                      {cell.status === 'VOTING' && cell.votingDeadline && (
                        <CountdownTimer
                          deadline={cell.votingDeadline}
                          onExpire={() => {
                            fetchCells()
                            fetchDeliberation()
                          }}
                          compact
                          className="text-sm font-mono"
                        />
                      )}
                      <span className={`text-sm px-2 py-1 ${
                        cell.status === 'COMPLETED' ? 'bg-success-bg text-success border border-success-border' :
                        cell.status === 'VOTING' ? 'bg-warning-bg text-warning border border-warning-border' :
                        'bg-surface text-muted rounded-lg border border-border'
                      }`}>
                        {cell.status}
                      </span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="text-sm text-muted-light mb-2">Participants:</div>
                    <div className="flex gap-2 flex-wrap">
                      {cell.participants.map(p => (
                        <span key={p.userId} className={`text-sm px-2 py-1 ${
                          p.status === 'VOTED' ? 'bg-success-bg text-success border border-success-border' : 'bg-surface text-muted border border-border'
                        }`}>
                          {getDisplayName(p.user)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {cell.ideas.map(({ idea }) => {
                      const isVoted = votedIdeaId === idea.id
                      const isWinner = idea.status === 'ADVANCING' || idea.status === 'WINNER'
                      const isEliminated = idea.status === 'ELIMINATED'

                      return (
                        <div
                          key={idea.id}
                          className={`p-4 flex justify-between items-center ${
                            isWinner ? 'bg-success-bg border border-success-border' :
                            isEliminated ? 'bg-error-bg border border-error-border' :
                            isVoted ? 'bg-accent-light border border-accent' :
                            'bg-surface border border-border'
                          }`}
                        >
                          <div className="flex-1">
                            <p className={`${isEliminated ? 'text-muted-light' : 'text-foreground'}`}>{idea.text}</p>
                            <p className="text-sm text-muted-light">by {getDisplayName(idea.author)}</p>
                          </div>

                          <div className="flex items-center gap-3">
                            {cell.status === 'COMPLETED' && (
                              <span className="text-muted text-sm font-mono">{idea.totalVotes} votes</span>
                            )}

                            {cell.status === 'VOTING' && !hasVoted && (
                              <button
                                onClick={() => handleVote(cell.id, idea.id)}
                                disabled={voting === idea.id}
                                className="bg-accent hover:bg-accent-hover disabled:bg-muted-light text-white px-4 py-2 text-sm transition-colors"
                              >
                                {voting === idea.id ? '...' : 'Vote'}
                              </button>
                            )}

                            {isVoted && (
                              <span className="text-accent text-sm font-medium">Your vote</span>
                            )}

                            {isWinner && (
                              <span className="text-success text-sm font-medium">Advanced</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Discussion section */}
                  <CellDiscussion cellId={cell.id} isParticipant={true} />
                </div>
              )})}
              </>
            )}

            {/* Secondary: Show completed/voted cells */}
            {otherCells.length > 0 && (
              <>
                <h2 className="text-lg font-semibold text-muted mt-8">
                  {activeCells.length > 0 ? 'Previous Cells' : 'Your Voting Cells'}
                </h2>
                {otherCells.map(cell => {
                  const hasVoted = cell.votes.length > 0
                  const votedIdeaId = cell.votes[0]?.ideaId

                  return (
                    <div key={cell.id} className="rounded-lg border border-border p-6 opacity-80">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-medium text-foreground">Tier {cell.tier} Cell</h3>
                        <span className={`text-sm px-2 py-1 ${
                          cell.status === 'COMPLETED' ? 'bg-success-bg text-success border border-success-border' :
                          hasVoted ? 'bg-accent-light text-accent border border-accent' :
                          'bg-surface text-muted border border-border'
                        }`}>
                          {hasVoted && cell.status === 'VOTING' ? 'Voted - Waiting' : cell.status}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {cell.ideas.map(({ idea }) => {
                          const isVoted = votedIdeaId === idea.id
                          const isWinner = idea.status === 'ADVANCING' || idea.status === 'WINNER'
                          const isEliminated = idea.status === 'ELIMINATED'

                          return (
                            <div
                              key={idea.id}
                              className={`p-3 flex justify-between items-center ${
                                isWinner ? 'bg-success-bg border border-success-border' :
                                isEliminated ? 'bg-error-bg border border-error-border' :
                                isVoted ? 'bg-accent-light border border-accent' :
                                'bg-surface border border-border'
                              }`}
                            >
                              <span className={`${isEliminated ? 'text-muted-light' : 'text-foreground'}`}>{idea.text}</span>
                              <span className="text-sm">
                                {cell.status === 'COMPLETED' && <span className="text-muted font-mono">{idea.totalVotes} votes</span>}
                                {isVoted && <span className="text-accent ml-2">Your vote</span>}
                                {isWinner && <span className="text-success ml-2">Advanced</span>}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
          )
        })()}

        {/* Voting History */}
        <VotingHistorySection deliberationId={id} key={`history-${deliberation.phase}-${deliberation.challengeRound}`} />

        {/* All Ideas List */}
        <div className="rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            All Ideas ({deliberation.ideas.length})
          </h2>

          {deliberation.ideas.length === 0 ? (
            <p className="text-muted">No ideas submitted yet.</p>
          ) : (
            <div className="space-y-2">
              {deliberation.ideas.map((idea) => (
                <div
                  key={idea.id}
                  className={`p-4 flex justify-between items-center ${
                    idea.status === 'WINNER' ? 'bg-success-bg border border-success-border' :
                    idea.status === 'DEFENDING' ? 'bg-orange-bg border border-orange' :
                    idea.status === 'ADVANCING' ? 'bg-accent-light border border-accent' :
                    idea.status === 'IN_VOTING' ? 'bg-warning-bg border border-warning-border' :
                    idea.status === 'BENCHED' ? 'bg-surface rounded-lg border border-border' :
                    idea.status === 'ELIMINATED' || idea.status === 'RETIRED' ? 'bg-surface border border-border' :
                    'bg-background border border-border'
                  }`}
                >
                  <div>
                    <p className={`${idea.status === 'ELIMINATED' || idea.status === 'RETIRED' ? 'text-muted-light' : 'text-foreground'}`}>
                      {idea.text}
                    </p>
                    <p className="text-sm text-muted-light">by {getDisplayName(idea.author)}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-medium ${
                      idea.status === 'WINNER' ? 'text-success' :
                      idea.status === 'DEFENDING' ? 'text-orange-hover' :
                      idea.status === 'ADVANCING' ? 'text-accent' :
                      idea.status === 'IN_VOTING' ? 'text-warning' :
                      idea.status === 'BENCHED' ? 'text-muted' :
                      idea.status === 'ELIMINATED' ? 'text-error' :
                      idea.status === 'RETIRED' ? 'text-muted-light' :
                      'text-muted'
                    }`}>
                      {idea.status}
                    </span>
                    {idea.totalVotes > 0 && (
                      <p className="text-muted-light text-sm font-mono">{idea.totalVotes} votes</p>
                    )}
                    {idea.losses > 0 && (
                      <p className="text-muted-light text-xs font-mono">{idea.losses} tier-1 loss{idea.losses > 1 ? 'es' : ''}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
