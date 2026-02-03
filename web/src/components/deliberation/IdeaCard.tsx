'use client'

import { getDisplayName } from '@/lib/user'
import type { Idea } from './types'

export default function IdeaCard({
  idea,
  meta,
  action,
  variant = 'default',
}: {
  idea: Idea
  meta?: string
  action?: React.ReactNode
  variant?: 'default' | 'defender'
}) {
  const borderColor = variant === 'defender' ? 'border-orange' : 'border-border'
  const bgColor = variant === 'defender' ? 'bg-orange-bg' : 'bg-surface'

  return (
    <div className={`${bgColor} border ${borderColor} rounded-[10px] p-3 flex justify-between items-center gap-3`}>
      <div className="flex-1 min-w-0">
        <p className="text-foreground text-sm leading-snug">{idea.text}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted">
            by {getDisplayName(idea.author)}
          </span>
          {meta && (
            <>
              <span className="text-xs text-muted">·</span>
              <span className="text-xs text-muted">{meta}</span>
            </>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
