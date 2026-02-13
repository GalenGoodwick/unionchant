'use client'

import { getDisplayName } from '@/lib/user'
import CopyButton from './CopyButton'
import type { Idea } from './types'

export default function WinnerCard({
  winner,
  voteStats,
}: {
  winner: Idea
  voteStats?: string
}) {
  return (
    <div className="bg-gradient-to-r from-success-bg to-success-bg/60 border-2 border-success rounded-[10px] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-success/30">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span className="text-xs font-bold text-success uppercase tracking-wider">Priority</span>
          <span className="text-xs text-success">{getDisplayName(winner.author)}</span>
        </div>
        {voteStats && <span className="text-xs text-success/70">{voteStats}</span>}
      </div>
      <div className="p-3">
        <p className="text-foreground font-medium text-base leading-snug select-text">{winner.text}</p>
        <div className="flex justify-end mt-1.5">
          <CopyButton text={winner.text} />
        </div>
      </div>
    </div>
  )
}
