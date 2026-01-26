'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { NotificationBanner } from '@/components/NotificationSettings'

type Idea = {
  id: string
  text: string
  status: string
  totalVotes: number
  author: { name: string | null }
}

type CellIdea = {
  ideaId: string
  idea: Idea
}

type Participant = {
  userId: string
  status: string
  user: { id: string; name: string | null; image: string | null }
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
  user: { id: string; name: string | null; image: string | null }
}

type Cell = {
  id: string
  tier: number
  status: string
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
  creator: { id: string; name: string | null }
  ideas: Idea[]
  _count: { members: number }
  isMember?: boolean
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
    <div className="mt-4 border-t border-slate-600 pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-slate-400 hover:text-slate-300 text-sm mb-3"
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
              <p className="text-slate-500 text-sm">Loading...</p>
            ) : comments.length === 0 ? (
              <p className="text-slate-500 text-sm">No messages yet. Start the discussion!</p>
            ) : (
              comments.map(comment => (
                <div key={comment.id} className="bg-slate-700/50 rounded-lg p-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-slate-300">
                      {comment.user.name || 'Anonymous'}
                    </span>
                    <span className="text-xs text-slate-500">{formatTime(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-300">{comment.text}</p>
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
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={submitting || !newComment.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm transition-colors"
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
  const [voting, setVoting] = useState<string | null>(null)

  const id = params.id as string

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

  const phaseColors: Record<string, string> = {
    SUBMISSION: 'bg-blue-500',
    VOTING: 'bg-yellow-500',
    COMPLETED: 'bg-green-500',
    ACCUMULATING: 'bg-purple-500',
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    )
  }

  if (!deliberation) return null

  // Find winning idea
  const winner = deliberation.ideas.find(i => i.status === 'WINNER')

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/deliberations" className="text-slate-400 hover:text-slate-300 text-sm mb-4 inline-block">
          &larr; Back to deliberations
        </Link>

        {/* Notification prompt for members in voting phase */}
        {deliberation.isMember && deliberation.phase === 'VOTING' && (
          <NotificationBanner />
        )}

        {/* Header */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-6">
          <div className="flex justify-between items-start mb-4">
            <h1 className="text-2xl font-bold text-white">{deliberation.question}</h1>
            <span className={`${phaseColors[deliberation.phase]} text-white text-sm px-3 py-1 rounded`}>
              {deliberation.phase}
            </span>
          </div>

          {deliberation.description && (
            <p className="text-slate-400 mb-4">{deliberation.description}</p>
          )}

          <div className="flex gap-4 text-sm text-slate-500 mb-4">
            <span>Created by {deliberation.creator.name || 'Anonymous'}</span>
            <span>{deliberation._count.members} participants</span>
            <span>Tier {deliberation.currentTier}</span>
          </div>

          {/* Winner banner */}
          {winner && (
            <div className="bg-green-600/20 border border-green-500 rounded-lg p-4 mb-4">
              <div className="text-green-400 font-semibold mb-1">Champion Idea</div>
              <div className="text-white text-lg">{winner.text}</div>
              <div className="text-green-400/70 text-sm mt-1">by {winner.author.name || 'Anonymous'}</div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {session && !deliberation.isMember && deliberation.phase === 'SUBMISSION' && (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {joining ? 'Joining...' : 'Join Deliberation'}
              </button>
            )}

            {deliberation.isMember && deliberation.phase === 'SUBMISSION' && deliberation.creatorId === deliberation.creator.id && (
              <button
                onClick={handleStartVoting}
                disabled={startingVote || deliberation.ideas.length < 2}
                className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
              >
                {startingVote ? 'Starting...' : 'Start Voting'}
              </button>
            )}

            {!session && (
              <Link
                href="/auth/signin"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Sign in to participate
              </Link>
            )}
          </div>
        </div>

        {/* Submit Idea Form */}
        {deliberation.isMember && deliberation.phase === 'SUBMISSION' && (
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Submit an Idea</h2>
            <form onSubmit={handleSubmitIdea} className="flex gap-3">
              <input
                type="text"
                placeholder="Your idea..."
                value={newIdea}
                onChange={(e) => setNewIdea(e.target.value)}
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={submitting || !newIdea.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors"
              >
                {submitting ? '...' : 'Submit'}
              </button>
            </form>
          </div>
        )}

        {/* Voting Cells */}
        {(deliberation.phase === 'VOTING' || deliberation.phase === 'COMPLETED') && cells.length > 0 && (
          <div className="space-y-6 mb-6">
            <h2 className="text-xl font-semibold text-white">Your Voting Cells</h2>
            {cells.map(cell => {
              const hasVoted = cell.votes.length > 0
              const votedIdeaId = cell.votes[0]?.ideaId
              const currentUserId = session?.user?.email

              return (
                <div key={cell.id} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-white">Tier {cell.tier} Cell</h3>
                    <span className={`text-sm px-2 py-1 rounded ${
                      cell.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                      cell.status === 'VOTING' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-slate-600 text-slate-400'
                    }`}>
                      {cell.status}
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="text-sm text-slate-500 mb-2">Participants:</div>
                    <div className="flex gap-2 flex-wrap">
                      {cell.participants.map(p => (
                        <span key={p.userId} className={`text-sm px-2 py-1 rounded ${
                          p.status === 'VOTED' ? 'bg-green-600/30 text-green-400' : 'bg-slate-700 text-slate-300'
                        }`}>
                          {p.user.name || 'Anonymous'}
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
                          className={`p-4 rounded-lg flex justify-between items-center ${
                            isWinner ? 'bg-green-600/20 border border-green-500' :
                            isEliminated ? 'bg-red-600/10 border border-red-500/30' :
                            isVoted ? 'bg-blue-600/20 border border-blue-500' :
                            'bg-slate-700'
                          }`}
                        >
                          <div className="flex-1">
                            <p className={`${isEliminated ? 'text-slate-500' : 'text-white'}`}>{idea.text}</p>
                            <p className="text-sm text-slate-500">by {idea.author.name || 'Anonymous'}</p>
                          </div>

                          <div className="flex items-center gap-3">
                            {cell.status === 'COMPLETED' && (
                              <span className="text-slate-400 text-sm">{idea.totalVotes} votes</span>
                            )}

                            {cell.status === 'VOTING' && !hasVoted && (
                              <button
                                onClick={() => handleVote(cell.id, idea.id)}
                                disabled={voting === idea.id}
                                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                              >
                                {voting === idea.id ? '...' : 'Vote'}
                              </button>
                            )}

                            {isVoted && (
                              <span className="text-blue-400 text-sm">Your vote</span>
                            )}

                            {isWinner && (
                              <span className="text-green-400 text-sm font-medium">Advanced</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Discussion section */}
                  <CellDiscussion cellId={cell.id} isParticipant={true} />
                </div>
              )
            })}
          </div>
        )}

        {/* All Ideas List */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-lg font-semibold text-white mb-4">
            All Ideas ({deliberation.ideas.length})
          </h2>

          {deliberation.ideas.length === 0 ? (
            <p className="text-slate-400">No ideas submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {deliberation.ideas.map((idea) => (
                <div
                  key={idea.id}
                  className={`rounded-lg p-4 flex justify-between items-center ${
                    idea.status === 'WINNER' ? 'bg-green-600/20 border border-green-500' :
                    idea.status === 'ADVANCING' ? 'bg-blue-600/20 border border-blue-500' :
                    idea.status === 'ELIMINATED' ? 'bg-slate-700/50' :
                    'bg-slate-700'
                  }`}
                >
                  <div>
                    <p className={`${idea.status === 'ELIMINATED' ? 'text-slate-500' : 'text-white'}`}>
                      {idea.text}
                    </p>
                    <p className="text-sm text-slate-500">by {idea.author.name || 'Anonymous'}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm ${
                      idea.status === 'WINNER' ? 'text-green-400 font-medium' :
                      idea.status === 'ADVANCING' ? 'text-blue-400' :
                      idea.status === 'ELIMINATED' ? 'text-red-400/70' :
                      'text-slate-400'
                    }`}>
                      {idea.status}
                    </span>
                    {idea.totalVotes > 0 && (
                      <p className="text-slate-400 text-sm">{idea.totalVotes} votes</p>
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
