'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { phaseLabel } from '@/lib/labels'
import FrameLayout from '@/components/FrameLayout'

interface Analytics {
  question: string
  phase: string
  currentTier: number
  funnel: { views: number; joined: number; submitted: number; voted: number }
  participation: {
    medianVoteTimeMs: number | null
    dropoutRate: number
    timeoutRate: number
    avgCommentsPerCell: number
  }
  tiers: {
    tier: number
    cells: number
    totalVotes: number
    avgVotesPerCell: number
    durationMs: number | null
    timeouts: number
    completedNaturally: number
  }[]
  ideas: {
    id: string; text: string; status: string; tier: number
    totalVotes: number; losses: number; isChampion: boolean
  }[]
  timeline: { event: string; timestamp: string; detail?: string }[]
}

function formatDuration(ms: number | null): string {
  if (!ms) return '—'
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

function formatPct(n: number): string {
  return `${Math.round(n * 100)}%`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }
    if (status === 'authenticated') {
      fetch(`/api/deliberations/${id}/analytics`)
        .then(res => {
          if (!res.ok) throw new Error(res.status === 404 ? 'Not found' : 'Failed to load')
          return res.json()
        })
        .then(setData)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [status, id, router])

  if (status === 'loading' || loading) {
    return (
      <FrameLayout active="chants" showBack>
        <div className="py-6">
          <div className="animate-pulse h-5 bg-surface rounded w-1/3" />
        </div>
      </FrameLayout>
    )
  }

  if (error || !data) {
    return (
      <FrameLayout active="chants" showBack>
        <div className="py-6">
          <div className="bg-error-bg text-error p-3 rounded-lg text-xs">{error || 'Not found'}</div>
        </div>
      </FrameLayout>
    )
  }

  const phaseColors: Record<string, string> = {
    SUBMISSION: 'bg-accent text-white',
    VOTING: 'bg-warning text-white',
    ACCUMULATING: 'bg-purple text-white',
    COMPLETED: 'bg-success text-white',
  }

  const funnelSteps = [
    { label: 'Views', value: data.funnel.views },
    { label: 'Joined', value: data.funnel.joined },
    { label: 'Submitted', value: data.funnel.submitted },
    { label: 'Voted', value: data.funnel.voted },
  ]

  const statusColors: Record<string, string> = {
    WINNER: 'text-success',
    ADVANCING: 'text-accent',
    ELIMINATED: 'text-error',
    IN_VOTING: 'text-warning',
    DEFENDING: 'text-orange',
    SUBMITTED: 'text-foreground',
    PENDING: 'text-muted',
    BENCHED: 'text-muted',
    RETIRED: 'text-muted',
  }

  return (
    <FrameLayout active="chants" showBack>
      <div className="py-3">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-sm font-bold text-foreground">Analytics</h1>
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${phaseColors[data.phase] || 'bg-surface text-muted'}`}>
              {phaseLabel(data.phase)}
            </span>
          </div>
          <p className="text-muted text-xs">{data.question}</p>
        </div>

        {/* Funnel */}
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 mb-3">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Funnel</h2>
          <div className="flex items-end gap-1">
            {funnelSteps.map((step, i) => {
              const maxVal = Math.max(...funnelSteps.map(s => s.value), 1)
              const height = Math.max(20, (step.value / maxVal) * 100)
              const prev = i > 0 ? funnelSteps[i - 1].value : null
              const dropoff = prev && prev > 0 ? ((prev - step.value) / prev) : null
              return (
                <div key={step.label} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-xs font-mono text-foreground font-semibold">{step.value}</div>
                  <div
                    className="w-full bg-accent rounded-t"
                    style={{ height: `${height}px`, opacity: 1 - i * 0.2 }}
                  />
                  <div className="text-[10px] text-muted">{step.label}</div>
                  {dropoff !== null && dropoff > 0 && (
                    <div className="text-[9px] text-error">-{formatPct(dropoff)}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Participation Stats */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-2.5">
            <div className="text-sm font-bold text-foreground font-mono">
              {data.participation.medianVoteTimeMs ? formatDuration(data.participation.medianVoteTimeMs) : '—'}
            </div>
            <div className="text-[10px] text-muted">Median vote time</div>
          </div>
          <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-2.5">
            <div className="text-sm font-bold text-foreground font-mono">
              {formatPct(data.participation.dropoutRate)}
            </div>
            <div className="text-[10px] text-muted">Dropout rate</div>
          </div>
          <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-2.5">
            <div className="text-sm font-bold text-foreground font-mono">
              {formatPct(data.participation.timeoutRate)}
            </div>
            <div className="text-[10px] text-muted">Timeout rate</div>
          </div>
          <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-2.5">
            <div className="text-sm font-bold text-foreground font-mono">
              {Math.round(data.participation.avgCommentsPerCell * 10) / 10}
            </div>
            <div className="text-[10px] text-muted">Avg comments/cell</div>
          </div>
        </div>

        {/* Tier Progression */}
        {data.tiers.length > 0 && (
          <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 mb-3">
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Tier Progression</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted font-medium">Tier</th>
                    <th className="text-right py-2 text-muted font-medium">Cells</th>
                    <th className="text-right py-2 text-muted font-medium">Votes</th>
                    <th className="text-right py-2 text-muted font-medium">Avg/Cell</th>
                    <th className="text-right py-2 text-muted font-medium">Duration</th>
                    <th className="text-right py-2 text-muted font-medium">Timeouts</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tiers.map(t => (
                    <tr key={t.tier} className="border-b border-border last:border-0">
                      <td className="py-2 text-foreground font-medium">Tier {t.tier}</td>
                      <td className="py-2 text-right font-mono text-foreground">{t.cells}</td>
                      <td className="py-2 text-right font-mono text-foreground">{t.totalVotes}</td>
                      <td className="py-2 text-right font-mono text-muted">{t.avgVotesPerCell}</td>
                      <td className="py-2 text-right font-mono text-muted">{formatDuration(t.durationMs)}</td>
                      <td className="py-2 text-right font-mono text-muted">
                        {t.timeouts > 0 ? (
                          <span className="text-warning">{t.timeouts}/{t.cells}</span>
                        ) : (
                          '0'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Idea Leaderboard */}
        {data.ideas.length > 0 && (
          <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 mb-3">
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Idea Leaderboard</h2>
            <div className="space-y-1">
              {data.ideas.slice(0, 10).map((idea, i) => (
                <div
                  key={idea.id}
                  className={`flex items-center gap-2 text-xs p-1.5 rounded ${
                    idea.isChampion ? 'bg-success-bg border border-success' : 'bg-background'
                  }`}
                >
                  <span className="text-muted font-mono w-5 text-right shrink-0">{i + 1}</span>
                  <span className="text-foreground truncate flex-1" title={idea.text}>
                    {idea.text.length > 60 ? idea.text.slice(0, 60) + '...' : idea.text}
                  </span>
                  <span className="font-mono text-foreground shrink-0">{idea.totalVotes} VP</span>
                  <span className="font-mono text-muted shrink-0">T{idea.tier}</span>
                  <span className={`text-xs shrink-0 ${statusColors[idea.status] || 'text-muted'}`}>
                    {idea.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        {data.timeline.length > 0 && (
          <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 mb-3">
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Timeline</h2>
            <div className="space-y-0">
              {data.timeline.map((entry, i) => (
                <div key={i} className="flex gap-3 py-2 border-b border-border last:border-0">
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${
                      entry.event === 'Completed' ? 'bg-success' :
                      entry.event.includes('Tier') ? 'bg-warning' :
                      'bg-accent'
                    }`} />
                    {i < data.timeline.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-foreground font-medium">{entry.event}</div>
                    {entry.detail && (
                      <div className="text-xs text-muted truncate">{entry.detail}</div>
                    )}
                    <div className="text-[10px] text-muted">
                      {new Date(entry.timestamp).toLocaleString()} ({timeAgo(entry.timestamp)})
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </FrameLayout>
  )
}
