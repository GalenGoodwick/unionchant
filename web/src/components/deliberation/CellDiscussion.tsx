'use client'

import { useEffect, useState } from 'react'
import { getDisplayName } from '@/lib/user'
import { useToast } from '@/components/Toast'
import type { CommentWithUpvote } from './types'

export default function CellDiscussion({ cellId, isParticipant, ideas }: {
  cellId: string
  isParticipant: boolean
  ideas?: { id: string; text: string }[]
}) {
  const { showToast } = useToast()
  const [localComments, setLocalComments] = useState<CommentWithUpvote[]>([])
  const [upPollinatedComments, setUpPollinatedComments] = useState<CommentWithUpvote[]>([])
  const [newComment, setNewComment] = useState('')
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [upvoting, setUpvoting] = useState<string | null>(null)

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/cells/${cellId}/comments`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setLocalComments(data)
          setUpPollinatedComments([])
        } else {
          setLocalComments(data.local || [])
          setUpPollinatedComments(data.upPollinated || [])
        }
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err)
    } finally {
      setLoading(false)
    }
  }

  const comments = [...localComments, ...upPollinatedComments]
  const totalCount = comments.length

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
        body: JSON.stringify({
          text: newComment,
          ideaId: selectedIdeaId || undefined,
        }),
      })
      if (res.ok) {
        setNewComment('')
        setSelectedIdeaId(null)
        fetchComments()
      } else {
        const data = await res.json()
        console.error('Comment failed:', data.error)
        showToast(data.error || 'Failed to post comment', 'error')
      }
    } catch (err) {
      console.error('Comment error:', err)
      showToast('Failed to post comment', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpvote = async (commentId: string) => {
    setUpvoting(commentId)
    try {
      const res = await fetch(`/api/comments/${commentId}/upvote`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        if (data.upPollinated) {
          showToast(`Comment pollinated to Tier ${data.newTier}!`, 'success')
        }
        fetchComments()
      }
    } catch (err) {
      console.error('Failed to upvote:', err)
    } finally {
      setUpvoting(null)
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
        Discussion ({totalCount})
        {upPollinatedComments.length > 0 && (
          <span className="text-purple text-xs">+{upPollinatedComments.length} from other cells</span>
        )}
      </button>

      {expanded && (
        <div className="mt-2">
          {upPollinatedComments.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-purple mb-1.5">From other cells in this batch:</p>
              <div className="space-y-1.5">
                {upPollinatedComments.slice(0, 3).map(c => (
                  <div key={c.id} className="bg-purple-bg border-l-2 border-purple rounded p-2 text-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-purple">{getDisplayName(c.user)}</span>
                          <span className="text-xs text-muted">T{c.sourceTier}</span>
                          {c.reachTier && c.reachTier > 1 && (
                            <span className="text-purple text-xs">reached T{c.reachTier}</span>
                          )}
                        </div>
                        <p className="text-foreground text-sm">{c.text}</p>
                      </div>
                      <span className="text-xs text-purple font-mono">{c.upvoteCount || 0}↑</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted mb-2">Upvoted comments get carried to higher-tier cells so the best arguments follow winning ideas.</p>

          <div className="space-y-2 max-h-40 overflow-y-auto mb-2">
            {loading ? (
              <p className="text-muted text-sm">Loading...</p>
            ) : localComments.length === 0 ? (
              <p className="text-muted text-sm">No messages yet in this cell</p>
            ) : (
              localComments.map(c => (
                <div key={c.id} className="bg-surface rounded p-2 text-sm">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-accent">{getDisplayName(c.user)}</span>
                        <span className="text-muted text-xs">{timeAgo(c.createdAt)}</span>
                        {c.reachTier && c.reachTier > 1 && (
                          <span className="text-purple text-xs">↑T{c.reachTier}</span>
                        )}
                      </div>
                      {c.linkedIdea && (
                        <p className="text-xs text-warning truncate">
                          Re: {c.linkedIdea.text.slice(0, 50)}{c.linkedIdea.text.length > 50 ? '...' : ''}
                        </p>
                      )}
                      <p className="text-foreground">{c.text}</p>
                    </div>
                    <button
                      onClick={() => handleUpvote(c.id)}
                      disabled={upvoting === c.id || c.userHasUpvoted}
                      className={`group relative ml-2 flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                        c.userHasUpvoted
                          ? 'bg-purple-bg text-purple'
                          : 'bg-surface hover:bg-purple-bg text-muted hover:text-purple'
                      }`}
                    >
                      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-44 rounded bg-surface-hover px-2 py-1 text-[10px] text-foreground text-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg border border-border z-10">
                        {c.userHasUpvoted ? 'You pollinated this' : 'Pollinate — enough upvotes carry this comment to higher tiers'}
                      </span>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5" />
                        <path d="M5 12l7-7 7 7" />
                        {c.userHasUpvoted && <>
                          <path d="M8 2l-2 2" opacity={0.6} />
                          <path d="M16 2l2 2" opacity={0.6} />
                        </>}
                      </svg>
                      <span className="font-mono">{c.upvoteCount || 0}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {isParticipant && (
            <div className="space-y-2">
              {ideas && ideas.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ideas.map(idea => (
                    <button
                      key={idea.id}
                      type="button"
                      onClick={() => setSelectedIdeaId(selectedIdeaId === idea.id ? null : idea.id)}
                      className={`text-xs px-2 py-1 rounded border transition-colors truncate max-w-[150px] ${
                        selectedIdeaId === idea.id
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
              {selectedIdeaId && (
                <p className="text-xs text-warning">Replying to idea (top comments will follow winning ideas)</p>
              )}
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="text"
                  placeholder={selectedIdeaId ? "Comment on this idea..." : "Message..."}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  maxLength={2000}
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}
