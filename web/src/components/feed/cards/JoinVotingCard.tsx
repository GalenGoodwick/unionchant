'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { FeedItem } from '@/types/feed'
import ShareMenu from '@/components/ShareMenu'

type Props = {
  item: FeedItem
  onAction: () => void
  onExplore: () => void
}

export default function JoinVotingCard({ item, onAction, onExplore }: Props) {
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
    <div className="bg-surface border border-accent rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex justify-between items-center">
        <span className="text-accent font-bold text-sm uppercase tracking-wide">
          Voting in Progress
        </span>
        <span className="text-sm text-muted font-mono">
          Tier {tierInfo?.tier || 1} • {tierInfo?.totalCells || 0} cells
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        <Link
          href={`/deliberations/${item.deliberation.id}`}
          className="block text-lg font-semibold text-foreground hover:text-accent transition-colors"
        >
          "{item.deliberation.question}"
        </Link>
        {item.deliberation.description && (
          <p className="text-muted text-sm mt-1 line-clamp-2">{item.deliberation.description}</p>
        )}
        {(item.deliberation.organization || item.community) && (
          <p className="text-muted-light text-xs mt-1">
            {item.deliberation.organization}
            {item.deliberation.organization && item.community && ' · '}
            {item.community && <Link href={`/communities/${item.community.slug}`} className="text-accent hover:text-accent-hover">{item.community.name}</Link>}
          </p>
        )}
        {item.deliberation.creator && (
          <p className="text-muted text-xs mt-1">
            Created by <Link href={`/user/${item.deliberation.creator.id}`} className="text-accent hover:text-accent-hover">{item.deliberation.creator.name}</Link>
          </p>
        )}
        <div className="mb-4" />

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
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex justify-between items-center text-sm">
        <div className="flex items-center gap-3 text-muted">
          <span>{item.deliberation._count.members} participants</span>
          {item.deliberation.views > 0 && (
            <span className="flex items-center gap-1">
              <span>👁</span> {item.deliberation.views}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <ShareMenu
            url={`/deliberations/${item.deliberation.id}`}
            text={item.deliberation.question}
            variant="icon"
          />
          <Link
            href={`/deliberations/${item.deliberation.id}`}
            className="text-accent hover:text-accent-hover transition-colors"
          >
            Full page →
          </Link>
        </div>
      </div>
    </div>
  )
}
