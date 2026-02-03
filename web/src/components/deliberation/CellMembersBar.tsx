'use client'

import type { Participant, Vote } from './types'

export default function CellMembersBar({
  participants,
  votes,
  currentUserId,
}: {
  participants: Participant[]
  votes: Vote[]
  currentUserId?: string
}) {
  const votedUserIds = new Set(votes.map(v => {
    // votes don't include userId directly, but participants who voted can be inferred
    // For now, use vote count as indicator
    return v.id
  }))

  const votedCount = votes.length
  const totalCount = participants.length

  return (
    <div className="flex items-center gap-3">
      {/* Stacked avatars */}
      <div className="flex -space-x-2">
        {participants.slice(0, 5).map((p) => {
          const hasVoted = votedCount > 0 // We show general status since votes are anonymous
          const isYou = p.userId === currentUserId

          return (
            <div
              key={p.userId}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                isYou
                  ? 'ring-2 ring-accent bg-accent/30 text-accent z-10'
                  : 'bg-surface-hover text-muted'
              } ${
                hasVoted ? 'border-2 border-success' : 'border-2 border-border'
              }`}
              title={isYou ? 'You' : p.user.name || 'Member'}
            >
              {p.user.image ? (
                <img
                  src={p.user.image}
                  alt=""
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                (p.user.name || 'U').charAt(0).toUpperCase()
              )}
            </div>
          )
        })}
      </div>

      {/* Status text */}
      <div className="text-sm">
        <span className="text-muted">Your cell</span>
        <span className="text-muted"> · </span>
        <span className="text-foreground font-mono font-medium">
          {votedCount}/{totalCount}
        </span>
        <span className="text-muted"> voted</span>
      </div>
    </div>
  )
}
