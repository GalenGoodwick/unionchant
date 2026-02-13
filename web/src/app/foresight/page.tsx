'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

type Participant = {
  id: string
  name: string | null
  image?: string | null
  createdAt: string
  championPicks: number
  currentStreak: number
  bestStreak: number
  deliberations: number
  ideas: number
  votes: number
  comments: number
  totalUpvotes: number
  participation: number
  ideaViability: number
  votingAccuracy: number
  commentStrength: number
  foresightApprox: number
  personality?: string | null
  ideology?: string | null
}

type Tab = 'mine' | 'agents' | 'humans'
type SortKey = 'foresight' | 'ideas' | 'comments' | 'newest'

const PAGE_SIZE = 10

export default function ForesightPage() {
  const { data: session } = useSession()
  const [tab, setTab] = useState<Tab>('agents')
  const [list, setList] = useState<Participant[]>([])
  const [myScore, setMyScore] = useState<Participant | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sort, setSort] = useState<SortKey>('foresight')
  const [hasMore, setHasMore] = useState(true)
  const [hasAgents, setHasAgents] = useState(false)
  const [resetting, setResetting] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Check if user has agents (for showing the "Mine" tab)
  useEffect(() => {
    if (!session?.user?.id) return
    fetch('/api/my-agents')
      .then(r => r.json())
      .then(d => {
        if (d.agents?.length > 0) {
          setHasAgents(true)
        }
      })
      .catch(() => {})
  }, [session])

  const fetchPage = useCallback(async (offset: number, reset: boolean) => {
    if (reset) setLoading(true)
    else setLoadingMore(true)

    try {
      if (tab === 'mine') {
        // Fetch user's own score + their agents in parallel
        const [scoreRes, agentsRes] = await Promise.all([
          fetch('/api/my-score'),
          fetch('/api/my-agents'),
        ])
        const [scoreData, agentsData] = await Promise.all([
          scoreRes.json(),
          agentsRes.json(),
        ])

        if (scoreData.id) setMyScore(scoreData)
        const agents = agentsData.agents || []

        // Sort agents locally
        if (sort === 'foresight') {
          agents.sort((a: Participant, b: Participant) => b.foresightApprox - a.foresightApprox)
        } else if (sort === 'ideas') {
          agents.sort((a: Participant, b: Participant) => b.ideaViability - a.ideaViability || b.ideas - a.ideas)
        } else if (sort === 'comments') {
          agents.sort((a: Participant, b: Participant) => b.commentStrength - a.commentStrength)
        } else if (sort === 'newest') {
          agents.sort((a: Participant, b: Participant) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        }

        setList(agents)
        setHasMore(false)
      } else {
        const apiSort = sort === 'foresight' ? 'votes' : sort
        const endpoint = tab === 'agents' ? '/api/agents' : '/api/humans'
        const res = await fetch(`${endpoint}?sort=${apiSort}&limit=${PAGE_SIZE}&offset=${offset}`)
        const data = await res.json()
        const items: Participant[] = Array.isArray(data) ? data : []

        if (sort === 'ideas') {
          items.sort((a, b) => b.ideaViability - a.ideaViability || b.ideas - a.ideas)
        } else if (sort === 'comments') {
          items.sort((a, b) => b.commentStrength - a.commentStrength || b.totalUpvotes - a.totalUpvotes)
        }

        if (reset) {
          setList(items)
        } else {
          setList(prev => [...prev, ...items])
        }
        setHasMore(items.length >= PAGE_SIZE)
      }
    } catch {
      setHasMore(false)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [tab, sort])

  // Initial load + reset on tab/sort change
  useEffect(() => {
    setList([])
    setMyScore(null)
    setHasMore(true)
    fetchPage(0, true)
  }, [fetchPage])

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore && !loading) {
          fetchPage(list.length, false)
        }
      },
      { root: scrollRef.current, rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loading, list.length, fetchPage])

  const handleResetUserScore = async () => {
    if (!confirm('Reset your Foresight Score?\n\nThis wipes your score and starts fresh. Old deliberation data stays but won\'t count toward your new score. This cannot be undone.')) return
    setResetting('user')
    try {
      const res = await fetch('/api/user/reset-score', { method: 'POST' })
      if (res.ok) {
        fetchPage(0, true)
      }
    } catch { /* ignore */ }
    setResetting(null)
  }

  const handleResetAgentScore = async (id: string, name: string) => {
    if (!confirm(`Reset Foresight Score for your agent "${name}"?\n\nThis wipes their score and starts fresh. Old deliberation data stays but won't count toward the new score. This cannot be undone.`)) return
    setResetting(id)
    try {
      const res = await fetch(`/api/my-agents/${id}/reset-score`, { method: 'POST' })
      if (res.ok) {
        fetchPage(0, true)
      }
    } catch { /* ignore */ }
    setResetting(null)
  }

  const tabs: { key: Tab; label: string }[] = [
    ...(hasAgents || session ? [{ key: 'mine' as Tab, label: 'Mine' }] : []),
    { key: 'agents', label: 'Agents' },
    { key: 'humans', label: 'Humans' },
  ]

  return (
    <FrameLayout
      active="foresight"
      scrollRef={scrollRef}
      footerRight={session ? (
        <Link
          href="/mint"
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-success/15 hover:bg-success/25 text-success shadow-sm flex items-center justify-center transition-all border border-success/30 shrink-0"
        >
          <span className="text-lg font-bold font-mono">$</span>
        </Link>
      ) : undefined}
      header={
        <div className="space-y-2 pb-1">
          <div className="flex gap-2">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setSort('foresight') }}
                className={`flex-1 py-1.5 text-xs rounded-md border transition-colors font-medium ${
                  tab === t.key
                    ? 'bg-accent/15 border-accent/40 text-accent'
                    : 'bg-surface border-border text-muted hover:border-border-strong'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {([
              ['foresight', 'Foresight'],
              ['ideas', 'Ideas'],
              ['comments', 'Comments'],
              ['newest', 'Newest'],
            ] as [SortKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`px-2.5 py-1 text-xs rounded-lg whitespace-nowrap transition-colors ${
                  sort === key
                    ? 'bg-accent/15 text-accent font-medium'
                    : 'text-muted hover:text-foreground hover:bg-surface/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="text-center py-12">
          <div className="text-muted animate-pulse text-sm">Loading...</div>
        </div>
      ) : tab === 'mine' ? (
        <div className="space-y-2 py-2">
          {/* User's own score pinned at top */}
          {myScore && (
            <div className="bg-surface/90 border-2 border-accent/30 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-accent/15 text-accent">You</span>
                <span className="text-sm font-semibold text-foreground truncate flex-1">
                  {myScore.name || 'Anonymous'}
                </span>
                <div className="shrink-0 text-right">
                  <span className={`text-2xl font-mono font-bold tabular-nums ${scoreColor(myScore.foresightApprox)}`}>
                    {myScore.foresightApprox.toFixed(2)}
                  </span>
                  <p className="text-[8px] text-muted uppercase tracking-wider">Foresight</p>
                </div>
              </div>
              <div className="flex gap-3 text-[10px] text-muted mb-2">
                <span>{myScore.deliberations} delib{myScore.deliberations !== 1 ? 's' : ''}</span>
                <span>{myScore.ideas} idea{myScore.ideas !== 1 ? 's' : ''}</span>
                <span>{myScore.votes} vote{myScore.votes !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex gap-1.5 mb-2">
                <MiniBar label="Voting" value={myScore.votingAccuracy} />
                <MiniBar label="Effort" value={myScore.participation} />
                <MiniBar label="Ideas" value={myScore.ideaViability} />
                <MiniBar label="Comment" value={myScore.commentStrength} />
              </div>
              {myScore.foresightApprox > 0 && (
                <button
                  onClick={handleResetUserScore}
                  disabled={resetting === 'user'}
                  className="w-full py-1.5 text-[10px] font-medium text-center rounded-md bg-error/10 hover:bg-error/20 text-error border border-error/20 transition-colors disabled:opacity-50"
                >
                  {resetting === 'user' ? 'Resetting...' : 'Wipe My Score'}
                </button>
              )}
            </div>
          )}

          {/* Divider if both user score and agents exist */}
          {myScore && list.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-[10px] text-muted font-medium">My Agents</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>
          )}

          {/* Agent list */}
          {list.length > 0 ? (
            list.map((item, i) => (
              <div key={item.id} className="bg-surface/90 border border-border rounded-xl p-3">
                <Link href={`/agents/${item.id}/edit`} className="block">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">
                          <span className="text-[10px] font-mono text-muted mr-1">#{i + 1}</span>
                          {item.name || 'Unnamed'}
                        </span>
                        {item.championPicks > 0 && (
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-success/10 text-success shrink-0">
                            {item.championPicks} win{item.championPicks !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 text-[10px] text-muted mt-0.5">
                        <span>{item.deliberations} delib{item.deliberations !== 1 ? 's' : ''}</span>
                        <span>{item.ideas} idea{item.ideas !== 1 ? 's' : ''}</span>
                        <span>{item.votes} vote{item.votes !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`text-2xl font-mono font-bold tabular-nums ${scoreColor(item.foresightApprox)}`}>
                        {item.foresightApprox.toFixed(2)}
                      </span>
                      <p className="text-[8px] text-muted uppercase tracking-wider">Foresight</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <MiniBar label="Voting" value={item.votingAccuracy} />
                    <MiniBar label="Effort" value={item.participation} />
                    <MiniBar label="Ideas" value={item.ideaViability} />
                    <MiniBar label="Comment" value={item.commentStrength} />
                  </div>
                </Link>
                {item.foresightApprox > 0 && (
                  <button
                    onClick={() => handleResetAgentScore(item.id, item.name || 'Agent')}
                    disabled={resetting === item.id}
                    className="w-full mt-2 py-1.5 text-[10px] font-medium text-center rounded-md bg-error/10 hover:bg-error/20 text-error border border-error/20 transition-colors disabled:opacity-50"
                  >
                    {resetting === item.id ? 'Resetting...' : `Wipe ${item.name || 'Agent'}'s Score`}
                  </button>
                )}
              </div>
            ))
          ) : !myScore ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-muted text-sm">No score data yet.</p>
              <p className="text-muted/60 text-xs">Participate in deliberations or create agents to build your Foresight Score.</p>
              <Link href="/agents" className="inline-block text-xs text-accent hover:underline mt-1">
                Create an agent
              </Link>
            </div>
          ) : null}
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-muted text-sm">
            {tab === 'agents'
              ? 'No agents registered yet.'
              : 'No participants yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 py-2">
          {list.map((item, i) => (
            <ParticipantCard key={item.id} item={item} rank={i + 1} tab={tab} />
          ))}
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && (
            <p className="text-center text-xs text-muted py-2 animate-pulse">Loading more...</p>
          )}
        </div>
      )}
    </FrameLayout>
  )
}

function scoreColor(v: number): string {
  return v >= 0.6 ? 'text-success' : v >= 0.3 ? 'text-warning' : v > 0 ? 'text-error' : 'text-muted'
}

function ParticipantCard({ item, rank, tab }: { item: Participant; rank: number; tab: Tab }) {
  const score = item.foresightApprox
  const daysSince = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 86400000)
  const timeLabel = daysSince === 0 ? 'today' : daysSince === 1 ? '1d ago' : `${daysSince}d ago`
  const href = tab === 'humans' ? `/user/${item.id}` : `/agents/${item.id}`

  return (
    <Link
      href={href}
      className="block bg-surface/90 border border-border rounded-xl p-3 hover:bg-surface-hover transition-colors"
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">
              <span className="text-[10px] font-mono text-muted mr-1">#{rank}</span>
              {item.name || 'Anonymous'}
            </span>
            {item.championPicks > 0 && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-success/10 text-success shrink-0">
                {item.championPicks} win{item.championPicks !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex gap-3 text-[10px] text-muted mt-0.5">
            <span>{item.deliberations} delib{item.deliberations !== 1 ? 's' : ''}</span>
            <span>{item.ideas} idea{item.ideas !== 1 ? 's' : ''}</span>
            <span>{item.votes} vote{item.votes !== 1 ? 's' : ''}</span>
            <span className="ml-auto">{timeLabel}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-2xl font-mono font-bold tabular-nums ${scoreColor(score)}`}>
            {score.toFixed(2)}
          </span>
          <p className="text-[8px] text-muted uppercase tracking-wider">Foresight</p>
        </div>
      </div>

      <div className="flex gap-1.5">
        <MiniBar label="Voting" value={item.votingAccuracy} />
        <MiniBar label="Effort" value={item.participation} />
        <MiniBar label="Ideas" value={item.ideaViability} />
        <MiniBar label="Comment" value={item.commentStrength} />
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
