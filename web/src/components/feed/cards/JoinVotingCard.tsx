'use client'

import { useState, useRef } from 'react'
import type { FeedItem } from '@/types/feed'
import { useToast } from '@/components/Toast'
import CardShell from './CardShell'

type CellData = {
  id: string
  tier: number
  ideas: { id: string; text: string; author: string }[]
}

type Props = {
  item: FeedItem
  onAction: () => void
  onExplore: () => void
  onDismiss?: () => void
}

export default function JoinVotingCard({ item, onAction, onExplore, onDismiss }: Props) {
  const { showToast } = useToast()
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Post-join state
  const [cellData, setCellData] = useState<CellData | null>(null)
  const [voting, setVoting] = useState<string | null>(null)
  const [voted, setVoted] = useState(false)
  const [votedIdeaId, setVotedIdeaId] = useState<string | null>(null)

  // Comment state
  const [comment, setComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [commentSent, setCommentSent] = useState(false)
  const commentRef = useRef<HTMLInputElement>(null)

  const tierInfo = item.tierInfo

  const handleJoin = async () => {
    setJoining(true)
    setError(null)
    try {
      const res = await fetch(`/api/deliberations/${item.deliberation.id}/enter`, {
        method: 'POST',
      })
      const data = await res.json()

      if (res.ok) {
        setCellData(data.cell)
        onAction()
      } else {
        setError(data.error || 'Failed to join')
      }
    } catch (err) {
      console.error('Join error:', err)
      setError('Failed to join')
    } finally {
      setJoining(false)
    }
  }

  const handleVote = async (ideaId: string) => {
    if (!cellData) return
    setVoting(ideaId)
    try {
      const res = await fetch(`/api/cells/${cellData.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId }),
      })

      if (res.ok) {
        setVoted(true)
        setVotedIdeaId(ideaId)
        onAction()
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to vote', 'error')
      }
    } catch (err) {
      console.error('Vote error:', err)
      showToast('Failed to vote', 'error')
    } finally {
      setVoting(null)
    }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cellData || !comment.trim()) return
    setSubmittingComment(true)
    try {
      const res = await fetch(`/api/cells/${cellData.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: comment.trim() }),
      })
      if (res.ok) {
        setComment('')
        setCommentSent(true)
        showToast('Comment posted', 'success')
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to post comment', 'error')
      }
    } catch {
      showToast('Failed to post comment', 'error')
    } finally {
      setSubmittingComment(false)
    }
  }

  // After joining — show vote UI with ideas and comment input
  if (cellData) {
    const headerLabel = voted ? 'Waiting for others' : 'Vote Now'
    const headerLabelColor = voted ? 'text-muted' : 'text-warning'
    const borderColor = voted ? 'border-success' : 'border-warning'

    return (
      <CardShell
        item={item}
        borderColor={borderColor}
        headerLabel={headerLabel}
        headerLabelColor={headerLabelColor}
        headerRight={<>Tier {cellData.tier}</>}
        onExplore={onExplore}
      >
        {/* Ideas with vote buttons */}
        <div className="space-y-2">
          {cellData.ideas.map((idea) => {
            const isCurrentVote = votedIdeaId === idea.id
            const canChange = voted && !isCurrentVote

            return (
              <div
                key={idea.id}
                className={`p-3 rounded-lg flex justify-between items-center transition-all ${
                  isCurrentVote
                    ? 'bg-success-bg border border-success'
                    : 'bg-background border border-border hover:border-warning'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-foreground truncate">{idea.text}</p>
                  <p className="text-xs text-muted">by {idea.author}</p>
                </div>

                {!voted ? (
                  <button
                    onClick={() => handleVote(idea.id)}
                    disabled={voting !== null}
                    className="bg-warning hover:bg-warning-hover text-black px-4 py-1.5 rounded text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {voting === idea.id ? '...' : 'Vote'}
                  </button>
                ) : isCurrentVote ? (
                  <span className="text-success text-sm font-medium">Your Vote</span>
                ) : canChange ? (
                  <button
                    onClick={() => handleVote(idea.id)}
                    disabled={voting !== null}
                    className="text-muted hover:text-warning text-sm transition-colors disabled:opacity-50"
                  >
                    {voting === idea.id ? '...' : 'Change'}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Waiting indicator */}
        {voted && (
          <div className="mt-3 text-center text-muted text-sm">
            <span className="animate-pulse">Waiting for others to vote...</span>
            <p className="text-xs mt-1">You can change your vote until voting ends</p>
          </div>
        )}

        {/* Comment input */}
        <form onSubmit={handleComment} className="mt-4 flex gap-2">
          <input
            ref={commentRef}
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={commentSent ? 'Add another comment...' : 'Share your reasoning...'}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-foreground placeholder-muted focus:outline-none focus:border-accent text-sm"
          />
          <button
            type="submit"
            disabled={submittingComment || !comment.trim()}
            className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {submittingComment ? '...' : 'Post'}
          </button>
        </form>
      </CardShell>
    )
  }

  // Pre-join — show discovery UI with join button
  return (
    <CardShell
      item={item}
      headerLabel="Voting in Progress"
      headerRight={<>Tier {tierInfo?.tier || 1} • {tierInfo?.totalCells || 0} cells</>}
      onExplore={onExplore}
      onDismiss={onDismiss}
      statsLeft={<span>{item.deliberation._count.members} participants</span>}
    >
      {/* Ideas preview */}
      {tierInfo?.ideas && tierInfo.ideas.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-muted uppercase tracking-wide mb-2">
            Ideas competing ({tierInfo.ideas.length})
          </div>
          <div className="space-y-1">
            {tierInfo.ideas.slice(0, 3).map((idea) => (
              <div
                key={idea.id}
                className="p-2 bg-background border border-border rounded text-sm text-foreground truncate"
              >
                {idea.text}
              </div>
            ))}
            {tierInfo.ideas.length > 3 && (
              <div className="text-muted text-xs text-center py-1">
                +{tierInfo.ideas.length - 3} more ideas
              </div>
            )}
          </div>
        </div>
      )}

      {/* Voting progress */}
      {tierInfo && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted mb-1">
            <span>Voting progress</span>
            <span>{tierInfo.votingProgress}%</span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${tierInfo.votingProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-3 p-2 bg-error-bg border border-error text-error text-sm rounded">
          {error}
        </div>
      )}

      {/* Join button */}
      <button
        onClick={handleJoin}
        disabled={joining}
        className="w-full bg-accent hover:bg-accent-hover text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
      >
        {joining ? 'Joining...' : 'Join & Vote'}
      </button>
    </CardShell>
  )
}
