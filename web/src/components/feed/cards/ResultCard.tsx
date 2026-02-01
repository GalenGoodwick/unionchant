'use client'

import Link from 'next/link'
import { relativeTime } from '@/lib/time'
import type { ResultItem } from '@/types/feed'

export default function ResultCard({ item, compact = false }: { item: ResultItem; compact?: boolean }) {
  const delibLink = `/deliberations/${item.deliberation.id}`
  const community = item.deliberation.community

  if (item.type === 'champion_crowned') {
    return (
      <Link href={delibLink} className="block">
        <div className={`border rounded-xl transition-colors hover:border-success-border ${compact ? 'p-3' : 'p-4'} ${item.isPersonal ? 'border-accent bg-accent-light/30' : 'border-border bg-surface'}`}>
          <div className="flex items-start gap-3">
            <div className={`${compact ? 'w-7 h-7 text-sm' : 'w-8 h-8 text-sm'} rounded-full flex items-center justify-center flex-shrink-0 bg-success-bg`}>
              👑
            </div>
            <div className="flex-1 min-w-0">
              <div className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-foreground truncate`}>
                {item.champion?.text || 'Champion'}
              </div>
              <div className={`${compact ? 'text-xs' : 'text-xs'} text-muted mt-0.5`}>
                by {item.champion?.author}
                {item.champion?.totalVotes != null && (
                  <span className="font-mono"> · {item.champion.totalVotes} votes</span>
                )}
              </div>
              <div className={`${compact ? 'text-xs' : 'text-xs'} text-subtle mt-1 truncate`}>
                {item.deliberation.question}
              </div>
              {!compact && (
                <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-light">
                  {community && <span>{community.name}</span>}
                  <span>{relativeTime(item.timestamp)}</span>
                  {item.totalParticipants != null && <span>{item.totalParticipants} participants</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    )
  }

  if (item.type === 'idea_advanced' && item.idea) {
    return (
      <Link href={delibLink} className="block">
        <div className={`border rounded-xl transition-colors hover:border-accent ${compact ? 'p-3' : 'p-4'} border-accent/40 bg-accent-light/20`}>
          <div className="flex items-start gap-3">
            <div className={`${compact ? 'w-7 h-7 text-sm' : 'w-8 h-8 text-sm'} rounded-full flex items-center justify-center flex-shrink-0 bg-accent-light text-accent`}>
              🚀
            </div>
            <div className="flex-1 min-w-0">
              <div className={`${compact ? 'text-xs' : 'text-sm'} text-foreground`}>
                Your idea → <span className="font-mono font-semibold text-accent">Tier {item.idea.tier}</span>
              </div>
              <div className={`${compact ? 'text-xs' : 'text-xs'} text-muted mt-0.5 truncate`}>
                &ldquo;{item.idea.text}&rdquo;
              </div>
              <div className={`${compact ? 'text-xs' : 'text-xs'} text-subtle mt-1 truncate`}>
                {item.deliberation.question}
              </div>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  if (item.type === 'deliberation_completed') {
    return (
      <Link href={delibLink} className="block">
        <div className={`border rounded-xl transition-colors hover:border-border-strong ${compact ? 'p-3' : 'p-4'} border-border bg-surface`}>
          <div className="flex items-start gap-3">
            <div className={`${compact ? 'w-7 h-7 text-sm' : 'w-8 h-8 text-sm'} rounded-full flex items-center justify-center flex-shrink-0 bg-surface-alt text-muted`}>
              📊
            </div>
            <div className="flex-1 min-w-0">
              <div className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-foreground truncate`}>
                {item.deliberation.question}
              </div>
              <div className={`${compact ? 'text-xs' : 'text-xs'} text-muted mt-0.5`}>
                Completed
                {!compact && item.totalParticipants != null && <span> · {item.totalParticipants} participants</span>}
                {!compact && item.totalIdeas != null && <span> · {item.totalIdeas} ideas</span>}
              </div>
              {!compact && (
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-light">
                  {community && <span>{community.name}</span>}
                  <span>{relativeTime(item.timestamp)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    )
  }

  if (item.type === 'prediction_correct' && item.prediction) {
    return (
      <Link href={delibLink} className="block">
        <div className={`border rounded-xl transition-colors hover:border-success-border ${compact ? 'p-3' : 'p-4'} border-border bg-success-bg/30`}>
          <div className="flex items-start gap-3">
            <div className={`${compact ? 'w-7 h-7 text-sm' : 'w-8 h-8 text-sm'} rounded-full flex items-center justify-center flex-shrink-0 bg-success-bg`}>
              🎯
            </div>
            <div className="flex-1 min-w-0">
              <div className={`${compact ? 'text-xs' : 'text-sm'} text-foreground`}>
                Correct at <span className="font-mono font-semibold text-success">Tier {item.prediction.tier}</span>
              </div>
              <div className={`${compact ? 'text-xs' : 'text-xs'} text-muted mt-0.5 truncate`}>
                &ldquo;{item.prediction.ideaText}&rdquo;
              </div>
              <div className={`${compact ? 'text-xs' : 'text-xs'} text-subtle mt-1 truncate`}>
                {item.deliberation.question}
              </div>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  return null
}
