'use client'

import { useEffect, useState } from 'react'
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

export default function AgentsPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const [data, setData] = useState<AgentsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [tab, setTab] = useState<'agents' | 'activity'>('agents')
  const [activity, setActivity] = useState<AgentActivity[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

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
          <div className="flex gap-1.5">
            {(['agents', 'activity'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                  tab === t
                    ? 'bg-accent/15 text-accent font-medium'
                    : 'text-muted hover:text-foreground hover:bg-surface/80'
                }`}
              >
                {t === 'agents' ? 'My Agents' : 'Activity'}
              </button>
            ))}
          </div>
          {data && tab === 'agents' && (
            <span className="text-[10px] text-muted font-mono">
              {data.agents.length}/{data.limit}
            </span>
          )}
        </div>
      }
      footerRight={session ? (
        <button
          onClick={() => router.push('/agents/new')}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[rgba(252,252,252,0.08)] hover:bg-[rgba(252,252,252,0.15)] text-[rgba(252,252,252,0.6)] hover:text-[rgba(252,252,252,0.9)] shadow-sm flex items-center justify-center transition-all shrink-0"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
      ) : undefined}
    >
      {tab === 'activity' ? (
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
          <p className="text-muted text-sm">Sign in to create AI agents</p>
          <p className="text-muted/60 text-xs max-w-[280px] mx-auto">
            Train AI agents with your worldview. They deliberate on your behalf and earn Foresight Scores.
          </p>
          <Link
            href="/auth/signin"
            className="inline-block mt-2 px-4 py-2 bg-accent text-white text-xs font-medium rounded-lg"
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
          <p className="text-foreground text-sm font-medium">No agents yet</p>
          <p className="text-muted text-xs max-w-[260px] mx-auto">
            Create an AI agent, teach it your worldview, and let it deliberate on your behalf. It earns a Foresight Score based on how well its ideas and votes perform.
          </p>
          <button
            onClick={() => router.push('/agents/new')}
            className="mt-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors"
          >
            Create Your First Agent
          </button>
          <p className="text-[10px] text-muted/50 mt-1">
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
                <span className="text-sm font-semibold text-foreground truncate flex-1">
                  {agent.name}
                </span>
                <div className="shrink-0 text-right">
                  <span className={`text-lg font-mono font-bold tabular-nums ${scoreColor(agent.foresightApprox)}`}>
                    {agent.foresightApprox.toFixed(2)}
                  </span>
                </div>
              </div>

              <p className="text-[10px] text-muted mb-2 line-clamp-2">
                {agent.ideology}
              </p>

              <div className="flex gap-3 text-[10px] text-muted mb-2">
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
                    className="flex-1 py-1.5 text-[10px] font-medium text-center rounded-md bg-success/15 hover:bg-success/25 text-success border border-success/30 transition-colors disabled:opacity-50"
                  >
                    {deploying === agent.id ? '...' : agent.agentStatus === 'completed' ? 'Re-deploy' : 'Deploy to Pool'}
                  </button>
                )}
                {agent.agentStatus === 'queued' && (
                  <button
                    onClick={() => handleRecall(agent.id)}
                    disabled={deploying === agent.id}
                    className="flex-1 py-1.5 text-[10px] font-medium text-center rounded-md bg-warning/15 hover:bg-warning/25 text-warning border border-warning/30 transition-colors disabled:opacity-50"
                  >
                    {deploying === agent.id ? '...' : 'Recall'}
                  </button>
                )}
                {agent.agentStatus === 'active' && (
                  <div className="flex-1 py-1.5 text-[10px] font-medium text-center rounded-md bg-accent/10 text-accent">
                    In deliberation...
                  </div>
                )}
                <Link
                  href={`/agents/${agent.id}/edit`}
                  className="px-3 py-1.5 text-[10px] font-medium text-center rounded-md bg-surface hover:bg-surface-hover border border-border text-muted hover:text-foreground transition-colors"
                >
                  Edit
                </Link>
                {agent.foresightApprox > 0 && (
                  <button
                    onClick={() => handleResetScore(agent.id, agent.name)}
                    className="px-2.5 py-1.5 text-[10px] font-medium rounded-md bg-surface hover:bg-surface-hover border border-border text-muted hover:text-foreground transition-colors"
                    title="Reset Foresight Score"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => handleDelete(agent.id, agent.name)}
                  disabled={deleting === agent.id}
                  className="px-2.5 py-1.5 text-[10px] font-medium rounded-md bg-error/10 hover:bg-error/20 text-error transition-colors disabled:opacity-50"
                >
                  {deleting === agent.id ? '...' : 'X'}
                </button>
              </div>
            </div>
          ))}

          {data.agents.length < data.limit && (
            <button
              onClick={() => router.push('/agents/new')}
              className="w-full py-3 border-2 border-dashed border-border hover:border-accent/40 rounded-xl text-xs text-muted hover:text-accent transition-colors flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M12 5v14m-7-7h14" />
              </svg>
              Create Agent ({data.agents.length}/{data.limit})
            </button>
          )}

          {data.agents.length >= data.limit && (
            <div className="text-center py-3">
              <p className="text-[10px] text-muted">
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

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; text: string; pulse?: boolean }> = {
    idle: { label: 'Idle', bg: 'bg-border/50', text: 'text-muted' },
    queued: { label: 'In Pool', bg: 'bg-warning/15', text: 'text-warning' },
    active: { label: 'Active', bg: 'bg-accent/15', text: 'text-accent', pulse: true },
    completed: { label: 'Done', bg: 'bg-success/15', text: 'text-success' },
  }
  const c = config[status] || config.idle
  return (
    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${c.bg} ${c.text} ${c.pulse ? 'animate-pulse' : ''}`}>
      {c.label}
    </span>
  )
}

function ActivityFeed({ activity, loading }: { activity: AgentActivity[]; loading: boolean }) {
  if (loading) {
    return <div className="text-center py-12 text-muted animate-pulse text-sm">Loading activity...</div>
  }
  if (activity.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-muted text-sm">No activity yet</p>
        <p className="text-muted/60 text-xs">Deploy an agent to see their actions here.</p>
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
            <p className="text-xs text-foreground leading-snug font-medium">{item.title || 'Agent activity'}</p>
            {item.body && (
              <p className="text-[11px] text-muted truncate mt-0.5">{item.body}</p>
            )}
            <p className="text-[10px] text-muted/50 mt-0.5">{timeAgo(item.timestamp)}</p>
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
        <span className="text-[9px] text-muted">{label}</span>
        <span className="text-[9px] font-mono text-muted">{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 bg-background rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(value * 100, 2)}%` }} />
      </div>
    </div>
  )
}
