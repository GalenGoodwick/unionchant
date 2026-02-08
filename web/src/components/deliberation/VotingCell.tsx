'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import CountdownTimer from '@/components/CountdownTimer'
import { getDisplayName } from '@/lib/user'
import { useToast } from '@/components/Toast'
import FirstVisitTooltip from '@/components/FirstVisitTooltip'
import type { Cell, CommentWithUpvote } from './types'

export default function VotingCell({
  cell,
  onVote,
  voting,
  onRefresh,
  currentTier
}: {
  cell: Cell
  onVote: (cellId: string, allocations: { ideaId: string; points: number }[]) => void
  voting: string | null
  onRefresh: () => void
  currentTier?: number
}) {
  const { showToast } = useToast()

  // === VOTING STATE ===
  const hasVoted = cell.votes.length > 0
  const isActive = cell.status === 'VOTING' && !hasVoted
  const isFinalizing = cell.status === 'VOTING' && !!cell.finalizesAt
  const canChangeVote = isFinalizing && hasVoted

  const existingAllocation: Record<string, number> = {}
  if (hasVoted) {
    cell.votes.forEach(v => {
      existingAllocation[v.ideaId] = (existingAllocation[v.ideaId] || 0) + v.xpPoints
    })
  }

  const [xp, setXP] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState(false)

  const validKeys = new Set<string>()
  cell.ideas.forEach(ci => validKeys.add(ci.idea.id))
  const totalSpent = Object.entries(xp)
    .filter(([key]) => validKeys.has(key))
    .reduce((sum, [, v]) => sum + (isNaN(v) ? 0 : v), 0)
  const remaining = 10 - totalSpent

  const setSlider = useCallback((ideaId: string, value: number) => {
    setXP(prev => {
      const safeValue = isNaN(value) ? 0 : Math.round(value)
      const otherTotal = Object.entries(prev).reduce(
        (sum, [id, v]) => sum + (id === ideaId ? 0 : (isNaN(v) ? 0 : v)), 0
      )
      const maxAllowed = Math.max(0, 10 - otherTotal)
      const clamped = Math.max(0, Math.min(maxAllowed, safeValue))
      const next = { ...prev, [ideaId]: clamped }
      if (next[ideaId] === 0) delete next[ideaId]
      return next
    })
  }, [])

  const handleVoteSubmit = () => {
    const allocations = Object.entries(xp)
      .filter(([, points]) => points > 0)
      .map(([ideaId, points]) => ({ ideaId, points }))
    if (allocations.length === 0 || remaining !== 0) return
    onVote(cell.id, allocations)
  }

  const startEditing = () => {
    setXP(existingAllocation)
    setEditing(true)
  }

  const showStepper = (isActive && !hasVoted) || editing

  // === COMMENT STATE ===
  const [localComments, setLocalComments] = useState<CommentWithUpvote[]>([])
  const [upPollinatedComments, setUpPollinatedComments] = useState<CommentWithUpvote[]>([])
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [upvoting, setUpvoting] = useState<string | null>(null)
  const [openIdeaId, setOpenIdeaId] = useState<string | null>(null)
  const [showMobilePopup, setShowMobilePopup] = useState(false)
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [mutedUntil, setMutedUntil] = useState<number | null>(null)

  // Comments are read-only once the tier has moved on
  const tierFinalized = currentTier !== undefined && cell.tier < currentTier

  const allComments = [...localComments, ...upPollinatedComments]

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/cells/${cell.id}/comments`)
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
      setCommentsLoaded(true)
    }
  }

  useEffect(() => {
    fetchComments()
    if (cell.status !== 'COMPLETED' && !tierFinalized) {
      const interval = setInterval(fetchComments, 10000)
      return () => clearInterval(interval)
    }
  }, [cell.id, cell.status, tierFinalized])

  // Auto-select first idea so desktop comments column always shows content
  useEffect(() => {
    if (!openIdeaId && cell.ideas.length > 0) {
      setOpenIdeaId(cell.ideas[0].idea.id)
    }
  }, [cell.ideas.length])

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || !openIdeaId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/cells/${cell.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newComment, ideaId: openIdeaId }),
      })
      if (res.ok) {
        setNewComment('')
        fetchComments()
      } else {
        const data = await res.json()
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
      const res = await fetch(`/api/comments/${commentId}/upvote`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.upPollinated) {
          showToast(
            data.spreadCount >= 3 ? 'Comment spreading to all cells!' : 'Comment spreading to more cells!',
            'success'
          )
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

  // Comments for a specific idea
  const getIdeaComments = (ideaId: string) => {
    return allComments
      .filter(c => (c.linkedIdea?.id || c.ideaId) === ideaId)
      .sort((a, b) => {
        if (a.isUpPollinated && !b.isUpPollinated) return -1
        if (!a.isUpPollinated && b.isUpPollinated) return 1
        return (b.upvoteCount || 0) - (a.upvoteCount || 0)
      })
  }

  const getIdeaCommentCount = (ideaId: string) => {
    return allComments.filter(c => (c.linkedIdea?.id || c.ideaId) === ideaId).length
  }

  const openIdea = openIdeaId ? cell.ideas.find(ci => ci.idea.id === openIdeaId)?.idea : null

  // Shared comments UI for both popup and side column
  const commentsContent = openIdeaId && openIdea && (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-3 border-b border-border shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{openIdea.text}</p>
          <p className="text-xs text-muted mt-0.5">{getDisplayName(openIdea.author)}</p>
        </div>
        <button
          onClick={() => setShowMobilePopup(false)}
          className="lg:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface transition-colors text-muted hover:text-foreground"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!commentsLoaded ? (
          <p className="text-muted text-sm py-6 text-center">Loading...</p>
        ) : getIdeaComments(openIdeaId).length === 0 ? (
          <p className="text-muted text-sm py-6 text-center">No comments yet — be the first</p>
        ) : (
          getIdeaComments(openIdeaId).map(c => (
            <div
              key={c.id}
              className={`rounded p-2 text-sm flex justify-between items-start gap-2 ${
                c.isUpPollinated
                  ? 'bg-purple-bg border-l-2 border-purple'
                  : 'bg-surface'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-foreground text-sm leading-snug">{c.text}</p>
                <div className="flex items-center gap-2 mt-1 text-[10px] flex-wrap">
                  {c.isUpPollinated ? (
                    <span className="text-purple">From another cell</span>
                  ) : (
                    <>
                      <Link href={`/user/${c.user.id}`} className="text-accent font-medium hover:underline">{getDisplayName(c.user)}</Link>
                      <span className="text-muted">{timeAgo(c.createdAt)}</span>
                    </>
                  )}
                  {!c.isUpPollinated && (c.spreadCount || 0) > 0 && (
                    <span className="text-purple">
                      {(c.spreadCount || 0) >= 3 ? 'In all cells with this idea' : 'Spreading to other cells'}
                    </span>
                  )}
                  {(c.upvoteCount || 0) > 0 && !c.isUpPollinated && (
                    <span className="text-muted">{c.upvoteCount} upvote{(c.upvoteCount || 0) !== 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleUpvote(c.id)}
                disabled={upvoting === c.id || !!c.userHasUpvoted}
                className={`group relative shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  c.userHasUpvoted
                    ? 'bg-purple-bg text-purple'
                    : 'bg-surface hover:bg-purple-bg text-muted hover:text-purple'
                }`}
              >
                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-44 rounded bg-surface-hover px-2 py-1 text-[10px] text-foreground text-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg border border-border z-10">
                  {c.userHasUpvoted ? 'You upvoted this' : 'Upvote — enough upvotes spread this comment to other cells'}
                </span>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" />
                  <path d="M5 12l7-7 7 7" />
                </svg>
                <span className="font-mono">{c.upvoteCount || 0}</span>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Compose — hidden after tier finalizes */}
      {!tierFinalized && (
        <div className="p-3 border-t border-border shrink-0">
          <p className="text-[11px] text-muted mb-1.5">Upvoted comments spread to other cells</p>
          <form onSubmit={handleCommentSubmit} className="flex gap-2 min-w-0">
            <input
              type="text"
              placeholder="Comment on this idea..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              maxLength={2000}
              className="flex-1 min-w-0 bg-surface rounded border border-border px-3 py-1.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={submitting || !newComment.trim()}
              className="shrink-0 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
            >
              {submitting ? '...' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </>
  )

  // Voting card (shared between mobile and desktop)
  const votingCard = (
    <div className={`rounded-lg border overflow-hidden ${isActive ? 'border-warning bg-warning-bg' : isFinalizing ? 'border-accent bg-accent-light' : 'border-border'}`}>
      {/* Cell header */}
      <div className="flex justify-between items-center p-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">Tier {cell.tier}</span>
          {isActive && <span className="w-2 h-2 bg-warning rounded-full animate-pulse" />}
          {showStepper && remaining > 0 && <span className="text-xs text-warning opacity-70">{remaining} Vote Points</span>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {cell.status === 'VOTING' && cell.votingDeadline && !isFinalizing && (
            <CountdownTimer deadline={cell.votingDeadline} onExpire={onRefresh} compact />
          )}
          {isFinalizing && cell.finalizesAt && (
            <CountdownTimer deadline={cell.finalizesAt} onExpire={onRefresh} compact label="Finalizing" />
          )}
          <span className={`px-2 py-0.5 rounded text-xs ${
            cell.status === 'COMPLETED' ? 'bg-success-bg text-success' :
            isFinalizing ? 'bg-accent-light text-accent' :
            hasVoted && !editing ? 'bg-accent-light text-accent' :
            'bg-warning-bg text-warning'
          }`}>
            {isFinalizing ? 'Finalizing' : hasVoted && !editing && cell.status === 'VOTING' ? 'Voted' : cell.status}
          </span>
        </div>
      </div>

      {isFinalizing && !editing && (
        <p className="text-xs text-accent px-3 pb-2">All votes in — you can change your Vote Points before it finalizes.</p>
      )}

      {/* Ideas */}
      <div className="space-y-1.5 p-2">
        {cell.ideas.map(({ idea }) => {
          const isWinner = idea.status === 'ADVANCING' || idea.status === 'WINNER'
          const isEliminated = idea.status === 'ELIMINATED'
          const allocated = xp[idea.id] || 0
          const votedXP = existingAllocation[idea.id] || 0
          const commentCount = getIdeaCommentCount(idea.id)

          return (
            <div key={idea.id} className={`rounded text-sm transition-all overflow-hidden ${
              isWinner ? 'bg-success-bg border border-success' :
              isEliminated ? 'bg-surface text-muted border border-border' :
              allocated > 0 ? 'bg-accent-light border-2 border-accent' :
              votedXP > 0 && !editing ? 'bg-accent-light border border-accent' :
              'bg-background border border-border'
            }`}>
              {showStepper && !isEliminated && (
                <div className="px-2 pt-2 pb-1 flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={allocated}
                    onChange={e => setSlider(idea.id, parseInt(e.target.value) || 0)}
                    aria-label={`Vote points for: ${idea.text.slice(0, 50)}`}
                    className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-border [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-md"
                  />
                  <span className={`text-xs font-mono w-6 text-right font-bold ${allocated > 0 ? 'text-accent' : 'text-muted'}`}>{allocated}</span>
                </div>
              )}

              <div className="px-2 py-1.5">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`text-base font-medium ${isEliminated ? 'text-muted' : 'text-foreground'}`}>{idea.text}</p>
                    <p className="text-xs text-muted mt-0.5">{getDisplayName(idea.author)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-1 shrink-0">
                    {cell.status === 'COMPLETED' && (
                      <span className="text-muted text-xs font-mono">{idea.totalXP} VP</span>
                    )}
                    {hasVoted && !editing && cell.status === 'VOTING' && votedXP > 0 && (
                      <span className="text-accent text-xs font-mono">{votedXP} VP</span>
                    )}
                    {isWinner && <span className="text-success text-xs">&#8593;</span>}
                    <button
                      onClick={() => {
                        if (openIdeaId === idea.id) {
                          setShowMobilePopup(prev => !prev)
                        } else {
                          setOpenIdeaId(idea.id)
                          setShowMobilePopup(true)
                          fetchComments()
                        }
                      }}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                        openIdeaId === idea.id ? 'bg-purple-bg text-purple' : 'text-purple hover:bg-purple-bg'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      </svg>
                      {commentCount > 0 && <span className="font-mono">{commentCount}</span>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Submit / Change buttons */}
      {showStepper && (
        <div className="px-2 pb-2">
          <button
            onClick={handleVoteSubmit}
            disabled={remaining !== 0 || voting === cell.id}
            aria-label={editing ? 'Update your vote' : 'Submit your vote'}
            className="w-full py-2 rounded-lg bg-warning hover:bg-warning-hover text-black text-sm font-medium disabled:opacity-40 transition-colors"
          >
            {voting === cell.id ? 'Submitting...' : editing ? 'Update Vote' : remaining === 0 ? 'Submit Vote' : `Submit Vote (${remaining} Vote Points remaining)`}
          </button>
        </div>
      )}

      {canChangeVote && !editing && (
        <div className="px-2 pb-2">
          <button
            onClick={startEditing}
            className="w-full py-1.5 rounded-lg border border-accent text-accent text-sm font-medium hover:bg-accent-light transition-colors"
          >
            Change Vote
          </button>
        </div>
      )}
    </div>
  )

  return (
    <>
      <FirstVisitTooltip id="voting-cell">
        Drag sliders to distribute 10 Vote Points. Tap the chat icon to discuss ideas — upvoted comments spread to other cells. Submit when all points are allocated.
      </FirstVisitTooltip>

      {/* === DESKTOP: Side-by-side — voting card + comments column === */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-4">
        {votingCard}
        {openIdeaId && openIdea && (
          <div className="rounded-lg border border-border overflow-hidden flex flex-col">
            {commentsContent}
          </div>
        )}
      </div>

      {/* === MOBILE: Voting card + popup === */}
      <div className="lg:hidden">
        {votingCard}
      </div>

      {/* === MOBILE POPUP — full screen === */}
      {showMobilePopup && openIdeaId && openIdea && (
        <div className="lg:hidden fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
          {commentsContent}
        </div>
      )}

    </>
  )
}
