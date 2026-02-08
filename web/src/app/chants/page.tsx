'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import FirstVisitTooltip from '@/components/FirstVisitTooltip'
import { phaseLabel } from '@/lib/labels'
import { getDisplayName } from '@/lib/user'
import type { FeedEntry, FeedResponse, PulseStats, ActivityItem } from '@/app/api/feed/route'

type Tab = 'your-turn' | 'activity' | 'results' | 'all-chants'

const POLL_INTERVALS: Record<string, number> = {
  'your-turn': 5_000,
  activity: 30_000,
  results: 60_000,
}

export default function FeedPage() {
  const { data: session, status } = useSession()
  const [tab, setTab] = useState<Tab>('your-turn')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Per-tab cached data
  const [yourTurnData, setYourTurnData] = useState<{ items: FeedEntry[]; actionableCount: number }>({ items: [], actionableCount: 0 })
  const [activityData, setActivityData] = useState<{ pulse?: PulseStats; activity: ActivityItem[] }>({ activity: [] })
  const [resultsData, setResultsData] = useState<{ items: FeedEntry[] }>({ items: [] })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchFeed = useCallback(async (targetTab: Tab) => {
    try {
      const res = await fetch(`/api/feed?tab=${targetTab}`)
      if (res.ok) {
        const data: FeedResponse = await res.json()
        setError(false)
        if (targetTab === 'your-turn') {
          setYourTurnData({ items: data.items, actionableCount: data.actionableCount ?? 0 })
        } else if (targetTab === 'activity') {
          setActivityData({ pulse: data.pulse, activity: data.activity ?? [] })
        } else {
          setResultsData({ items: data.items })
        }
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + polling (skip for all-chants tab which manages its own data)
  useEffect(() => {
    if (tab === 'all-chants') {
      setLoading(false)
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    setLoading(true)
    fetchFeed(tab)

    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => fetchFeed(tab), POLL_INTERVALS[tab])

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [tab, fetchFeed])

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab)
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {/* Tab Bar */}
      <div className="sticky top-0 z-30 bg-surface border-b border-border">
        <div className="max-w-xl mx-auto flex" role="tablist">
          <TabButton
            label="Feed"
            active={tab === 'your-turn'}
            onClick={() => handleTabChange('your-turn')}
          />
          <TabButton
            label="Activity"
            active={tab === 'activity'}
            onClick={() => handleTabChange('activity')}
          />
          <TabButton
            label="Results"
            active={tab === 'results'}
            onClick={() => handleTabChange('results')}
          />
          <TabButton
            label="Search"
            active={tab === 'all-chants'}
            onClick={() => handleTabChange('all-chants')}
          />
        </div>
      </div>

      <main className={`mx-auto px-4 py-4 ${tab === 'your-turn' ? 'max-w-5xl' : 'max-w-xl'}`}>
        <FirstVisitTooltip id="feed-tabs">
          Unity Chant enables large-scale consensus through small-group deliberation. Feed shows what you can do, Activity shows what&apos;s happening, and Results shows what&apos;s been decided.
        </FirstVisitTooltip>
        {error && (
          <div className="bg-error-bg border border-error/20 rounded-lg p-4 mb-4 text-center">
            <p className="text-sm text-error mb-2">Could not load feed</p>
            <button
              onClick={() => { setError(false); setLoading(true); fetchFeed(tab) }}
              className="text-xs text-accent hover:underline"
            >
              Try again
            </button>
          </div>
        )}
        {tab === 'all-chants' ? (
          <AllChantsTab />
        ) : loading && (tab === 'your-turn' ? yourTurnData.items.length === 0 : tab === 'activity' ? !activityData.pulse : resultsData.items.length === 0) ? (
          <div className="text-center py-20 text-muted">Loading...</div>
        ) : tab === 'your-turn' ? (
          <YourTurnTab items={yourTurnData.items} actionableCount={yourTurnData.actionableCount} authenticated={!!session} />
        ) : tab === 'activity' ? (
          <ActivityTab pulse={activityData.pulse} activity={activityData.activity} />
        ) : tab === 'results' ? (
          <ResultsTab items={resultsData.items} />
        ) : null}
      </main>
    </div>
  )
}

// ── All Chants Tab ───────────────────────────────────────────

type ChantItem = {
  id: string
  question: string
  description: string | null
  organization: string | null
  phase: string
  isPublic: boolean
  tags: string[]
  views: number
  upvoteCount: number
  userHasUpvoted: boolean
  createdAt: string
  submissionEndsAt: string | null
  ideaGoal: number | null
  creator: { name: string | null; status?: 'ACTIVE' | 'BANNED' | 'DELETED' | null }
  ideas: { text: string }[]
  podiums: { id: string; title: string }[]
  _count: { members: number; ideas: number }
}

const PAGE_SIZE = 20

function AllChantsTab() {
  const [allItems, setAllItems] = useState<ChantItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'hot' | 'new' | 'active'>('hot')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Fetch all chants once
  useEffect(() => {
    fetch('/api/deliberations')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setAllItems(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => { setLoading(false) })
  }, [])

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setVisibleCount(PAGE_SIZE)
    }, 300)
  }

  // Reset visible count on filter/sort change
  const handlePhaseChange = (phase: string) => {
    setPhaseFilter(phase)
    setVisibleCount(PAGE_SIZE)
  }
  const handleSortChange = (sort: 'hot' | 'new' | 'active') => {
    setSortBy(sort)
    setVisibleCount(PAGE_SIZE)
  }

  const getHotScore = (d: ChantItem): number => {
    const views = d.views || 0
    const members = d._count.members || 0
    const ideas = d._count.ideas || 0
    const upvotes = d.upvoteCount || 0
    const ageHours = (Date.now() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60)
    const ageFactor = Math.max(1, Math.sqrt(ageHours))
    return (views + members * 2 + ideas * 3 + upvotes * 5) / ageFactor
  }

  const filtered = allItems
    .filter(d => {
      if (phaseFilter !== 'all' && d.phase !== phaseFilter) return false
      if (debouncedSearch && !d.question.toLowerCase().includes(debouncedSearch.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'hot':
          return getHotScore(b) - getHotScore(a)
        case 'new':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'active': {
          const phasePriority: Record<string, number> = { VOTING: 3, SUBMISSION: 2, ACCUMULATING: 1, COMPLETED: 0 }
          const ap = phasePriority[a.phase] ?? 0
          const bp = phasePriority[b.phase] ?? 0
          if (bp !== ap) return bp - ap
          return (b._count.members + b._count.ideas) - (a._count.members + a._count.ideas)
        }
        default:
          return 0
      }
    })

  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  const handleUpvote = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/deliberations/${id}/upvote`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setAllItems(prev => prev.map(d =>
          d.id === id ? { ...d, userHasUpvoted: data.upvoted, upvoteCount: d.upvoteCount + (data.upvoted ? 1 : -1) } : d
        ))
      }
    } catch { /* ignore */ }
  }

  const phaseStyles: Record<string, string> = {
    SUBMISSION: 'bg-accent text-white',
    VOTING: 'bg-warning text-white',
    COMPLETED: 'bg-success text-white',
    ACCUMULATING: 'bg-purple text-white',
  }

  // Stats
  const stats = {
    total: allItems.length,
    submission: allItems.filter(d => d.phase === 'SUBMISSION').length,
    voting: allItems.filter(d => d.phase === 'VOTING').length,
    completed: allItems.filter(d => d.phase === 'COMPLETED').length,
  }

  if (loading) return <div className="text-center py-20 text-muted">Loading...</div>

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-surface rounded-lg border border-border p-2.5 text-center">
          <div className="text-lg font-bold text-foreground font-mono">{stats.total}</div>
          <div className="text-muted text-xs">Total</div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-2.5 text-center">
          <div className="text-lg font-bold text-accent font-mono">{stats.submission}</div>
          <div className="text-muted text-xs">Submission</div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-2.5 text-center">
          <div className="text-lg font-bold text-warning font-mono">{stats.voting}</div>
          <div className="text-muted text-xs">Voting</div>
        </div>
        <div className="bg-surface rounded-lg border border-border p-2.5 text-center">
          <div className="text-lg font-bold text-success font-mono">{stats.completed}</div>
          <div className="text-muted text-xs">Completed</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-lg border border-border p-3 mb-4 space-y-2.5">
        <input
          type="text"
          placeholder="Search chants..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full bg-background border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
        <div className="flex gap-1.5 flex-wrap">
          {['all', 'SUBMISSION', 'VOTING', 'COMPLETED', 'ACCUMULATING'].map(phase => (
            <button
              key={phase}
              onClick={() => handlePhaseChange(phase)}
              className={`px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                phaseFilter === phase
                  ? 'bg-header text-white'
                  : 'bg-background text-muted border border-border hover:border-border-strong'
              }`}
            >
              {phase === 'all' ? 'All' : phaseLabel(phase)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted text-xs">Sort:</span>
          {(['hot', 'new', 'active'] as const).map(sort => (
            <button
              key={sort}
              onClick={() => handleSortChange(sort)}
              className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                sortBy === sort
                  ? 'bg-accent text-white'
                  : 'bg-background text-muted border border-border hover:border-accent'
              }`}
            >
              {sort === 'hot' ? 'Hot' : sort === 'new' ? 'New' : 'Active'}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="text-xs text-muted mb-3">
        {filtered.length} chant{filtered.length !== 1 ? 's' : ''}
        {phaseFilter !== 'all' || debouncedSearch ? ' matching filters' : ''}
      </div>

      {/* Chant list */}
      {filtered.length === 0 ? (
        <div className="bg-surface rounded-lg border border-border p-8 text-center text-muted text-sm">No chants found</div>
      ) : (
        <div className="space-y-2.5">
          {visible.map(d => (
            <Link key={d.id} href={`/chants/${d.id}`} className="block">
              <div className="bg-surface border border-border rounded-lg p-3.5 hover:border-accent cursor-pointer transition-colors">
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <span className="text-foreground font-medium text-sm flex-1 leading-snug">
                    {d.question.length > 80 ? d.question.slice(0, 80) + '...' : d.question}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${phaseStyles[d.phase] || 'bg-surface text-muted'}`}>
                    {phaseLabel(d.phase)}
                  </span>
                </div>
                {d.ideas[0] && (
                  <p className="text-xs text-success mb-1 truncate">
                    Priority: {d.ideas[0].text.length > 60 ? d.ideas[0].text.slice(0, 60) + '...' : d.ideas[0].text}
                  </p>
                )}
                <div className="flex items-center gap-2.5 text-xs text-muted flex-wrap">
                  <button
                    onClick={(e) => handleUpvote(e, d.id)}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border transition-colors ${
                      d.userHasUpvoted
                        ? 'bg-accent/10 border-accent text-accent'
                        : 'border-border hover:border-accent hover:text-accent'
                    }`}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill={d.userHasUpvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                    <span className="font-mono">{d.upvoteCount || 0}</span>
                  </button>
                  <span className="font-mono">{d._count.members} members</span>
                  <span className="font-mono">{d._count.ideas} ideas</span>
                  <span>{getDisplayName(d.creator)}</span>
                </div>
                {d.tags && d.tags.length > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    {d.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-xs bg-background text-muted px-1.5 py-0.5 rounded border border-border">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}

          {/* Load More */}
          {hasMore && (
            <button
              onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
              className="w-full py-3 text-sm font-medium text-accent hover:text-accent-hover bg-surface border border-border rounded-lg hover:border-accent transition-colors"
            >
              Load More ({filtered.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab Button ────────────────────────────────────────────────

function TabButton({ label, active, badge, onClick }: { label: string; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 py-2.5 text-center text-sm font-medium transition-colors border-b-2 ${
        active
          ? 'text-foreground border-accent'
          : 'text-muted border-transparent hover:text-foreground'
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 bg-error text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

// ── Your Turn Tab ─────────────────────────────────────────────

function YourTurnTab({ items, actionableCount, authenticated }: { items: FeedEntry[]; actionableCount: number; authenticated: boolean }) {
  const [mobileSubTab, setMobileSubTab] = useState<'upvoted' | 'new'>('upvoted')
  const allItems = items.filter((e) => e.priority >= 5)

  if (allItems.length === 0) return <EmptyFeed authenticated={authenticated} />

  // Split: upvoted (has upvotes, sorted by count desc) vs new (no upvotes)
  const podiumsSummary = allItems.find(e => e.kind === 'podiums_summary')
  const upvoted = allItems
    .filter(e => (e.deliberation?.upvoteCount ?? 0) > 0 && e.kind !== 'podiums_summary')
    .sort((a, b) => (b.deliberation?.upvoteCount ?? 0) - (a.deliberation?.upvoteCount ?? 0))
  const fresh = allItems.filter(e => (e.deliberation?.upvoteCount ?? 0) === 0 && e.kind !== 'podiums_summary')

  const upvotedList = (
    <div className="flex flex-col gap-3">
      {podiumsSummary && <FeedCard key={podiumsSummary.id} entry={podiumsSummary} />}
      {upvoted.length > 0 ? (
        upvoted.map((entry) => (
          <FeedCard key={entry.id} entry={entry} />
        ))
      ) : (
        <div className="text-center py-8 text-muted text-sm bg-surface border border-border rounded-xl">
          No upvoted chants yet
        </div>
      )}
    </div>
  )

  const freshList = fresh.length > 0 ? (
    <div className="flex flex-col gap-3">
      {fresh.map((entry) => (
        <FeedCard key={entry.id} entry={entry} />
      ))}
    </div>
  ) : (
    <div className="text-center py-8 text-muted text-sm bg-surface border border-border rounded-xl">
      No new chants
    </div>
  )

  return (
    <>
      {/* Mobile: sub-tabs to switch between Upvoted and New */}
      <div className="flex md:hidden border-b border-border mb-4" role="tablist" aria-label="Feed columns">
        <button
          role="tab"
          aria-selected={mobileSubTab === 'upvoted'}
          onClick={() => setMobileSubTab('upvoted')}
          className={`flex-1 py-2 text-center text-xs font-medium transition-colors border-b-2 ${
            mobileSubTab === 'upvoted' ? 'text-foreground border-accent' : 'text-muted border-transparent'
          }`}
        >
          Upvoted <span className="font-mono text-muted">{upvoted.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={mobileSubTab === 'new'}
          onClick={() => setMobileSubTab('new')}
          className={`flex-1 py-2 text-center text-xs font-medium transition-colors border-b-2 ${
            mobileSubTab === 'new' ? 'text-foreground border-accent' : 'text-muted border-transparent'
          }`}
        >
          New <span className="font-mono text-muted">{fresh.length}</span>
        </button>
      </div>

      {/* Mobile: show selected sub-tab */}
      <div className="md:hidden">
        {mobileSubTab === 'upvoted' ? upvotedList : freshList}
      </div>

      {/* Desktop: side-by-side columns */}
      <div className="hidden md:grid md:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Upvoted</h2>
            <span className="text-xs text-muted font-mono">{upvoted.length}</span>
          </div>
          {upvotedList}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-accent text-sm">&#10022;</span>
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">New</h2>
            <span className="text-xs text-muted font-mono">{fresh.length}</span>
          </div>
          {freshList}
        </div>
      </div>
    </>
  )
}

// ── Activity Tab ──────────────────────────────────────────────

function ActivityTab({ pulse, activity }: { pulse?: PulseStats; activity: ActivityItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Platform Pulse */}
      {pulse && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs uppercase tracking-widest text-muted-light font-semibold mb-3">Platform Pulse</div>
          <div className="grid grid-cols-2 gap-3">
            <PulseStat value={pulse.activeVoters} label="Active Voters" color="text-accent" />
            <PulseStat value={pulse.inProgress} label="In Progress" color="text-warning" />
            <PulseStat value={pulse.ideasToday} label="Ideas Today" color="text-success" />
            <PulseStat value={pulse.votesToday} label="Votes Today" color="text-purple" />
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      {activity.length > 0 ? (
        activity.map((item) => (
          <ActivityTimelineItem key={item.id} item={item} />
        ))
      ) : (
        <div className="text-center py-12">
          <div className="bg-surface border border-border rounded-xl p-8 max-w-md mx-auto">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-lg font-semibold mb-2">No activity yet</h3>
            <p className="text-muted text-sm">
              Platform activity from chants you're participating in will appear here.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function PulseStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[9px] text-muted-light">{label}</div>
    </div>
  )
}

const ACTIVITY_ICONS: Record<string, string> = {
  USER_VOTED: '\u{2705}',
  USER_SUBMITTED_IDEA: '\u{1F4A1}',
  USER_COMMENTED: '\u{1F4AC}',
  USER_JOINED: '\u{1F44B}',
}

function ActivityTimelineItem({ item }: { item: ActivityItem }) {
  const icon = ACTIVITY_ICONS[item.type] || '\u{1F514}'
  const inner = (
    <div className="bg-surface border border-border rounded-xl p-3">
      <div className="flex gap-3 items-start">
        <div className="text-base flex-shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-foreground leading-relaxed">{item.title}</div>
          {item.body && <div className="text-xs text-muted mt-0.5">{item.body}</div>}
          <div className="text-xs text-muted-light mt-1">{timeAgo(item.createdAt)}</div>
        </div>
      </div>
    </div>
  )
  return item.deliberationId ? (
    <Link href={`/chants/${item.deliberationId}`} className="block">{inner}</Link>
  ) : (
    inner
  )
}

// ── Results Tab ───────────────────────────────────────────────

function ResultsTab({ items }: { items: FeedEntry[] }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16 px-4">
        <div className="max-w-md mx-auto bg-surface border border-border rounded-xl p-8">
          <div className="text-4xl mb-4">🏁</div>
          <h3 className="text-lg font-semibold mb-2">No results yet</h3>
          <p className="text-muted text-sm">
            Completed deliberations will appear here once consensus is reached.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((entry) => (
        <ResultCard key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

function ResultCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-success)" href={`/chants/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-success)" bg="var(--color-success-bg)">{'\u{1F451}'} Priority Declared</Badge>
        <UpvoteButton deliberationId={d.id} count={d.upvoteCount ?? 0} userUpvoted={d.userUpvoted ?? false} />
      </div>
      <Question text={d.question} />
      {entry.champion && (
        <div className="mt-2 bg-success-bg border border-success/20 rounded-lg p-2.5">
          <div className="text-sm text-foreground">&ldquo;{entry.champion.text}&rdquo;</div>
          {entry.winnerVoteCount !== undefined && (
            <div className="text-xs text-success mt-1">{entry.winnerVoteCount} VP in final round</div>
          )}
        </div>
      )}
      {entry.myIdea && (
        <div className={`text-xs mt-1.5 font-medium ${entry.myIdea.status === 'WINNER' ? 'text-success' : 'text-muted'}`}>
          {entry.myIdea.status === 'WINNER' ? 'Your pick won!' : `Your pick: ${entry.myIdea.status.toLowerCase()}`}
        </div>
      )}
      <Meta>
        <span>{d.participantCount} participants</span>
        <span>&middot;</span>
        <span>{d.ideaCount} ideas</span>
        {entry.tierCount && (
          <>
            <span>&middot;</span>
            <span>{entry.tierCount} tiers</span>
          </>
        )}
        {entry.completedAt && (
          <>
            <span>&middot;</span>
            <span>{timeAgo(entry.completedAt)}</span>
          </>
        )}
      </Meta>
    </Card>
  )
}

// ── Empty state ────────────────────────────────────────────────

function EmptyFeed({ authenticated }: { authenticated: boolean }) {
  return (
    <div className="text-center py-16 px-4">
      <div className="max-w-md mx-auto bg-surface border border-border rounded-xl p-8">
        <div className="text-4xl mb-4">💭</div>
        <h3 className="text-lg font-semibold mb-2">Your feed is empty</h3>
        <p className="text-muted text-sm mb-6">
          {authenticated
            ? 'Get started by creating a chant or joining a group to participate in deliberations.'
            : 'Sign in to join deliberations, vote on ideas, and build consensus with others.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {authenticated ? (
            <>
              <Link href="/chants/new" className="bg-accent hover:bg-accent-hover text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors">
                + Create a Chant
              </Link>
              <Link href="/groups" className="border border-border hover:border-accent hover:text-accent px-5 py-2.5 rounded-lg font-medium text-sm transition-colors">
                Browse Groups
              </Link>
            </>
          ) : (
            <Link href="/auth/signin" className="bg-accent hover:bg-accent-hover text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Card router ────────────────────────────────────────────────

function FeedCard({ entry }: { entry: FeedEntry }) {
  switch (entry.kind) {
    case 'podiums_summary':
      return <PodiumsSummaryCard entry={entry} />
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
    case 'extra_vote':
      return <ExtraVoteCard entry={entry} />
    case 'completed':
      return <CompletedCard entry={entry} />
    case 'waiting':
      return <WaitingCard entry={entry} />
    case 'advanced':
      return <AdvancedCard entry={entry} />
    case 'podium':
      return <PodiumCard entry={entry} />
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
  className: extraClass,
}: {
  accentColor?: string
  children: React.ReactNode
  href?: string
  pinned?: boolean
  className?: string
}) {
  const inner = (
    <div
      className={`bg-surface border border-border rounded-xl p-4 transition-colors hover:bg-surface-hover ${
        pinned ? 'ring-2 ring-accent/20' : ''
      } ${extraClass || ''}`}
      style={accentColor ? { borderLeft: `4px solid ${accentColor}` } : undefined}
    >
      {children}
    </div>
  )
  return href ? <Link href={href} className="block">{inner}</Link> : inner
}

function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span className="text-sm font-semibold px-2 py-0.5 rounded" style={{ color, backgroundColor: bg }}>
      {children}
    </span>
  )
}

function Question({ text }: { text: string }) {
  return <div className="text-lg font-serif font-semibold text-foreground mt-2 leading-snug">&ldquo;{text}&rdquo;</div>
}

function Meta({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted mt-2 flex flex-wrap gap-1.5">{children}</div>
}

function UpvoteButton({ deliberationId, count, userUpvoted }: { deliberationId: string; count: number; userUpvoted: boolean }) {
  const [upvoted, setUpvoted] = useState(userUpvoted)
  const [upvoteCount, setUpvoteCount] = useState(count)
  const [loading, setLoading] = useState(false)

  const handleUpvote = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoading(true)
    try {
      const res = await fetch(`/api/deliberations/${deliberationId}/upvote`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setUpvoted(data.upvoted)
        setUpvoteCount(data.upvoteCount)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  return (
    <button
      onClick={handleUpvote}
      disabled={loading}
      className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
        upvoted
          ? 'text-accent bg-accent/15 font-medium'
          : 'text-muted hover:text-accent hover:bg-accent/10'
      }`}
      title={upvoted ? 'Remove upvote' : 'Upvote this chant'}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={upvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
      <span className="font-mono">{upvoteCount}</span>
    </button>
  )
}

// ── PodiumsSummaryCard ─────────────────────────────────────────

function PodiumsSummaryCard({ entry }: { entry: FeedEntry }) {
  const podiums = entry.podiums || []
  if (podiums.length === 0) return null

  return (
    <Card accentColor="var(--color-muted)" pinned>
      <Link href="/podiums">
        <Badge color="var(--color-muted)" bg="var(--color-muted-light/.1)">{'\u270E'} Podiums</Badge>
      </Link>
      <div className="mt-3 flex flex-col gap-1.5">
        {podiums.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <Link
                href={`/podium/${p.id}`}
                className="flex-1 min-w-0"
              >
                <div className="text-sm font-semibold truncate text-foreground">
                  {p.title}
                </div>
                <div className="text-sm text-muted-light">
                  {p.authorName}
                  {p.isAI && <span className="text-xs font-semibold text-purple bg-purple-bg px-1.5 py-0.5 rounded ml-1">AI</span>}
                  {' \u00B7 '}{timeAgo(p.createdAt)}
                </div>
              </Link>
              {p.deliberationId && (
                <Link
                  href={`/chants/${p.deliberationId}`}
                  className="text-xs bg-accent/15 text-accent px-2 py-1 rounded font-medium shrink-0 hover:bg-accent/25 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Join Chant &rarr;
                </Link>
              )}
            </div>
          ))}
      </div>
    </Card>
  )
}

// ── WaitingCard ────────────────────────────────────────────────

function WaitingCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  const cell = entry.cell
  const isRoundFull = (entry as any).roundFull === true
  return (
    <div className="opacity-70">
      <Card accentColor="var(--color-border)" href={`/chants/${d.id}`}>
        <div className="flex justify-between items-center">
          <Badge color="var(--color-muted)" bg="rgba(113,113,122,0.1)">
            {isRoundFull ? '\u{1F512}' : '\u23F3'} {isRoundFull ? 'Round Full' : 'Waiting'} &middot; Tier {d.tier}
          </Badge>
          <div className="flex items-center gap-2">
            {d.votingDeadline && <span className="text-xs font-mono text-muted-light">{timeLeft(d.votingDeadline)}</span>}
            <UpvoteButton deliberationId={d.id} count={d.upvoteCount ?? 0} userUpvoted={d.userUpvoted ?? false} />
          </div>
        </div>
        <Question text={d.question} />
        <Meta>
          {isRoundFull ? (
            <span>You&apos;ll vote in the next round</span>
          ) : (
            <>
              <span>You voted {'\u2713'}</span>
              <span>&middot;</span>
              <span>{cell?.votedCount}/{cell?.memberCount} voted</span>
              {cell && cell.memberCount - cell.votedCount > 0 && (
                <>
                  <span>&middot;</span>
                  <span>Waiting for {cell.memberCount - cell.votedCount} more</span>
                </>
              )}
            </>
          )}
        </Meta>
        {/* Member avatars (not shown for round-full) */}
        {!isRoundFull && cell?.members && (
          <div className="flex gap-1 mt-2">
            {cell.members.map((m, i) => (
              <div
                key={i}
                className="w-[18px] h-[18px] rounded-full text-[7px] font-semibold flex items-center justify-center"
                style={
                  m.voted
                    ? { background: 'var(--color-success)', color: '#fff' }
                    : { background: 'var(--color-border)', color: 'var(--color-muted-light)' }
                }
                title={m.name}
              >
                {m.voted ? '\u2713' : (m.name?.[0] || '?').toUpperCase()}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ── AdvancedCard ───────────────────────────────────────────────

function AdvancedCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  const myIdea = entry.myIdea
  return (
    <Card accentColor="var(--color-success)" href={`/chants/${d.id}`}>
      <Badge color="var(--color-success)" bg="var(--color-success-bg)">{'\u{1F389}'} Your Pick Advanced</Badge>
      <Question text={d.question} />
      {myIdea && (
        <div className="mt-2 bg-success-bg border border-success/20 rounded-lg p-2.5">
          <div className="text-sm text-foreground">&ldquo;{myIdea.text}&rdquo;</div>
          <div className="text-xs text-success mt-1">
            Tier {(entry.cell?.tier ?? d.tier) > 1 ? (entry.cell?.tier ?? d.tier) - 1 : 1} &rarr; Tier {entry.cell?.tier ?? d.tier}
            {entry.cell && ` \u00B7 Won with ${entry.cell.votedCount}/${entry.cell.memberCount} votes`}
          </div>
        </div>
      )}
      <Meta><span>{timeAgo(new Date().toISOString())}</span></Meta>
    </Card>
  )
}

// ── Podium card (fallback for individual podium entries) ──────

function PodiumCard({ entry }: { entry: FeedEntry }) {
  const p = entry.podium!
  return (
    <Card href={`/podium/${p.id}`} pinned={entry.pinned}>
      {entry.pinned && (
        <div className="text-xs uppercase tracking-wider text-accent font-semibold mb-2">Pinned</div>
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
          <span className="text-xs font-medium text-purple bg-purple-bg px-1.5 py-0.5 rounded">AI</span>
        )}
        <span className="text-sm text-muted ml-auto">{timeAgo(p.createdAt)}</span>
      </div>
      <div className="text-lg font-bold text-foreground leading-snug">{p.title}</div>
      <div className="text-sm text-muted mt-1 line-clamp-2">{p.preview}</div>
      {p.deliberationId && p.deliberationQuestion && (
        <Link
          href={`/chants/${p.deliberationId}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-3 flex items-center justify-between bg-accent/10 border border-accent/25 rounded-lg p-2.5 hover:bg-accent/15 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider text-accent font-semibold">Linked Chant</div>
            <div className="text-sm text-foreground truncate">&ldquo;{p.deliberationQuestion}&rdquo;</div>
          </div>
          <span className="text-xs bg-accent text-white px-2.5 py-1 rounded font-medium shrink-0 ml-2">
            Join &rarr;
          </span>
        </Link>
      )}
    </Card>
  )
}

// ── Vote Now ───────────────────────────────────────────────────

function VoteNowCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  const cell = entry.cell
  return (
    <Card accentColor="var(--color-warning)" href={`/chants/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-warning)" bg="var(--color-warning-bg)">Vote Now &middot; Tier {d.tier}</Badge>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold text-warning">{d.votingDeadline ? timeLeft(d.votingDeadline) : 'Facilitated'}</span>
          <UpvoteButton deliberationId={d.id} count={d.upvoteCount ?? 0} userUpvoted={d.userUpvoted ?? false} />
        </div>
      </div>
      <Question text={d.question} />
      {cell && cell.ideas.length > 0 && (
        <div className="mt-2 flex flex-col gap-[3px]">
          {cell.ideas.slice(0, 2).map((idea) => (
            <div key={idea.id} className="text-sm text-muted px-2 py-[5px] bg-background rounded-md truncate">
              {idea.text}
            </div>
          ))}
          {cell.ideas.length > 2 && (
            <div className="text-xs text-muted-light text-center py-0.5">+ {cell.ideas.length - 2} more ideas</div>
          )}
        </div>
      )}
      <Meta>
        <span>{d.participantCount} participants</span>
        <span>&middot;</span>
        {cell && <span>Your cell: {cell.votedCount}/{cell.memberCount} voted</span>}
      </Meta>
      <div className="mt-2 text-sm font-medium text-warning">Allocate your 10 Vote Points &rarr;</div>
    </Card>
  )
}

// ── Deliberate ─────────────────────────────────────────────────

function DeliberateCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  const cell = entry.cell
  return (
    <Card accentColor="var(--color-blue)" href={`/chants/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-blue)" bg="var(--color-blue-bg)">{'\u{1F4AC}'} Deliberate &middot; Tier {d.tier}</Badge>
        <UpvoteButton deliberationId={d.id} count={d.upvoteCount ?? 0} userUpvoted={d.userUpvoted ?? false} />
      </div>
      <Question text={d.question} />
      {cell && cell.ideas.length > 0 && (
        <div className="mt-3 bg-blue-bg border border-blue/15 rounded-lg p-3">
          <div className="text-xs uppercase tracking-wider text-blue font-semibold mb-1">Your cell&rsquo;s ideas</div>
          {cell.ideas.map((idea, i) => (
            <div key={idea.id} className="text-sm text-subtle leading-relaxed">
              {i + 1}. {idea.text}
            </div>
          ))}
        </div>
      )}
      {cell?.latestComment && (
        <div className="mt-2 bg-background border border-border rounded-lg p-2.5">
          <div className="text-xs text-muted mb-0.5">Latest comment:</div>
          <div className="text-sm text-foreground italic leading-relaxed">&ldquo;{cell.latestComment.text}&rdquo;</div>
          <div className="text-xs text-muted mt-0.5">&mdash; {cell.latestComment.authorName}</div>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-medium text-blue">Read ideas &amp; discuss &rarr;</span>
        <span className="text-xs font-mono text-muted">{cell?.discussionDeadline ? `Voting opens in ${timeLeft(cell.discussionDeadline)}` : 'Facilitator opens voting'}</span>
      </div>
    </Card>
  )
}

// ── Submit Ideas ───────────────────────────────────────────────

function SubmitCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  const isVotingLive = d.phase === 'VOTING'
  return (
    <Card accentColor="var(--color-accent)" href={`/chants/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-accent)" bg="var(--color-accent-light)">{'\u{1F4A1}'} Submit Ideas</Badge>
        <div className="flex items-center gap-2">
          {isVotingLive && (
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-warning)' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--color-warning)' }} />
              Voting live
            </span>
          )}
          <span className="text-xs text-muted-light">{d.submissionDeadline ? `${timeLeft(d.submissionDeadline)} left` : 'Facilitated'}</span>
          <UpvoteButton deliberationId={d.id} count={d.upvoteCount ?? 0} userUpvoted={d.userUpvoted ?? false} />
        </div>
      </div>
      <Question text={d.question} />
      <Meta>
        <span>{d.participantCount} participants</span>
        <span>&middot;</span>
        <span>{d.ideaCount} ideas so far</span>
      </Meta>
      <div className="mt-2 text-sm font-medium text-accent">Add your idea &rarr;</div>
    </Card>
  )
}

// ── Join ───────────────────────────────────────────────────────

function JoinCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-accent)" href={`/chants/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-accent)" bg="var(--color-accent-light)">
          Join &middot; {d.phase === 'SUBMISSION' ? 'Accepting Ideas' : `Tier ${d.tier}`}
        </Badge>
        <div className="flex items-center gap-2">
          {d.submissionDeadline && <span className="text-xs text-muted-light">{timeLeft(d.submissionDeadline)} left</span>}
          <UpvoteButton deliberationId={d.id} count={d.upvoteCount ?? 0} userUpvoted={d.userUpvoted ?? false} />
        </div>
      </div>
      <Question text={d.question} />
      {d.communityName && <div className="text-xs text-muted mt-1">{d.communityName}</div>}
      <Meta>
        <span>{d.participantCount} participants</span>
        <span>&middot;</span>
        <span>{d.ideaCount} ideas</span>
      </Meta>
      {/* Full-width join button */}
      <div className="mt-3">
        <div className="w-full bg-accent text-white text-center py-2 rounded-lg text-sm font-semibold">
          Join This Chant
        </div>
      </div>
    </Card>
  )
}

// ── Champion / Accumulating ────────────────────────────────────

function ChampionCardInline({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-purple)" href={`/chants/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-purple)" bg="var(--color-purple-bg)">{'\u2605'} Accepting New Ideas</Badge>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold text-purple">Facilitated</span>
          <UpvoteButton deliberationId={d.id} count={d.upvoteCount ?? 0} userUpvoted={d.userUpvoted ?? false} />
        </div>
      </div>
      <Question text={d.question} />
      {entry.champion && (
        <div className="mt-3 bg-success-bg border border-success/20 rounded-lg p-2.5">
          <div className="text-xs uppercase tracking-wider text-success font-semibold mb-0.5">Current Priority</div>
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
    <Card accentColor="var(--color-orange)" href={`/chants/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-orange)" bg="var(--color-orange-bg)">Challenge Vote &middot; Round {d.challengeRound + 1} &middot; Tier {d.tier}</Badge>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold text-orange">{d.votingDeadline ? `${timeLeft(d.votingDeadline)} left` : 'Facilitated'}</span>
          <UpvoteButton deliberationId={d.id} count={d.upvoteCount ?? 0} userUpvoted={d.userUpvoted ?? false} />
        </div>
      </div>
      <Question text={d.question} />
      <Meta>
        <span>{d.participantCount} participants</span>
      </Meta>
      {entry.champion && (
        <div className="mt-3 bg-orange-bg border border-orange/20 rounded-lg p-2.5">
          <div className="text-xs uppercase tracking-wider text-orange font-semibold mb-0.5">Defending Priority</div>
          <div className="text-sm text-foreground">&ldquo;{entry.champion.text}&rdquo;</div>
        </div>
      )}
      <div className="mt-2 text-sm font-medium text-orange">Vote &rarr;</div>
    </Card>
  )
}

// ── Extra Vote ────────────────────────────────────────────────

function ExtraVoteCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card accentColor="var(--color-accent)" href={`/chants/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-accent)" bg="var(--color-accent-light)">Extra Vote &middot; Tier {d.tier}</Badge>
        <div className="flex items-center gap-2">
          {entry.secondVoteDeadline && (
            <span className="text-xs font-mono font-semibold text-accent">{timeLeft(entry.secondVoteDeadline)} left</span>
          )}
          <UpvoteButton deliberationId={d.id} count={d.upvoteCount ?? 0} userUpvoted={d.userUpvoted ?? false} />
        </div>
      </div>
      <Question text={d.question} />
      <div className="mt-2 bg-accent-light border border-accent/20 rounded-lg p-2.5">
        <div className="text-sm text-muted">You already voted. The facilitator opened a window for you to vote in a second cell with different ideas.</div>
      </div>
      <div className="mt-2 text-sm font-medium text-accent">Cast extra vote &rarr;</div>
    </Card>
  )
}

// ── Completed ──────────────────────────────────────────────────

function CompletedCard({ entry }: { entry: FeedEntry }) {
  const d = entry.deliberation!
  return (
    <Card href={`/chants/${d.id}`}>
      <div className="flex justify-between items-center">
        <Badge color="var(--color-success)" bg="var(--color-success-bg)">Priority Declared</Badge>
        <UpvoteButton deliberationId={d.id} count={d.upvoteCount ?? 0} userUpvoted={d.userUpvoted ?? false} />
      </div>
      <Question text={d.question} />
      {entry.champion && (
        <div className="mt-3 bg-success-bg border border-success/20 rounded-lg p-2.5">
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
