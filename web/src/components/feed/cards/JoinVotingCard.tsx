'use client'

import { useState } from 'react'
import type { FeedItem } from '@/types/feed'
import CardShell from './CardShell'

type Props = {
  item: FeedItem
  onAction: () => void
  onExplore: () => void
  onDismiss?: () => void
}

export default function JoinVotingCard({ item, onAction, onExplore, onDismiss }: Props) {
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tierInfo = item.tierInfo

  const handleJoin = async () => {
    setJoining(true)
    setError(null)
    try {
      const res = await fetch(`/api/deliberations/${item.deliberation.id}/enter`, {
        method: 'POST',
      })

      if (res.ok) {
        onAction() // Refresh feed to get vote_now card
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to join')
      }
    } catch (err) {
      console.error('Join error:', err)
      setError('Failed to join')
    } finally {
      setJoining(false)
    }
  }

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
