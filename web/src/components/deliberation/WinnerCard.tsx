'use client'

import { getDisplayName } from '@/lib/user'
import type { Idea } from './types'

export default function WinnerCard({
  winner,
  voteStats,
}: {
  winner: Idea
  voteStats?: string
}) {
  return (
    <div className="bg-gradient-to-r from-success-bg to-success-bg/60 border-2 border-success rounded-[10px] p-4">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        <span className="text-xs font-bold text-success uppercase tracking-wider">Current Priority</span>
      </div>
      <p className="text-foreground font-medium text-base leading-snug mb-2">
        {winner.text}
      </p>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-success">{getDisplayName(winner.author)}</span>
        {voteStats && (
          <>
            <span className="text-muted">·</span>
            <span className="text-muted">{voteStats}</span>
          </>
        )}
      </div>
    </div>
  )
}
