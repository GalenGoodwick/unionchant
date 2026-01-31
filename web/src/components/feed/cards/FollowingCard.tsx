'use client'

import Link from 'next/link'
import { relativeTime } from '@/lib/time'
import type { FollowingItem } from '@/types/feed'

export default function FollowingCard({ item }: { item: FollowingItem }) {
  const delibLink = `/deliberations/${item.deliberation.id}`
  const userLink = `/user/${item.user.id}`
  const community = item.deliberation.community

  return (
    <div className={`border rounded-xl p-4 ${accentStyles[item.type] || 'border-border bg-background'}`}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <Link href={userLink} className="flex-shrink-0">
          {item.user.image ? (
            <img
              src={item.user.image}
              alt={item.user.name}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-accent-light text-accent flex items-center justify-center text-sm font-medium">
              {item.user.name.charAt(0).toUpperCase()}
            </div>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <div className="text-sm text-foreground">
            {item.type === 'idea_submitted' && (
              <>
                <Link href={userLink} className="font-medium hover:underline">{item.user.name}</Link>
                {' '}submitted an idea in{' '}
                <Link href={delibLink} className="text-accent hover:underline">
                  {truncate(item.deliberation.question, 50)}
                </Link>
              </>
            )}
            {item.type === 'idea_won' && (
              <>
                <Link href={userLink} className="font-medium hover:underline">{item.user.name}</Link>
                &apos;s idea won in{' '}
                <Link href={delibLink} className="text-accent hover:underline">
                  {truncate(item.deliberation.question, 50)}
                </Link>
              </>
            )}
            {item.type === 'deliberation_created' && (
              <>
                <Link href={userLink} className="font-medium hover:underline">{item.user.name}</Link>
                {' '}created{' '}
                <Link href={delibLink} className="text-accent hover:underline">
                  {truncate(item.deliberation.question, 50)}
                </Link>
              </>
            )}
            {item.type === 'joined_deliberation' && (
              <>
                <Link href={userLink} className="font-medium hover:underline">{item.user.name}</Link>
                {' '}joined{' '}
                <Link href={delibLink} className="text-accent hover:underline">
                  {truncate(item.deliberation.question, 50)}
                </Link>
              </>
            )}
          </div>

          {/* Show idea text for submission/win */}
          {item.idea && (
            <div className="text-xs text-muted mt-1 truncate">
              &ldquo;{truncate(item.idea.text, 60)}&rdquo;
            </div>
          )}

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

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + '...' : text
}

const accentStyles: Record<string, string> = {
  idea_submitted: 'border-border bg-background',
  idea_won: 'border-success-border/30 bg-success-bg/20',
  deliberation_created: 'border-accent/20 bg-background',
  joined_deliberation: 'border-border bg-background',
}
