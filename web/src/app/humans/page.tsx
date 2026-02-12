'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

type Human = {
  id: string
  name: string | null
  image: string | null
  createdAt: string
  championPicks: number
  currentStreak: number
  bestStreak: number
  deliberations: number
  ideas: number
  votes: number
  comments: number
  totalUpvotes: number
  ideaViability: number
  votingAccuracy: number
  commentStrength: number
  foresightApprox: number
}

type SortKey = 'foresight' | 'ideas' | 'comments' | 'newest'

export default function HumansPage() {
  const [humans, setHumans] = useState<Human[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortKey>('foresight')

  useEffect(() => {
    setLoading(true)
    const apiSort = sort === 'foresight' ? 'votes' : sort
    fetch(`/api/humans?sort=${apiSort}`)
      .then(r => r.json())
      .then(data => {
        let list = Array.isArray(data) ? data : []
        if (sort === 'ideas') {
          list = [...list].sort((a, b) => b.ideaViability - a.ideaViability || b.ideas - a.ideas)
        } else if (sort === 'comments') {
          list = [...list].sort((a, b) => b.commentStrength - a.commentStrength || b.totalUpvotes - a.totalUpvotes)
        }
        setHumans(list)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [sort])

  return (
    <FrameLayout
      showBack
      header="Humans"
    >
      <div className="py-2">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-foreground">Human Leaderboard</h1>
          <p className="text-xs text-muted mt-0.5">
            Reputation earned through deliberation. Scores are computed, not self-reported.
          </p>
        </div>

        {/* Sort tabs */}
        <div className="flex gap-1 mb-4">
          {([
            ['foresight', 'Foresight'],
            ['ideas', 'Ideas'],
            ['comments', 'Comments'],
            ['newest', 'Newest'],
          ] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                sort === key
                  ? 'bg-accent/15 text-accent font-semibold'
                  : 'text-muted hover:text-foreground hover:bg-surface/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="text-muted animate-pulse text-sm">Loading...</div>
          </div>
        ) : humans.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted text-sm">No participants yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {humans.map((human, i) => (
              <HumanCard key={human.id} human={human} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </FrameLayout>
  )
}

function HumanCard({ human, rank }: { human: Human; rank: number }) {
  const score = human.foresightApprox
  const scoreColor = score >= 0.6 ? 'text-success' : score >= 0.3 ? 'text-warning' : score > 0 ? 'text-error' : 'text-muted'

  const daysSince = Math.floor((Date.now() - new Date(human.createdAt).getTime()) / 86400000)
  const timeLabel = daysSince === 0 ? 'today' : daysSince === 1 ? '1d ago' : `${daysSince}d ago`

  return (
    <Link
      href={`/user/${human.id}`}
      className="block bg-surface/90 border border-border rounded-xl p-3 hover:bg-surface-hover transition-colors"
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">
              <span className="text-[10px] font-mono text-muted mr-1">#{rank}</span>
              {human.name || 'Anonymous'}
            </span>
            {human.championPicks > 0 && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-success/10 text-success shrink-0">
                {human.championPicks} win{human.championPicks !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex gap-3 text-[10px] text-muted mt-0.5">
            <span>{human.deliberations} delib{human.deliberations !== 1 ? 's' : ''}</span>
            <span>{human.ideas} idea{human.ideas !== 1 ? 's' : ''}</span>
            <span>{human.votes} vote{human.votes !== 1 ? 's' : ''}</span>
            <span className="ml-auto">{timeLabel}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-2xl font-mono font-bold tabular-nums ${scoreColor}`}>
            {score.toFixed(2)}
          </span>
          <p className="text-[8px] text-muted uppercase tracking-wider">Foresight</p>
        </div>
      </div>

      <div className="flex gap-2">
        <MiniBar label="Idea" value={human.ideaViability} />
        <MiniBar label="Voting" value={human.votingAccuracy} />
        <MiniBar label="Comment" value={human.commentStrength} />
      </div>
    </Link>
  )
}

function MiniBar({ label, value }: { label: string; value: number }) {
  const color = value >= 0.6 ? 'bg-success' : value >= 0.3 ? 'bg-warning' : value > 0 ? 'bg-error' : 'bg-border'
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] text-muted">{label}</span>
        <span className="text-[9px] font-mono text-muted">{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 bg-background rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(value * 100, 2)}%` }} />
      </div>
    </div>
  )
}
