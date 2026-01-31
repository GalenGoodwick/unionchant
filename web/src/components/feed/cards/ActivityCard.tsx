'use client'

import Link from 'next/link'
import { relativeTime } from '@/lib/time'
import type { ActivityItem } from '@/types/feed'

export default function ActivityCard({ item }: { item: ActivityItem }) {
  if (item.type === 'platform_stats' && item.stats) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Platform Pulse</div>
        <div className="grid grid-cols-2 gap-3">
          <StatBox label="Active Voters" value={item.stats.activeVoters} />
          <StatBox label="In Progress" value={item.stats.inProgressDelibs} />
          <StatBox label="Ideas Today" value={item.stats.ideasToday} />
          <StatBox label="Votes Today" value={item.stats.votesToday} />
        </div>
      </div>
    )
  }

  const delibLink = item.deliberation ? `/deliberations/${item.deliberation.id}` : '#'
  const community = item.deliberation?.community

  return (
    <div className={`border rounded-xl p-4 ${accentStyles[item.type] || 'border-border bg-background'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${iconStyles[item.type] || 'bg-surface text-muted'}`}>
          {icons[item.type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-foreground">
            {item.type === 'voting_active' && (
              <>
                <span className="font-mono font-semibold text-warning">{item.voterCount}</span>
                {' '}people voting in Tier {item.tier} of{' '}
                <Link href={delibLink} className="font-medium text-accent hover:underline">
                  {truncate(item.deliberation?.question || '', 60)}
                </Link>
              </>
            )}
            {item.type === 'challenge_started' && (
              <>
                Challenge round {item.challengeRound} started in{' '}
                <Link href={delibLink} className="font-medium text-accent hover:underline">
                  {truncate(item.deliberation?.question || '', 60)}
                </Link>
              </>
            )}
            {item.type === 'new_deliberation' && (
              <>
                New:{' '}
                <Link href={delibLink} className="font-medium text-accent hover:underline">
                  {truncate(item.deliberation?.question || '', 80)}
                </Link>
              </>
            )}
            {item.type === 'tier_completed' && (
              <>
                Tier {item.completedTier} completed in{' '}
                <Link href={delibLink} className="font-medium text-accent hover:underline">
                  {truncate(item.deliberation?.question || '', 60)}
                </Link>
                {item.advancingCount != null && item.advancingCount > 0 && (
                  <span className="text-success"> — {item.advancingCount} idea{item.advancingCount !== 1 ? 's' : ''} advancing</span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {community && (
              <Link href={`/communities/${community.slug}`} className="text-xs text-muted hover:text-foreground">
                {community.name}
              </Link>
            )}
            <span className="text-xs text-muted-light">{relativeTime(item.timestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center p-2 rounded-lg bg-background">
      <div className="text-lg font-mono font-bold text-foreground">{value.toLocaleString()}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + '...' : text
}

const icons: Record<string, string> = {
  voting_active: '🗳️',
  challenge_started: '⚔️',
  new_deliberation: '✨',
  tier_completed: '✅',
}

const iconStyles: Record<string, string> = {
  voting_active: 'bg-warning-bg text-warning',
  challenge_started: 'bg-orange-bg text-orange',
  new_deliberation: 'bg-accent-light text-accent',
  tier_completed: 'bg-success-bg text-success',
}

const accentStyles: Record<string, string> = {
  voting_active: 'border-warning-border/30 bg-background',
  challenge_started: 'border-orange/30 bg-background',
  new_deliberation: 'border-accent/20 bg-background',
  tier_completed: 'border-success-border/30 bg-background',
}
