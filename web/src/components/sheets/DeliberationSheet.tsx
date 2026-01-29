'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import type { FeedItem } from '@/types/feed'

type Prediction = {
  id: string
  tierPredictedAt: number
  predictedIdea: { id: string; text: string }
  wonImmediate: boolean | null
  ideaBecameChampion: boolean | null
  resolvedAt: string | null
}

type Comment = {
  id: string
  text: string
  createdAt: string
  views: number
  reachTier: number
  upvoteCount: number
  userHasUpvoted: boolean
  isUpPollinated: boolean
  sourceTier: number
  linkedIdea?: { id: string; text: string } | null
  user: {
    id: string
    name: string | null
    image: string | null
  }
}

type Props = {
  item: FeedItem
  onAction: () => void
  onClose: () => void
}

export default function DeliberationSheet({ item, onAction, onClose }: Props) {
  const { data: session } = useSession()
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [localComments, setLocalComments] = useState<Comment[]>([])
  const [upPollinatedComments, setUpPollinatedComments] = useState<Comment[]>([])
  const [cellTier, setCellTier] = useState(1)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [linkedIdeaId, setLinkedIdeaId] = useState<string | null>(null)
  const [upvoting, setUpvoting] = useState<string | null>(null)
  const [upPollinationEvent, setUpPollinationEvent] = useState<{ commentId: string; newTier: number } | null>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  // Fetch user's predictions and comments
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch predictions if logged in
        if (session) {
          const predRes = await fetch(`/api/predictions?deliberationId=${item.deliberation.id}`)
          if (predRes.ok) {
            const data = await predRes.json()
            setPredictions(data.predictions || [])
          }
        }

        // Fetch comments if user is in a cell
        if (item.cell) {
          const commentsRes = await fetch(`/api/cells/${item.cell.id}/comments`)
          if (commentsRes.ok) {
            const commentsData = await commentsRes.json()
            setLocalComments(commentsData.local || [])
            setUpPollinatedComments(commentsData.upPollinated || [])
            setCellTier(commentsData.cellTier || 1)
          }
        }
      } catch (err) {
        console.error('Failed to fetch data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [session, item.deliberation.id, item.cell])

  // Handle upvote
  const handleUpvote = async (commentId: string) => {
    if (!session) return
    setUpvoting(commentId)
    try {
      const res = await fetch(`/api/comments/${commentId}/upvote`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        // Update local or up-pollinated comments
        const updateComments = (comments: Comment[]) =>
          comments.map(c => c.id === commentId ? {
            ...c,
            userHasUpvoted: data.upvoted,
            upvoteCount: c.upvoteCount + (data.upvoted ? 1 : -1),
            reachTier: data.newTier || c.reachTier,
          } : c)
        setLocalComments(prev => updateComments(prev))
        setUpPollinatedComments(prev => updateComments(prev))

        // Show celebration if comment up-pollinated
        if (data.upPollinated && data.newTier) {
          setUpPollinationEvent({ commentId, newTier: data.newTier })
          // Auto-hide after 3 seconds
          setTimeout(() => setUpPollinationEvent(null), 3000)
        }
      }
    } catch (err) {
      console.error('Failed to upvote:', err)
    } finally {
      setUpvoting(null)
    }
  }

  // Calculate up-pollination progress
  const getUpPollinationProgress = (comment: Comment) => {
    const tierSizes = [5, 25, 125, 625, 3125]
    const currentTierSize = tierSizes[comment.reachTier - 1] || 5
    const threshold = Math.ceil(currentTierSize * 0.6)
    const progress = Math.min(100, (comment.upvoteCount / threshold) * 100)
    const remaining = Math.max(0, threshold - comment.upvoteCount)
    return { progress, remaining, threshold }
  }

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!comment.trim() || !item.cell) return

    setSubmittingComment(true)
    try {
      const res = await fetch(`/api/cells/${item.cell.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: comment, ideaId: linkedIdeaId || undefined }),
      })

      if (res.ok) {
        const newComment = await res.json()
        // Get linked idea from selected idea
        const selectedIdea = linkedIdeaId && item.cell?.ideas?.find(i => i.id === linkedIdeaId)
        // Add defaults for new comment fields
        const commentWithDefaults: Comment = {
          ...newComment,
          views: 0,
          reachTier: 1,
          upvoteCount: 0,
          userHasUpvoted: false,
          isUpPollinated: false,
          sourceTier: cellTier,
          linkedIdea: selectedIdea ? { id: selectedIdea.id, text: selectedIdea.text } : null,
        }
        setLocalComments(prev => {
          // Avoid duplicates if comment already exists
          if (prev.some(c => c.id === commentWithDefaults.id)) return prev
          return [...prev, commentWithDefaults]
        })
        setComment('')
        setLinkedIdeaId(null)
        // Scroll to new comment
        setTimeout(() => {
          commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to post comment')
      }
    } catch (err) {
      console.error('Failed to post comment:', err)
      alert('Failed to post comment: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSubmittingComment(false)
    }
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <div className="px-4 pb-4">
      {/* Compact header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-foreground leading-tight">
          {item.deliberation.question}
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted shrink-0">
          <span>T{item.deliberation.currentTier}</span>
          <span>•</span>
          <span>{item.cell?.votedCount || 0}/{item.cell?.participantCount || item.deliberation._count.members}</span>
        </div>
      </div>

      {/* Up-pollination celebration - compact */}
      {upPollinationEvent && (
        <div className="mb-3 px-3 py-2 bg-purple-bg border border-purple rounded-lg text-sm flex items-center gap-2">
          <span>🌸</span>
          <span className="text-purple font-medium">Spread to T{upPollinationEvent.newTier}!</span>
        </div>
      )}

      {/* Discussion - if in a cell */}
      {item.cell && (
        <div>
          {/* Up-pollinated comments - compact */}
          {upPollinatedComments.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-purple mb-1.5 flex items-center gap-1">
                🌸 From other cells ({upPollinatedComments.length})
              </div>
              <div className="bg-purple-bg/30 rounded border border-purple/30 max-h-28 overflow-y-auto divide-y divide-purple/20">
                {upPollinatedComments.map((c) => (
                  <div key={c.id} className="px-2 py-1.5 text-xs">
                    <div className="flex items-center gap-1.5 text-muted">
                      <span className="bg-purple text-white px-1.5 py-0.5 rounded text-[10px] font-medium">
                        from T{c.sourceTier} cell
                      </span>
                      <span className="text-accent font-medium">{c.user.name || 'Anon'}</span>
                      <span className="ml-auto">
                        <button
                          onClick={() => handleUpvote(c.id)}
                          disabled={upvoting === c.id || !session}
                          className={c.userHasUpvoted ? 'text-accent' : 'hover:text-accent'}
                        >
                          👍 {c.upvoteCount}
                        </button>
                      </span>
                    </div>
                    {c.linkedIdea && (
                      <p className="text-xs text-warning truncate mt-0.5">
                        Re: {c.linkedIdea.text.slice(0, 40)}{c.linkedIdea.text.length > 40 ? '...' : ''}
                      </p>
                    )}
                    <p className="text-foreground text-sm mt-0.5">{c.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Local comments header */}
          <div className="text-xs text-muted mb-1.5">
            Cell chat {localComments.length > 0 && `(${localComments.length})`}
          </div>

          {/* Comments list - compact */}
          {localComments.length > 0 ? (
            <div className="bg-background rounded border border-border mb-2 max-h-40 overflow-y-auto divide-y divide-border">
              {localComments.map((c) => {
                const { remaining } = getUpPollinationProgress(c)
                const canSpread = c.reachTier < cellTier && remaining > 0
                return (
                  <div key={c.id} className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="text-accent font-medium">{c.user.name || 'Anon'}</span>
                      <span>•</span>
                      <span>{timeAgo(c.createdAt)}</span>
                      {c.reachTier > 1 && <span className="text-purple">🌸T{c.reachTier}</span>}
                      <span className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => handleUpvote(c.id)}
                          disabled={upvoting === c.id || !session}
                          className={c.userHasUpvoted ? 'text-accent' : 'hover:text-accent'}
                        >
                          👍 {c.upvoteCount}
                        </button>
                        {canSpread && (
                          <span className="text-purple font-medium">
                            {c.upvoteCount}/{c.upvoteCount + remaining} 🌸
                          </span>
                        )}
                      </span>
                    </div>
                    {c.linkedIdea && (
                      <p className="text-xs text-warning truncate">
                        Re: {c.linkedIdea.text.slice(0, 40)}{c.linkedIdea.text.length > 40 ? '...' : ''}
                      </p>
                    )}
                    <p className="text-foreground text-sm">{c.text}</p>
                  </div>
                )
              })}
              <div ref={commentsEndRef} />
            </div>
          ) : (
            <p className="text-muted text-xs mb-2">No comments yet</p>
          )}

          {/* Comment input */}
          {session ? (
            <div className="space-y-2">
              {/* Idea chips - tap to link comment */}
              {item.cell.ideas && item.cell.ideas.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.cell.ideas.map(idea => (
                    <button
                      key={idea.id}
                      type="button"
                      onClick={() => setLinkedIdeaId(linkedIdeaId === idea.id ? null : idea.id)}
                      className={`text-xs px-2 py-1 rounded border transition-colors truncate max-w-[150px] ${
                        linkedIdeaId === idea.id
                          ? 'bg-warning-bg border-warning text-warning'
                          : 'bg-background border-border text-muted hover:border-warning hover:text-warning'
                      }`}
                      title={idea.text}
                    >
                      {idea.text.slice(0, 25)}{idea.text.length > 25 ? '...' : ''}
                    </button>
                  ))}
                </div>
              )}
              {linkedIdeaId && (
                <p className="text-xs text-warning">Replying to idea (comment will follow it across tiers)</p>
              )}
              <form onSubmit={handleCommentSubmit} className="flex gap-1.5">
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={linkedIdeaId ? "Comment on this idea..." : "Say something..."}
                  className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-foreground placeholder-muted focus:outline-none focus:border-accent text-sm"
                />
                <button
                  type="submit"
                  disabled={submittingComment || !comment.trim()}
                  className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded text-sm transition-colors disabled:opacity-50"
                >
                  {submittingComment ? '...' : 'Send'}
                </button>
              </form>
            </div>
          ) : (
            <p className="text-muted text-xs">
              <Link href="/auth/signin" className="text-accent hover:underline">Sign in</Link> to chat
            </p>
          )}
        </div>
      )}

      {/* Full page link - compact */}
      <Link
        href={`/deliberations/${item.deliberation.id}`}
        className="block text-center text-accent hover:text-accent-hover text-sm py-2 transition-colors"
        onClick={onClose}
      >
        View full page →
      </Link>
    </div>
  )
}
