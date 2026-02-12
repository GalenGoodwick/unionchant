'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

type FeedItem = {
  id: string
  kind: 'vote_now' | 'deliberate' | 'submit' | 'champion' | 'completed' | 'waiting' | 'join'
  question: string
  phase: string
  phaseLabel: string
  tier: number
  creatorName: string | null
  memberCount: number
  ideaCount: number
  isPublic: boolean
  isMember: boolean
  hasVoted: boolean
  cellId: string | null
  cellStatus: string | null
  champion: { text: string; authorName: string } | null
  votingDeadline: string | null
  submissionDeadline: string | null
  completedAt: string | null
  createdAt: string
}

const kindConfig: Record<string, { label: string; color: string; bgColor: string; action: string }> = {
  vote_now: { label: 'Vote Now', color: 'text-warning', bgColor: 'bg-warning-bg border-warning', action: 'Cast your vote' },
  deliberate: { label: 'Discuss', color: 'text-blue', bgColor: 'bg-blue/10 border-blue', action: 'Join the discussion' },
  submit: { label: 'Submit Ideas', color: 'text-accent', bgColor: 'bg-accent-light border-accent', action: 'Submit your idea' },
  champion: { label: 'Accepting Ideas', color: 'text-purple', bgColor: 'bg-purple-bg border-purple', action: 'Submit a challenger' },
  join: { label: 'Open', color: 'text-accent', bgColor: 'bg-accent-light border-accent', action: 'Join this chant' },
  waiting: { label: 'Waiting', color: 'text-muted', bgColor: 'bg-surface border-border', action: 'Waiting for results' },
  completed: { label: 'Completed', color: 'text-success', bgColor: 'bg-success-bg border-success', action: 'View results' },
}

export default function CommunityFeedPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const [items, setItems] = useState<FeedItem[]>([])
  const [communityName, setCommunityName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }
    if (authStatus === 'authenticated') {
      fetch(`/api/communities/${slug}/feed`)
        .then(r => {
          if (!r.ok) throw new Error('Failed to load feed')
          return r.json()
        })
        .then(data => {
          setCommunityName(data.community?.name || slug)
          setItems(data.items || [])
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [authStatus, slug, router])

  const actionable = items.filter(i => ['vote_now', 'deliberate', 'submit', 'champion', 'join'].includes(i.kind))
  const waiting = items.filter(i => i.kind === 'waiting')
  const completed = items.filter(i => i.kind === 'completed')

  return (
    <FrameLayout
      active="groups" showBack
      header={
        <div className="flex items-center justify-between py-3">
          <div>
            <h1 className="text-sm font-bold text-foreground">{communityName} Feed</h1>
            <p className="text-[10px] text-muted mt-0.5">{items.length} chant{items.length !== 1 ? 's' : ''}</p>
          </div>
          <Link
            href={`/chants/new`}
            className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg font-medium text-xs transition-colors"
          >
            + New Chant
          </Link>
        </div>
      }
    >
      {loading && (
        <div className="space-y-2 pt-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3">
              <div className="h-3 bg-background rounded w-2/3 mb-2" />
              <div className="h-2.5 bg-background rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-error-bg text-error p-3 rounded-lg text-xs mt-2">{error}</div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-12 bg-surface/90 backdrop-blur-sm border border-border rounded-lg mt-2">
          <p className="text-muted text-xs mb-3">No chants in this group yet.</p>
          <Link
            href="/chants/new"
            className="text-accent hover:text-accent-hover font-medium text-xs"
          >
            Create the first chant
          </Link>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-4 pt-2">
          {/* Actionable */}
          {actionable.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Your Turn</h2>
              <div className="space-y-1.5">
                {actionable.map(item => (
                  <FeedCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* Waiting */}
          {waiting.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">In Progress</h2>
              <div className="space-y-1.5">
                {waiting.map(item => (
                  <FeedCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Results</h2>
              <div className="space-y-1.5">
                {completed.map(item => (
                  <FeedCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </FrameLayout>
  )
}

function FeedCard({ item }: { item: FeedItem }) {
  const config = kindConfig[item.kind] || kindConfig.join

  return (
    <Link
      href={`/chants/${item.id}`}
      className={`block rounded-lg border p-3 transition-colors hover:border-accent ${config.bgColor}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[10px] font-semibold ${config.color}`}>{config.label}</span>
            {!item.isPublic && (
              <span className="text-[10px] text-muted bg-surface px-1 py-0.5 rounded">Private</span>
            )}
          </div>
          <h3 className="text-foreground font-medium text-xs leading-snug">{item.question}</h3>
          {item.champion && item.kind === 'completed' && (
            <p className="text-[10px] text-success mt-0.5 truncate">
              Priority: {item.champion.text}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-muted">{item.memberCount} members</div>
          <div className="text-[10px] text-muted">{item.ideaCount} ideas</div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-muted">{config.action}</span>
        {item.tier > 0 && item.kind !== 'completed' && (
          <span className="text-[10px] text-muted">Tier {item.tier}</span>
        )}
      </div>
    </Link>
  )
}
