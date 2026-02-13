'use client'

import { getDisplayName } from '@/lib/user'
import CopyButton from './CopyButton'
import FlaggedBadge from '@/components/FlaggedBadge'
import type { Idea } from './types'

export default function IdeaCard({
  idea,
  meta,
  rank,
  action,
  variant = 'default',
}: {
  idea: Idea
  meta?: string
  rank?: number
  action?: React.ReactNode
  variant?: 'default' | 'defender'
}) {
  const borderColor = variant === 'defender' ? 'border-orange' : 'border-border'
  const bgColor = variant === 'defender' ? 'bg-orange-bg' : 'bg-surface'

  return (
    <div className={`${bgColor} border ${borderColor} rounded-[10px] overflow-hidden`}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          {rank != null && <span className="text-xs font-mono text-muted">#{rank}</span>}
          <span className="text-xs text-muted">{getDisplayName(idea.author)}</span>
          <FlaggedBadge text={idea.text} />
        </div>
        <div className="flex items-center gap-2">
          {meta && <span className="text-xs text-muted">{meta}</span>}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>
      <div className="p-3">
        <p className="text-foreground text-sm leading-snug select-text">{idea.text}</p>
        <div className="flex justify-end mt-1.5">
          <CopyButton text={idea.text} />
        </div>
      </div>
    </div>
  )
}
