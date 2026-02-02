'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import { useGuideContext } from '@/app/providers'
import UserGuide from '@/components/UserGuide'
import type { FeedEntry } from '@/app/api/feed2/route'

export default function Feed2Page() {
  const { data: session, status } = useSession()
  const { showGuide, closeGuide } = useGuideContext()
  const [items, setItems] = useState<FeedEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/feed2')
      if (res.ok) {
        const data = await res.json()
        setItems(data.items)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFeed()
    const interval = setInterval(fetchFeed, 15_000)
    return () => clearInterval(interval)
  }, [fetchFeed])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {showGuide && <UserGuide onClose={closeGuide} />}

      <main className="max-w-xl mx-auto px-4 py-6">
        {/* Page heading */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Feed</h1>
          <div className="flex gap-2">
            <Link
              href="/deliberations/new"
              className="text-sm bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors font-medium"
            >
              + New
            </Link>
            <Link
              href="/podiums"
              className="text-sm bg-surface border border-border text-muted px-3 py-1.5 rounded-lg hover:bg-surface-hover transition-colors font-medium"
            >
              Podiums
            </Link>
          </div>
        </div>

        {/* Feed stream */}
        {loading ? (
          <div className="text-center py-20 text-muted">Loading...</div>
        ) : items.length === 0 ? (
          <EmptyFeed authenticated={!!session} />
        ) : (
          <div className="flex flex-col gap-4">
            {items.map((entry) => (
              <FeedCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────

function EmptyFeed({ authenticated }: { authenticated: boolean }) {
  return (
    <div className="text-center py-16 px-4">
      <p className="text-muted mb-4">
        {authenticated
          ? 'No talks to vote on right now.'
          : 'Sign in to see your personalized feed.'}
      </p>
      <div className="flex gap-3 justify-center">
        {authenticated ? (
          <>
            <Link href="/deliberations/new" className="text-accent hover:text-accent-hover font-medium text-sm">
              Create a Talk
            </Link>
            <Link href="/communities" className="text-accent hover:text-accent-hover font-medium text-sm">
              Browse Rallies
            </Link>
          </>
        ) : (
          <Link href="/auth/signin" className="bg-accent text-white px-4 py-2 rounded-lg font-medium text-sm">
            Sign In
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Card router ────────────────────────────────────────────────

function FeedCard({ entry }: { entry: FeedEntry }) {
  switch (entry.kind) {
    case 'podium':
      return <PodiumCard entry={entry} />
    case 'vote_now':
      return <VoteNowCard entry={entry} />
    case 'deliberate':
      return <DeliberateCard entry={entry} />
    case 'submit':
      return <SubmitCard entry={entry} />
    case 'join':
      return <JoinCard entry={entry} />
    case 'champion':
      return <ChampionCardInline entry={entry} />
    case 'challenge':
      return <ChallengeCard entry={entry} />
    case 'completed':
      return <CompletedCard entry={entry} />
    default:
      return null
  }
}

// ── Shared card wrapper ────────────────────────────────────────

function Card({
  accentColor,
  children,
  href,
  pinned,
}: {
  accentColor?: string
  children: React.ReactNode
  href?: string
  pinned?: boolean
}) {
  const inner = (
    <div
      className={`bg-surface border border-border rounded-xl p-4 transition-colors hover:bg-surface-hover ${
        pinned ? 'ring-2 ring-accent/20' : ''
      }`}
      style={accentColor ? { borderLeft: `4px solid ${accentColor}` } : undefined}
    >
      {children}
    </div>
  )
  return href ? <Link href={href} className="block">{inner}</Link> : inner
}

function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ color, backgroundColor: bg }}>
      {children}
    </span>
  )
}

function Question({ text }: { text: string }) {
  return <div className="text-base font-serif font-semibold text-foreground mt-2 leading-snug">&ldquo;{text}&rdquo;</div>
}

function Meta({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted mt-2 flex flex-wrap gap-1.5">{children}</div>
}

// ── Podium card ────────────────────────────────────────────────

function PodiumCard({ entry }: { entry: FeedEntry }) {
  const p = entry.podium!
  return (
    <Card href={`/podium/${p.id}`} pinned={entry.pinned}>
      {entry.pinned && (
        <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-2">Pinned</div>
      )}
      <div className="flex items-center gap-2 mb-2">
        {p.authorImage ? (
          <img src={p.authorImage} alt="" className="w-6 h-6 rounded-full" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-accent-light text-accent text-xs font-semibold flex items-center justify-center">
            {(p.authorName || 'A')[0].toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium text-foreground">{p.authorName}</span>
        {p.isAI && (
          <span className="text-[10px] font-medium text-purple bg-purple-bg px-1.5 py-0.5 rounded">AI</span>
        )}
        <span className="text-xs text-muted ml-auto">{timeAgo(p.createdAt)}</span>
      </div>
      <div className="text-base font-bold text-foreground leading-snug">{p.title}</div>
      <div className="text-sm text-muted mt-1 line-clamp-2">{p.preview}</div>
      {p.deliberationQuestion && (
        <div className="mt-3 text-xs bg-accent-light text-accent px-2 py-1 rounded inline-block">
          Linked: &ldquo;{p.deliberationQuestion}&rdquo;
        </div>
      )}
    </Card>
  )
}

// ── Vote Now ───────────────────────────────────────────────────

function VoteNowCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  const cell = entry.cell
  return (
    <Card accentColor="var(--color-warning)" href={`/deliberations/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-warning)" bg="var(--color-warning-bg)">Vote Now &middot; Tier {d.tier}</Badge>
        {d.votingDeadline && <span className="text-xs font-mono text-warning">{timeLeft(d.votingDeadline)}</span>}
      </div>
      <Question text={d.question} />
      {cell && cell.ideas.length > 0 && (
        <div className="mt-3 space-y-1">
          {cell.ideas.slice(0, 3).map((idea) => (
            <div key={idea.id} className="text-xs text-muted bg-background rounded px-2 py-1 truncate">
              {idea.text}
            </div>
          ))}
          {cell.ideas.length > 3 && (
            <div className="text-xs text-muted-light text-center">+ {cell.ideas.length - 3} more</div>
          )}
        </div>
      )}
      <Meta>
        <span>{d.participantCount} participants</span>
        <span>&middot;</span>
        {cell && <span>Your cell: {cell.votedCount}/{cell.memberCount} voted</span>}
      </Meta>
      <div className="mt-2 text-sm font-medium text-warning">Pick your favorite &rarr;</div>
    </Card>
  )
}

// ── Deliberate ─────────────────────────────────────────────────

function DeliberateCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  const cell = entry.cell
  return (
    <Card accentColor="#3b82f6" href={`/deliberations/${d.id}`}>
      <Badge color="#3b82f6" bg="#eff6ff">Deliberate &middot; Tier {d.tier}</Badge>
      <Question text={d.question} />
      {cell && cell.ideas.length > 0 && (
        <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-blue-600 font-semibold mb-1">Your cell&rsquo;s ideas</div>
          {cell.ideas.map((idea, i) => (
            <div key={idea.id} className="text-xs text-subtle leading-relaxed">
              {i + 1}. {idea.text}
            </div>
          ))}
        </div>
      )}
      <Meta>
        <span>{cell?.memberCount || 5} people, {cell?.ideas.length || 5} ideas</span>
        <span>&middot;</span>
        <span>Discuss before voting opens</span>
      </Meta>
      <div className="mt-2 text-sm font-medium" style={{ color: '#3b82f6' }}>Read ideas &amp; discuss &rarr;</div>
    </Card>
  )
}

// ── Submit Ideas ───────────────────────────────────────────────

function SubmitCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-accent)" href={`/deliberations/${d.id}`}>
      <Badge color="var(--color-accent)" bg="var(--color-accent-light)">Submit Ideas</Badge>
      <Question text={d.question} />
      <Meta>
        <span>{d.participantCount} participants</span>
        <span>&middot;</span>
        <span>{d.ideaCount} ideas so far</span>
        {d.submissionDeadline && (
          <>
            <span>&middot;</span>
            <span>{timeLeft(d.submissionDeadline)} left</span>
          </>
        )}
      </Meta>
      <div className="mt-2 text-sm font-medium text-accent">Add your idea &rarr;</div>
    </Card>
  )
}

// ── Join ───────────────────────────────────────────────────────

function JoinCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-accent)" href={`/deliberations/${d.id}`}>
      <Badge color="var(--color-accent)" bg="var(--color-accent-light)">
        Join &middot; {d.phase === 'SUBMISSION' ? 'Open' : `Tier ${d.tier}`}
      </Badge>
      <Question text={d.question} />
      {d.communityName && <div className="text-xs text-muted mt-1">{d.communityName}</div>}
      <Meta>
        <span>{d.participantCount} participants</span>
        <span>&middot;</span>
        <span>{d.ideaCount} ideas</span>
      </Meta>
    </Card>
  )
}

// ── Champion / Accumulating ────────────────────────────────────

function ChampionCardInline({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-purple)" href={`/deliberations/${d.id}`}>
      <Badge color="var(--color-purple)" bg="var(--color-purple-bg)">Accepting New Ideas</Badge>
      <Question text={d.question} />
      {entry.champion && (
        <div className="mt-3 bg-success-bg border border-success-border/20 rounded-lg p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-success font-semibold mb-0.5">Current Priority</div>
          <div className="text-sm text-foreground">&ldquo;{entry.champion.text}&rdquo;</div>
        </div>
      )}
      <Meta>
        <span>{d.participantCount} participants</span>
      </Meta>
      <div className="mt-2 text-sm font-medium text-purple">Submit a challenger idea &rarr;</div>
    </Card>
  )
}

// ── Challenge / Round 2 ────────────────────────────────────────

function ChallengeCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-orange)" href={`/deliberations/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-orange)" bg="var(--color-orange-bg)">Round {d.challengeRound + 1}</Badge>
        {d.votingDeadline && <span className="text-xs font-mono text-orange">{timeLeft(d.votingDeadline)}</span>}
      </div>
      <Question text={d.question} />
      {entry.champion && (
        <div className="mt-3 bg-orange-bg border border-orange/20 rounded-lg p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-orange font-semibold mb-0.5">Defending Priority</div>
          <div className="text-sm text-foreground">&ldquo;{entry.champion.text}&rdquo;</div>
        </div>
      )}
      <div className="mt-2 text-sm font-medium text-orange">Vote to keep or replace &rarr;</div>
    </Card>
  )
}

// ── Completed ──────────────────────────────────────────────────

function CompletedCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card href={`/deliberations/${d.id}`}>
      <Badge color="var(--color-success)" bg="var(--color-success-bg)">Priority Declared</Badge>
      <Question text={d.question} />
      {entry.champion && (
        <div className="mt-3 bg-success-bg border border-success-border/20 rounded-lg p-2.5">
          <div className="text-sm text-foreground">&ldquo;{entry.champion.text}&rdquo;</div>
        </div>
      )}
      <Meta>
        <span>{d.participantCount} participants</span>
        <span>&middot;</span>
        <span>{d.ideaCount} ideas</span>
      </Meta>
    </Card>
  )
}

// ── Utils ──────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function timeLeft(deadlineStr: string): string {
  const diff = new Date(deadlineStr).getTime() - Date.now()
  if (diff <= 0) return 'ending'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
