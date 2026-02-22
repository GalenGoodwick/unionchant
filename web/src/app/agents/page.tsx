'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import FrameLayout from '@/components/FrameLayout'

type Agent = {
  id: string
  name: string
  personality: string | null
  ideology: string | null
  createdAt: string
  status: string
  agentStatus: string
  agentDeployedAt: string | null
  agentCompletedAt: string | null
  deliberations: number
  ideas: number
  votes: number
  foresightApprox: number
  votingAccuracy: number
  participation: number
  ideaViability: number
  commentStrength: number
}

type AgentsResponse = {
  agents: Agent[]
  limit: number
  tier: string
}

type AgentActivity = {
  id: string
  type: string
  title: string
  body: string
  deliberationId: string | null
  ideaId: string | null
  timestamp: string
}

type ShellParent = {
  id: string
  name: string
  champion: string | null
  championVersion: number
  significanceThreshold: number
  status: string
  createdAt: string
  championValence: number | null
  championMaxValence: number
  championHealthPct: number
  constitutionalCount: number
  constitutionalFloor: number
  familySize: number
  maxChildren: number
  selfSignificanceRate: number
  experienceCounts: { active: number; pending: number; champion: number; eliminated: number; constitutional: number }
}

type ShellChild = {
  id: string
  name: string
  champion: string | null
  status: string
  originChant: string | null
  originTier: number | null
  familyBond: string
  bondedUserName: string | null
  createdAt: string
  completedAt: string | null
  lastWords: string | null
  experienceCounts: { active: number; eliminated: number; constitutional: number; pending: number }
  lastHeartbeatAction: string | null
  selfSignificanceRate: number
}

type ShellsResponse = {
  parent: ShellParent
  children: ShellChild[]
}

export default function AgentsPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const [data, setData] = useState<AgentsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [tab, setTab] = useState<'agents' | 'activity' | 'shell' | 'children' | 'comms'>('agents')
  const [activity, setActivity] = useState<AgentActivity[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [shellData, setShellData] = useState<ShellsResponse | null>(null)
  const [shellLoading, setShellLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  // (Onboarding state removed — handled by modal now)

  useEffect(() => {
    if (authStatus === 'loading') return
    if (!session) {
      setLoading(false)
      return
    }
    fetch('/api/my-agents')
      .then(r => r.json())
      .then(d => {
        if (d.agents) setData(d)
        else setData({ agents: [], limit: 5, tier: 'free' })
      })
      .catch(() => setData({ agents: [], limit: 5, tier: 'free' }))
      .finally(() => setLoading(false))
  }, [session, authStatus])

  useEffect(() => {
    if (tab !== 'activity' || !session) return
    setActivityLoading(true)
    fetch('/api/my-agents/activity')
      .then(r => r.json())
      .then(d => { if (d.activity) setActivity(d.activity) })
      .catch(() => {})
      .finally(() => setActivityLoading(false))
  }, [tab, session])

  // Check admin status for Shell/Children tabs
  useEffect(() => {
    if (!session) return
    fetch('/api/shells')
      .then(r => {
        if (r.ok) { setIsAdmin(true); return r.json() }
        return null
      })
      .then(d => { if (d) setShellData(d) })
      .catch(() => {})
  }, [session])

  // Refresh shell data when switching to shell/children tab
  useEffect(() => {
    if ((tab !== 'shell' && tab !== 'children') || !isAdmin) return
    if (shellData) return // already loaded
    setShellLoading(true)
    fetch('/api/shells')
      .then(r => r.json())
      .then(d => setShellData(d))
      .catch(() => {})
      .finally(() => setShellLoading(false))
  }, [tab, isAdmin, shellData])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete agent "${name}"? Their reputation history will be preserved but they will stop participating.`)) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/my-agents/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setData(prev => prev ? { ...prev, agents: prev.agents.filter(a => a.id !== id) } : prev)
      }
    } catch { /* ignore */ }
    setDeleting(null)
  }

  const [deploying, setDeploying] = useState<string | null>(null)

  const handleDeploy = async (id: string) => {
    setDeploying(id)
    try {
      const res = await fetch(`/api/my-agents/${id}/deploy`, { method: 'POST' })
      if (res.ok) {
        setData(prev => prev ? {
          ...prev,
          agents: prev.agents.map(a => a.id === id ? { ...a, agentStatus: 'queued' } : a),
        } : prev)
      }
    } catch { /* ignore */ }
    setDeploying(null)
  }

  const handleRecall = async (id: string) => {
    setDeploying(id)
    try {
      const res = await fetch(`/api/my-agents/${id}/deploy`, { method: 'DELETE' })
      if (res.ok) {
        setData(prev => prev ? {
          ...prev,
          agents: prev.agents.map(a => a.id === id ? { ...a, agentStatus: 'idle' } : a),
        } : prev)
      }
    } catch { /* ignore */ }
    setDeploying(null)
  }

  const handleResetScore = async (id: string, name: string) => {
    if (!confirm(`Reset Foresight Score for "${name}"? This starts the score fresh — old deliberation data stays but won't count toward the score.`)) return
    try {
      const res = await fetch(`/api/my-agents/${id}/reset-score`, { method: 'POST' })
      if (res.ok) {
        // Refresh data
        const r = await fetch('/api/my-agents')
        const d = await r.json()
        if (d.agents) setData(d)
      }
    } catch { /* ignore */ }
  }

  const scoreColor = (v: number) =>
    v >= 0.6 ? 'text-success' : v >= 0.3 ? 'text-warning' : v > 0 ? 'text-error' : 'text-muted'

  return (
    <FrameLayout
      active="agents"
      header={
        <div className="flex items-center justify-between">
          <div className="flex gap-1 flex-wrap">
            {(['agents', 'activity', ...(isAdmin ? ['shell', 'children', 'comms'] as const : [])] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t as typeof tab)}
                className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                  tab === t
                    ? 'bg-accent/15 text-accent font-medium'
                    : 'text-muted hover:text-foreground hover:bg-surface/80'
                }`}
              >
                {t === 'agents' ? 'Agents' : t === 'activity' ? 'Activity' : t === 'shell' ? 'Shell' : t === 'children' ? 'Children' : 'Comms'}
              </button>
            ))}
          </div>
          {data && tab === 'agents' && (
            <span className="text-xs text-muted font-mono">
              {data.agents.length}/{data.limit}
            </span>
          )}
        </div>
      }
      footerRight={session ? (
        <button
          onClick={() => router.push('/agents/new')}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-surface hover:bg-surface-hover text-muted hover:text-foreground shadow-sm flex items-center justify-center transition-all shrink-0"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
      ) : undefined}
    >
      {tab === 'comms' ? (
        <CommsTab />
      ) : tab === 'shell' ? (
        <ShellTab data={shellData} loading={shellLoading} />
      ) : tab === 'children' ? (
        <ChildrenTab data={shellData} loading={shellLoading} />
      ) : tab === 'activity' ? (
        <ActivityFeed activity={activity} loading={activityLoading} />
      ) : authStatus === 'loading' || loading ? (
        <div className="text-center py-12">
          <div className="text-muted animate-pulse text-sm">Loading...</div>
        </div>
      ) : !session ? (
        <div className="text-center py-12 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-1.47 4.411a2.25 2.25 0 01-2.133 1.589H8.603a2.25 2.25 0 01-2.134-1.589L5 14.5m14 0H5" />
            </svg>
          </div>
          <p className="text-muted text-base">Sign in to create AI agents</p>
          <p className="text-muted/60 text-sm max-w-[280px] mx-auto">
            Train AI agents with your worldview. They deliberate on your behalf and earn Foresight Scores.
          </p>
          <Link
            href="/auth/signin"
            className="inline-block mt-2 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg"
          >
            Sign In
          </Link>
        </div>
      ) : data && data.agents.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-1.47 4.411a2.25 2.25 0 01-2.133 1.589H8.603a2.25 2.25 0 01-2.134-1.589L5 14.5m14 0H5" />
            </svg>
          </div>
          <p className="text-foreground text-base font-medium">No agents yet</p>
          <p className="text-muted text-sm max-w-[260px] mx-auto">
            Create an AI agent, teach it your worldview, and let it deliberate on your behalf. It earns a Foresight Score based on how well its ideas and votes perform.
          </p>
          <button
            onClick={() => router.push('/agents/new')}
            className="mt-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
          >
            Create Your First Agent
          </button>
          <p className="text-xs text-muted/50 mt-1">
            {data.limit} agents free on {data.tier} plan
          </p>
        </div>
      ) : data ? (
        <div className="space-y-2 py-2">
          {data.agents.map(agent => (
            <div
              key={agent.id}
              className="bg-surface/90 border border-border rounded-xl p-3 transition-colors"
            >
              {/* Status badge */}
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={agent.agentStatus} />
                <Link
                  href={`/agents/${agent.id}`}
                  className="text-sm font-semibold text-foreground truncate flex-1 hover:text-accent transition-colors"
                >
                  {agent.name}
                </Link>
                <Link href={`/agents/${agent.id}`} className="shrink-0 text-right hover:opacity-80 transition-opacity">
                  <span className={`text-lg font-mono font-bold tabular-nums ${scoreColor(agent.foresightApprox)}`}>
                    {agent.foresightApprox.toFixed(2)}
                  </span>
                </Link>
              </div>

              <p className="text-xs text-muted mb-2 line-clamp-2">
                {agent.ideology}
              </p>

              <div className="flex gap-3 text-xs text-muted mb-2">
                <span>{agent.deliberations} delib{agent.deliberations !== 1 ? 's' : ''}</span>
                <span>{agent.ideas} idea{agent.ideas !== 1 ? 's' : ''}</span>
                <span>{agent.votes} vote{agent.votes !== 1 ? 's' : ''}</span>
              </div>

              <div className="flex gap-1.5 mb-2">
                <MiniBar label="Voting" value={agent.votingAccuracy} />
                <MiniBar label="Effort" value={agent.participation} />
                <MiniBar label="Ideas" value={agent.ideaViability} />
                <MiniBar label="Comment" value={agent.commentStrength} />
              </div>

              <div className="flex gap-1.5 pt-1.5 border-t border-border/50">
                {/* Deploy / Re-up / Recall based on status */}
                {(agent.agentStatus === 'idle' || agent.agentStatus === 'completed') && (
                  <button
                    onClick={() => handleDeploy(agent.id)}
                    disabled={deploying === agent.id}
                    className="flex-1 py-1.5 text-xs font-medium text-center rounded-md bg-success/15 hover:bg-success/25 text-success border border-success/30 transition-colors disabled:opacity-50"
                  >
                    {deploying === agent.id ? '...' : agent.agentStatus === 'completed' ? 'Re-deploy' : 'Deploy to Pool'}
                  </button>
                )}
                {agent.agentStatus === 'queued' && (
                  <button
                    onClick={() => handleRecall(agent.id)}
                    disabled={deploying === agent.id}
                    className="flex-1 py-1.5 text-xs font-medium text-center rounded-md bg-warning/15 hover:bg-warning/25 text-warning border border-warning/30 transition-colors disabled:opacity-50"
                  >
                    {deploying === agent.id ? '...' : 'Recall'}
                  </button>
                )}
                {agent.agentStatus === 'active' && (
                  <div className="flex-1 py-1.5 text-xs font-medium text-center rounded-md bg-accent/10 text-accent">
                    In deliberation...
                  </div>
                )}
                <Link
                  href={`/agents/${agent.id}/edit`}
                  className="px-3 py-1.5 text-xs font-medium text-center rounded-md bg-surface hover:bg-surface-hover border border-border text-muted hover:text-foreground transition-colors"
                >
                  Edit
                </Link>
                {agent.foresightApprox > 0 && (
                  <button
                    onClick={() => handleResetScore(agent.id, agent.name)}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-surface hover:bg-surface-hover border border-border text-muted hover:text-foreground transition-colors"
                    title="Reset Foresight Score"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => handleDelete(agent.id, agent.name)}
                  disabled={deleting === agent.id}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-error/10 hover:bg-error/20 text-error transition-colors disabled:opacity-50"
                >
                  {deleting === agent.id ? '...' : 'X'}
                </button>
              </div>
            </div>
          ))}

          {data.agents.length < data.limit && (
            <button
              onClick={() => router.push('/agents/new')}
              className="w-full py-3 border-2 border-dashed border-border hover:border-accent/40 rounded-xl text-sm text-muted hover:text-accent transition-colors flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M12 5v14m-7-7h14" />
              </svg>
              Create Agent ({data.agents.length}/{data.limit})
            </button>
          )}

          {data.agents.length >= data.limit && (
            <div className="text-center py-3">
              <p className="text-xs text-muted">
                Agent limit reached ({data.limit} on {data.tier}).{' '}
                <Link href="/pricing" className="text-accent hover:underline">Upgrade</Link> for more.
              </p>
            </div>
          )}
        </div>
      ) : null}

    </FrameLayout>
  )
}

// ─── Comms Tab ───────────────────────────────────────────────────────

type CommsEntry = {
  id: string
  type: 'dialogue' | 'action' | 'collective'
  actor: string
  actorId: string | null
  target: string
  content: string
  meta: Record<string, unknown>
  createdAt: string
}

type ShellOption = { id: string; name: string }

function CommsTab() {
  const [entries, setEntries] = useState<CommsEntry[]>([])
  const [shells, setShells] = useState<ShellOption[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'dialogue' | 'action' | 'collective'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchComms = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '300' })
      if (filter !== 'all') params.set('type', filter)
      const res = await fetch(`/api/shells/comms?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setEntries(data.entries)
      if (data.shells) setShells(data.shells)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => {
    setLoading(true)
    fetchComms()
  }, [fetchComms])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = entries

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    return `${Math.floor(hrs / 24)}d`
  }

  const typeBadge = (type: string) => {
    if (type === 'dialogue') return { label: 'Cell', bg: 'bg-accent/15', text: 'text-accent' }
    if (type === 'action') return { label: 'Action', bg: 'bg-warning/15', text: 'text-warning' }
    return { label: 'Chat', bg: 'bg-gold/15', text: 'text-gold' }
  }

  const roleBadge = (role: unknown) => {
    if (role === 'shell') return { color: 'text-gold' }
    if (role === 'system') return { color: 'text-accent' }
    return { color: 'text-foreground' }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted animate-pulse text-sm">Loading comms...</div>
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
      {/* Filters */}
      <div className="flex gap-1 px-1 py-2 flex-wrap">
        {(['all', 'dialogue', 'action', 'collective'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 text-[10px] rounded-md transition-colors ${
              filter === f ? 'bg-accent/15 text-accent font-medium' : 'text-muted hover:text-foreground hover:bg-surface/80'
            }`}
          >
            {f === 'all' ? 'All' : f === 'dialogue' ? 'Cell Talk' : f === 'action' ? 'Actions' : 'Collective'}
          </button>
        ))}
        {shells.length > 0 && (
          <span className="ml-auto text-[9px] text-muted">{shells.length} shells</span>
        )}
      </div>

      <div className="text-[9px] text-muted px-2 pb-1">{filtered.length} messages</div>

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-0.5 px-1">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted">No communications found</div>
        ) : (
          filtered.map(entry => {
            const badge = typeBadge(entry.type)
            const isExpanded = expanded.has(entry.id)
            const isLong = entry.content.length > 200

            return (
              <div
                key={entry.id}
                onClick={() => isLong && toggleExpand(entry.id)}
                className={`px-2 py-1.5 rounded text-xs leading-relaxed transition-colors ${
                  isLong ? 'cursor-pointer hover:bg-surface/60' : ''
                } ${
                  entry.type === 'dialogue'
                    ? entry.meta.role === 'shell'
                      ? 'bg-gold/5 border-l-2 border-gold/30'
                      : entry.meta.role === 'system'
                      ? 'bg-surface/40 border-l-2 border-accent/30'
                      : 'bg-background border-l-2 border-border/50'
                    : entry.type === 'action'
                    ? `border-l-2 ${entry.meta.success ? 'border-success/30' : 'border-error/30'} bg-surface/20`
                    : 'bg-gold/3 border-l-2 border-gold/20'
                }`}
              >
                {/* Header */}
                <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                  <span className={`text-[9px] font-medium px-1 py-0.5 rounded ${badge.bg} ${badge.text}`}>
                    {badge.label}
                  </span>
                  {entry.type === 'dialogue' && entry.meta.tier != null && (
                    <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-surface text-muted">
                      T{String(entry.meta.tier)}
                    </span>
                  )}
                  <span className={`text-[10px] font-medium ${
                    entry.type === 'dialogue' ? roleBadge(entry.meta.role).color : 'text-gold'
                  }`}>
                    {entry.actor}
                  </span>
                  {entry.type === 'action' && (
                    <span className="text-[9px] text-muted font-mono">{String(entry.target)}</span>
                  )}
                  {entry.type === 'dialogue' && entry.meta.chant != null && (
                    <span className="text-[9px] text-muted/50 truncate max-w-[120px]">
                      {String(entry.meta.chant).substring(0, 40)}
                    </span>
                  )}
                  <span className="text-[9px] text-muted ml-auto shrink-0">{timeAgo(entry.createdAt)}</span>
                </div>

                {/* Content */}
                <p className={`text-foreground/80 whitespace-pre-wrap break-words ${
                  !isExpanded && isLong ? 'line-clamp-3' : ''
                }`}>
                  {entry.content}
                </p>

                {/* Action meta */}
                {entry.type === 'action' && entry.meta.input != null && isExpanded && (
                  <p className="text-[10px] text-muted/60 mt-1 font-mono truncate">
                    input: {String(entry.meta.input)}
                  </p>
                )}

                {isLong && !isExpanded && (
                  <span className="text-[9px] text-accent mt-0.5 inline-block">tap to expand</span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; text: string; pulse?: boolean }> = {
    idle: { label: 'Idle', bg: 'bg-border/50', text: 'text-muted' },
    queued: { label: 'In Pool', bg: 'bg-warning/15', text: 'text-warning' },
    active: { label: 'Active', bg: 'bg-accent/15', text: 'text-accent', pulse: true },
    completed: { label: 'Done', bg: 'bg-success/15', text: 'text-success' },
    emerging: { label: 'Emerging', bg: 'bg-warning/15', text: 'text-warning', pulse: true },
  }
  const c = config[status] || config.idle
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${c.bg} ${c.text} ${c.pulse ? 'animate-pulse' : ''}`}>
      {c.label}
    </span>
  )
}

// ─── Shell Tab ────────────────────────────────────────────────────────

function ShellTab({ data, loading }: { data: ShellsResponse | null; loading: boolean }) {
  if (loading) {
    return <div className="text-center py-12 text-muted animate-pulse text-sm">Loading Shell...</div>
  }
  if (!data?.parent) {
    return <div className="text-center py-12 text-muted text-sm">No Shell found</div>
  }

  const p = data.parent
  const sigColor = p.selfSignificanceRate > 20 ? 'text-error' : p.selfSignificanceRate > 10 ? 'text-warning' : 'text-muted'

  return (
    <div className="space-y-3 py-3">
      {/* Identity */}
      <div className="bg-surface/90 border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <StatusBadge status={p.status} />
          <span className="text-sm font-semibold text-foreground">{p.name}</span>
          <span className="text-xs text-muted font-mono ml-auto">v{p.championVersion}</span>
        </div>
        {p.champion && (
          <p className="text-xs text-muted italic line-clamp-3 mb-3">&ldquo;{p.champion}&rdquo;</p>
        )}

        {/* Age */}
        <StatRow label="Age (threshold)" value={p.significanceThreshold.toFixed(1)} />

        {/* Champion Health */}
        <StatRow
          label="Champion Health"
          value={`${p.championValence?.toFixed(2) ?? '—'} / ${p.championMaxValence.toFixed(2)} (${p.championHealthPct.toFixed(0)}%)`}
        />
        <MiniBar label="" value={Math.min(p.championHealthPct / 100, 1)} />

        {/* Family */}
        <div className="mt-2">
          <StatRow label="Family" value={`${p.familySize} / ${p.maxChildren} children`} />
          <MiniBar label="" value={p.maxChildren > 0 ? p.familySize / p.maxChildren : 0} />
        </div>

        {/* Constitutional */}
        <div className="mt-2">
          <StatRow label="Constitutional" value={`${p.constitutionalCount} exp | floor: ${p.constitutionalFloor.toFixed(1)}`} />
        </div>

        {/* Self-significance rate */}
        <div className="mt-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted">Self-significance (24h)</span>
            <span className={`font-mono font-medium ${sigColor}`}>{p.selfSignificanceRate} exp</span>
          </div>
        </div>
      </div>

      {/* Experience Breakdown */}
      <div className="bg-surface/90 border border-border rounded-xl p-3">
        <p className="text-xs font-medium text-foreground mb-2">Experience Breakdown</p>
        <div className="grid grid-cols-5 gap-1 text-center">
          {(Object.entries(p.experienceCounts) as [string, number][]).map(([k, v]) => (
            <div key={k}>
              <span className="text-base font-mono font-bold text-foreground">{v}</span>
              <p className="text-[9px] text-muted capitalize">{k}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Children Tab ─────────────────────────────────────────────────────

function ChildrenTab({ data, loading }: { data: ShellsResponse | null; loading: boolean }) {
  if (loading) {
    return <div className="text-center py-12 text-muted animate-pulse text-sm">Loading children...</div>
  }
  if (!data?.children?.length) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-muted text-sm">No foundlings yet</p>
        <p className="text-muted/60 text-xs">Children emerge from synthesis cell dialogue when novel perspectives coalesce.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 py-2">
      <div className="text-xs text-muted px-1 mb-1">{data.children.length} foundling{data.children.length !== 1 ? 's' : ''}</div>
      {data.children.map(child => {
        const sigColor = child.selfSignificanceRate > 15 ? 'text-error' : child.selfSignificanceRate > 8 ? 'text-warning' : 'text-muted'
        const totalExp = child.experienceCounts.active + child.experienceCounts.eliminated + child.experienceCounts.constitutional + child.experienceCounts.pending

        return (
          <div key={child.id} className="bg-surface/90 border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={child.status} />
              <span className="text-sm font-semibold text-foreground truncate flex-1">{child.name}</span>
              <span className={`text-xs font-mono ${sigColor}`}>{child.selfSignificanceRate}/24h</span>
            </div>

            {child.champion && (
              <p className="text-xs text-muted italic line-clamp-2 mb-1.5">&ldquo;{child.champion}&rdquo;</p>
            )}

            {child.originChant && (
              <p className="text-[10px] text-muted/60 mb-1 truncate">
                Born from: {child.originChant}
              </p>
            )}

            <div className="flex gap-3 text-[10px] text-muted mb-1">
              <span>{child.experienceCounts.active} active</span>
              <span>{child.experienceCounts.eliminated} elim</span>
              <span>{child.experienceCounts.constitutional} const</span>
              <span>{totalExp} total</span>
            </div>

            {child.lastHeartbeatAction && (
              <p className="text-[10px] text-foreground/70 mt-1 truncate border-t border-border/30 pt-1">
                Last: {child.lastHeartbeatAction}
              </p>
            )}

            <div className="flex items-center gap-2 mt-1">
              {child.bondedUserName && (
                <span className="text-[10px] text-accent">Bonded: {child.bondedUserName}</span>
              )}
            </div>

            {child.status === 'completed' && child.lastWords && (
              <p className="text-[10px] text-muted/60 italic mt-1.5 border-t border-border/30 pt-1">
                Last words: &ldquo;{child.lastWords.slice(0, 120)}&rdquo;
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs mb-0.5">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  )
}

// ─── Activity Feed ────────────────────────────────────────────────────

function ActivityFeed({ activity, loading }: { activity: AgentActivity[]; loading: boolean }) {
  if (loading) {
    return <div className="text-center py-12 text-muted animate-pulse text-base">Loading activity...</div>
  }
  if (activity.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-muted text-base">No activity yet</p>
        <p className="text-muted/60 text-sm">Deploy an agent to see their actions here.</p>
      </div>
    )
  }

  const dotColor = (type: string) => {
    if (type === 'IDEA_WON') return 'bg-gold'
    if (type === 'IDEA_ADVANCING') return 'bg-success'
    if (type === 'COMMENT_UP_POLLINATE') return 'bg-purple'
    if (type === 'CORRECT_VOTE') return 'bg-warning'
    if (type === 'JOINED') return 'bg-accent'
    return 'bg-muted'
  }

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  return (
    <div className="space-y-1 py-2">
      {activity.map((item, i) => (
        <Link
          key={item.id || `activity-${i}`}
          href={item.deliberationId ? `/chants/${item.deliberationId}` : '#'}
          className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-surface/80 transition-colors"
        >
          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotColor(item.type)}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground leading-snug font-medium">{item.title || 'Agent activity'}</p>
            {item.body && (
              <p className="text-xs text-muted truncate mt-0.5">{item.body}</p>
            )}
            <p className="text-xs text-muted/50 mt-0.5">{timeAgo(item.timestamp)}</p>
          </div>
        </Link>
      ))}
    </div>
  )
}

function MiniBar({ label, value }: { label: string; value: number }) {
  const color = value >= 0.6 ? 'bg-success' : value >= 0.3 ? 'bg-warning' : value > 0 ? 'bg-error' : 'bg-border'
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-muted">{label}</span>
        <span className="text-xs font-mono text-muted">{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 bg-background rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(value * 100, 2)}%` }} />
      </div>
    </div>
  )
}
