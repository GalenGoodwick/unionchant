'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// ── Types matching API response ──
interface AnalyticsData {
  question: string
  description: string | null
  phase: string
  currentTier: number
  champion: { id: string; text: string; author: string } | null
  createdAt: string
  completedAt: string | null
  funnel: { views: number; joined: number; submitted: number; voted: number }
  participation: {
    medianVoteTimeMs: number | null
    dropoutRate: number
    replacementRate: number
    timeoutRate: number
    avgCommentsPerCell: number
    fullParticipationRate: number
    avgXPUtilization: number | null
    zeroDiscussionRate: number
  }
  tiers: {
    tier: number; cells: number; ideasIn: number; ideasOut: number
    totalVotes: number; avgVotesPerCell: number; durationMs: number | null
    timeouts: number; completedNaturally: number
  }[]
  ideas: {
    id: string; text: string; status: string; tier: number
    totalVotes: number; totalXP: number; losses: number; isChampion: boolean
    author: string; perTier: { tier: number; xp: number; votes: number }[]
  }[]
  geography: { zip: string; count: number; pct: number }[]
  representation: { crossDistrictRate: number | null; cellsWithZipData: number }
  viralComments: {
    text: string; author: string; cellId: string; cellTier: number
    spreadCount: number; reachTier: number; upvoteCount: number
  }[]
  mandate: {
    finalXPShares: { ideaId: string; text: string; xp: number; pct: number }[]
    championCellsAppeared: number; championCellsWon: number; cellWinRate: number
    headToHead: { opponentId: string; opponentText: string; wins: number; losses: number }[]
  }
  auditCells: {
    id: string; tier: number; commentCount: number; duration: number | null
    participants: { name: string; zip: string | null; status: string }[]
    ideas: { id: string; text: string; votes: number; xp: number }[]
    dialogue: { speaker: string; text: string; time: string }[]
  }[]
  timeline: { event: string; timestamp: string; detail?: string }[]
  aiAnalysis: {
    objections: { text: string; severity: string }[]
    synergies: { idea: string; synergy: string }[]
    summary: string
  } | null
}

// ── Helpers ──
function formatDuration(ms: number): string {
  const hrs = Math.round(ms / 3600000 * 10) / 10
  if (hrs < 1) return `${Math.round(ms / 60000)}m`
  if (hrs < 48) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

// ── Reusable components ──
function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 text-center">
      <div className={`text-2xl md:text-3xl font-mono font-bold mb-1 ${accent || 'text-foreground'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-muted text-xs uppercase tracking-wider">{label}</div>
      {sub && <div className="text-muted-light text-xs mt-1">{sub}</div>}
    </div>
  )
}

function SectionHeading({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-8">
      <h2 className="text-2xl md:text-3xl font-serif font-bold text-foreground mb-1">{children}</h2>
      {sub && <p className="text-muted text-sm">{sub}</p>}
    </div>
  )
}

function Divider() {
  return <div className="border-t border-border my-12 md:my-16" />
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-muted text-sm text-center py-8">{text}</p>
}

// ── Main page ──
export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCell, setExpandedCell] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<AnalyticsData['aiAnalysis']>(null)

  useEffect(() => {
    fetch(`/api/deliberations/${id}/analytics`)
      .then(r => {
        if (r.status === 401) throw new Error('Sign in required')
        if (r.status === 404) throw new Error('Not found or not the creator')
        if (!r.ok) throw new Error('Failed to load analytics')
        return r.json()
      })
      .then(d => {
        setData(d)
        if (d.aiAnalysis) setAiAnalysis(d.aiAnalysis)
        if (d.auditCells?.[0]) setExpandedCell(d.auditCells[0].id)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const runAISynthesis = useCallback(async () => {
    setAiLoading(true)
    try {
      const r = await fetch(`/api/deliberations/${id}/analytics/synthesize`, { method: 'POST' })
      if (!r.ok) {
        const err = await r.json()
        throw new Error(err.error || 'Failed')
      }
      const result = await r.json()
      setAiAnalysis(result)
    } catch (e) {
      console.error('AI synthesis failed:', e)
    } finally {
      setAiLoading(false)
    }
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-header flex items-center justify-center">
        <div className="text-muted text-sm">Loading analytics...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-header flex items-center justify-center">
        <div className="text-center">
          <p className="text-error text-sm mb-4">{error}</p>
          <Link href="/chants" className="text-accent text-sm hover:underline">&larr; Back to Chants</Link>
        </div>
      </div>
    )
  }

  if (!data) return null

  const d = data
  const maxFunnelVal = Math.max(d.funnel.views, d.funnel.joined, d.funnel.submitted, d.funnel.voted, 1)
  const duration = d.completedAt ? `${daysBetween(d.createdAt, d.completedAt)} days` : 'In progress'
  const totalVotes = d.tiers.reduce((s, t) => s + t.totalVotes, 0)
  const totalCells = d.tiers.reduce((s, t) => s + t.cells, 0)
  const maxTier = d.tiers.length > 0 ? Math.max(...d.tiers.map(t => t.tier)) : 0

  const funnelSteps = [
    { label: 'Page Views', value: d.funnel.views, color: 'var(--color-muted)' },
    { label: 'Joined', value: d.funnel.joined, color: 'var(--color-accent)' },
    { label: 'Submitted Ideas', value: d.funnel.submitted, color: 'var(--color-purple)' },
    { label: 'Cast Votes', value: d.funnel.voted, color: 'var(--color-warning)' },
  ]

  return (
    <div className="min-h-screen bg-header text-foreground">
      {/* ── HEADER ── */}
      <header className="border-b border-border">
        <div className="max-w-[960px] mx-auto px-4 md:px-8 py-6">
          <Link href={`/chants/${id}`} className="text-muted text-sm hover:text-accent transition-colors mb-4 inline-block">&larr; Back to Chant</Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-muted text-xs uppercase tracking-[0.2em] mb-2 font-mono">Deliberation Audit Report</p>
              <h1 className="text-xl md:text-2xl font-serif font-bold text-foreground leading-snug max-w-[600px]">
                {d.question}
              </h1>
            </div>
            <div className="text-right text-sm text-muted shrink-0">
              <div>{formatDate(d.createdAt)}{d.completedAt ? ` \u2014 ${formatDate(d.completedAt)}` : ''}</div>
              <div className="font-mono text-foreground">{duration}</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── CHAMPION ── */}
      {d.champion && (
        <div className="border-b-2 border-gold/30" style={{ background: 'linear-gradient(to right, rgba(251,191,36,0.04), rgba(251,191,36,0.08), rgba(251,191,36,0.04))' }}>
          <div className="max-w-[960px] mx-auto px-4 md:px-8 py-8 text-center">
            <p className="text-gold text-xs uppercase tracking-[0.25em] font-mono mb-3">Winner</p>
            <p className="text-xl md:text-2xl font-serif font-bold text-gold leading-snug max-w-[600px] mx-auto">
              &ldquo;{d.champion.text}&rdquo;
            </p>
            <p className="text-muted text-sm mt-3">
              Emerged from {d.funnel.submitted.toLocaleString()} ideas through {d.tiers.length} tiers by {d.funnel.joined.toLocaleString()} participants
            </p>
          </div>
        </div>
      )}

      <main className="max-w-[960px] mx-auto px-4 md:px-8 py-12">

        {/* ── LEGITIMACY STATS ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <StatCard label="Participants" value={d.funnel.joined} accent="text-accent" />
          <StatCard label="Ideas Submitted" value={d.funnel.submitted} accent="text-purple" />
          <StatCard label="Votes Cast" value={totalVotes} accent="text-warning" />
          <StatCard label="Cells" value={totalCells} />
          <StatCard label="Full Participation" value={`${d.participation.fullParticipationRate}%`} accent="text-success" />
          <StatCard label="Median Response" value={d.participation.medianVoteTimeMs ? formatDuration(d.participation.medianVoteTimeMs) : 'N/A'} />
        </div>

        <Divider />

        {/* ── FUNNEL ── */}
        <SectionHeading sub="How engagement converted from awareness to participation">Participation Funnel</SectionHeading>
        <div className="space-y-2 mb-4">
          {funnelSteps.map((step, i) => {
            const width = Math.max((step.value / maxFunnelVal) * 100, 2)
            const prev = i > 0 ? funnelSteps[i - 1].value : null
            const convRate = prev && prev > 0 ? ((step.value / prev) * 100).toFixed(1) : null
            return (
              <div key={step.label}>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-muted text-xs w-36 md:w-44 shrink-0 text-right">{step.label}</span>
                  <div className="flex-1 relative h-8 bg-surface rounded overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${width}%`, backgroundColor: step.color, opacity: 0.8 }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-xs text-foreground font-semibold">
                      {step.value.toLocaleString()}
                    </span>
                  </div>
                  <span className="text-muted-light text-xs w-14 shrink-0 font-mono">{convRate ? `${convRate}%` : ''}</span>
                </div>
              </div>
            )
          })}
        </div>

        <Divider />

        {/* ── TIER PROGRESSION ── */}
        {d.tiers.length > 0 && (
          <>
            <SectionHeading sub={`How ${d.funnel.submitted.toLocaleString()} ideas narrowed through adversarial deliberation`}>Tier Progression</SectionHeading>
            <div className="overflow-x-auto">
              <div className="flex gap-2 md:gap-3 min-w-[640px] items-end pb-4">
                {d.tiers.map((t) => {
                  const heightPct = d.tiers[0].ideasIn > 0
                    ? Math.max((t.ideasIn / d.tiers[0].ideasIn) * 200, 40)
                    : 60
                  return (
                    <div key={t.tier} className="flex-1 flex flex-col items-center">
                      <div className="w-full relative mb-2">
                        <div className="text-center mb-1">
                          <span className="font-mono text-xs text-muted">{t.ideasIn.toLocaleString()}</span>
                          <span className="text-muted-light text-xs"> &rarr; </span>
                          <span className="font-mono text-xs text-accent">{t.ideasOut.toLocaleString()}</span>
                        </div>
                        <div className="w-full bg-surface border border-border rounded-t relative overflow-hidden" style={{ height: `${heightPct}px` }}>
                          {t.ideasIn > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 bg-accent/20 border-t border-accent/40"
                              style={{ height: `${(t.ideasOut / t.ideasIn) * 100}%` }} />
                          )}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="font-mono text-sm font-bold text-foreground">{t.cells}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-semibold text-foreground">Tier {t.tier}</div>
                        <div className="text-xs text-muted">{t.durationMs ? formatDuration(t.durationMs) : 'active'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <Divider />
          </>
        )}

        {/* ── GEOGRAPHIC DISTRIBUTION ── */}
        {d.geography.length > 0 && d.geography[0].zip !== 'Unset' && (
          <>
            <SectionHeading sub="Participation by area">Geographic Distribution</SectionHeading>
            <div className="space-y-3">
              {d.geography.slice(0, 10).map((g) => (
                <div key={g.zip} className="flex items-center gap-3">
                  <span className="text-sm text-muted w-28 md:w-36 shrink-0 text-right font-mono">{g.zip}</span>
                  <div className="flex-1 h-7 bg-surface rounded overflow-hidden relative">
                    <div className="h-full rounded bg-accent/60" style={{ width: `${g.pct}%` }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-xs text-foreground">{g.count.toLocaleString()}</span>
                  </div>
                  <span className="text-muted font-mono text-xs w-12 shrink-0">{g.pct}%</span>
                </div>
              ))}
            </div>
            {d.representation.crossDistrictRate != null && (
              <div className="mt-4 bg-success-bg/50 border border-success-border/30 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <span className="text-success text-lg leading-none mt-0.5">&#10003;</span>
                  <div>
                    <p className="text-sm text-foreground font-medium">Cross-district mixing: {d.representation.crossDistrictRate}%</p>
                    <p className="text-xs text-muted mt-1">
                      {d.representation.crossDistrictRate}% of cells with zip data had 3+ distinct areas represented.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <Divider />
          </>
        )}

        {/* ── TOP IDEAS JOURNEY ── */}
        <SectionHeading sub={`The ${Math.min(d.ideas.length, 10)} ideas that advanced furthest`}>Idea Journey</SectionHeading>
        {d.ideas.length === 0 ? <EmptyState text="No ideas submitted yet" /> : (
          <div className="space-y-2 overflow-x-auto">
            {d.ideas.slice(0, 10).map((idea, rank) => (
              <div key={idea.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${idea.isChampion ? 'border-gold/40 bg-gold-bg' : 'border-border bg-surface/50'}`}>
                <span className={`font-mono text-sm font-bold w-6 shrink-0 ${idea.isChampion ? 'text-gold' : 'text-muted'}`}>{rank + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${idea.isChampion ? 'text-gold font-semibold' : 'text-foreground'}`}>{idea.text}</p>
                  <div className="flex items-center gap-1 mt-1.5">
                    {Array.from({ length: maxTier }).map((_, i) => {
                      const tierData = idea.perTier.find(t => t.tier === i + 1)
                      const active = !!tierData
                      const isWin = idea.isChampion && i + 1 === maxTier
                      return (
                        <div key={i} className="flex items-center gap-1">
                          <div className={`w-6 h-5 rounded text-[10px] font-mono flex items-center justify-center font-semibold ${
                            isWin ? 'bg-gold/30 text-gold border border-gold/50'
                            : active ? 'bg-accent/20 text-accent border border-accent/30'
                            : 'bg-surface text-muted-light border border-border'
                          }`}>
                            {active ? tierData.votes : ''}
                          </div>
                          {i < maxTier - 1 && (
                            <span className={`text-[8px] ${active && idea.perTier.find(t => t.tier === i + 2) ? 'text-accent' : 'text-border'}`}>&rarr;</span>
                          )}
                        </div>
                      )
                    })}
                    <span className="text-muted-light text-[10px] ml-1 font-mono">T{idea.tier}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Divider />

        {/* ── ENGAGEMENT QUALITY ── */}
        <SectionHeading sub="Metrics proving deliberation depth">Engagement Quality</SectionHeading>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xl font-mono font-bold mb-1 text-success">{d.participation.avgCommentsPerCell}</div>
            <div className="text-muted text-xs">Avg comments per cell</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xl font-mono font-bold mb-1 text-success">{d.participation.fullParticipationRate}%</div>
            <div className="text-muted text-xs">Full participation cells</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xl font-mono font-bold mb-1 text-foreground">{d.participation.zeroDiscussionRate}%</div>
            <div className="text-muted text-xs">Ideas with zero discussion</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xl font-mono font-bold mb-1 text-foreground">{d.participation.avgXPUtilization != null ? `${d.participation.avgXPUtilization}%` : 'N/A'}</div>
            <div className="text-muted text-xs">Avg XP utilization</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xl font-mono font-bold mb-1 text-foreground">{(d.participation.dropoutRate * 100).toFixed(1)}%</div>
            <div className="text-muted text-xs">Dropout rate</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xl font-mono font-bold mb-1 text-foreground">{(d.participation.replacementRate * 100).toFixed(1)}%</div>
            <div className="text-muted text-xs">Replacement rate</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xl font-mono font-bold mb-1 text-foreground">{(d.participation.timeoutRate * 100).toFixed(1)}%</div>
            <div className="text-muted text-xs">Timeout rate</div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-xl font-mono font-bold mb-1 text-foreground">{d.participation.medianVoteTimeMs ? formatDuration(d.participation.medianVoteTimeMs) : 'N/A'}</div>
            <div className="text-muted text-xs">Median deliberation time</div>
          </div>
        </div>

        <Divider />

        {/* ── VIRAL COMMENTS ── */}
        {d.viralComments.length > 0 && (
          <>
            <SectionHeading sub="Comments that spread across cells through up-pollination">Most Influential Arguments</SectionHeading>
            <div className="space-y-3">
              {d.viralComments.slice(0, 5).map((c, i) => (
                <div key={i} className="bg-surface border border-border rounded-lg p-4">
                  <p className="text-sm text-foreground leading-relaxed mb-3 italic">&ldquo;{c.text}&rdquo;</p>
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted">
                    <span>, {c.author}, Tier {c.cellTier}</span>
                    <div className="flex gap-4">
                      <span>Spread to <span className="text-accent font-mono font-semibold">{c.spreadCount}</span> cells</span>
                      <span>Reached <span className="text-purple font-mono font-semibold">Tier {c.reachTier}</span></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Divider />
          </>
        )}

        {/* ── DECISION CONFIDENCE ── */}
        {d.mandate.finalXPShares.length > 0 && (
          <>
            <SectionHeading sub="Strength of mandate, head-to-head record, and what to prepare for">Decision Confidence</SectionHeading>

            {/* Final vote share */}
            <div className="mb-6">
              <p className="text-xs text-muted uppercase tracking-wider mb-3">Final tier XP allocation</p>
              <div className="flex h-10 rounded-lg overflow-hidden mb-2">
                {d.mandate.finalXPShares.slice(0, 4).map((share, i) => {
                  const colors = ['bg-gold/60', 'bg-accent/40', 'bg-purple/30', 'bg-surface']
                  return (
                    <div key={share.ideaId} className={`${colors[i]} flex items-center justify-center`} style={{ width: `${share.pct}%` }}>
                      {share.pct > 8 && <span className="font-mono text-xs font-bold text-foreground">{share.pct}%</span>}
                    </div>
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                {d.mandate.finalXPShares.slice(0, 4).map((share, i) => {
                  const dots = ['bg-gold/60', 'bg-accent/40', 'bg-purple/30', 'bg-surface']
                  return (
                    <span key={share.ideaId}>
                      <span className={`inline-block w-3 h-3 ${dots[i]} rounded mr-1 align-middle`} />
                      {share.text.slice(0, 40)}{share.text.length > 40 ? '...' : ''}
                    </span>
                  )
                })}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="bg-surface border border-border rounded-lg p-5">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-mono font-bold text-gold">{d.mandate.cellWinRate}%</span>
                  <span className="text-muted text-sm">cell win rate</span>
                </div>
                <p className="text-muted-light text-xs">
                  Won {d.mandate.championCellsWon} of {d.mandate.championCellsAppeared} cells it appeared in across all tiers.
                </p>
              </div>
              {d.mandate.headToHead.length > 0 && (
                <div className="bg-surface border border-border rounded-lg p-5">
                  <p className="text-xs text-muted uppercase tracking-wider mb-3">Head-to-head vs finalists</p>
                  <div className="space-y-2">
                    {d.mandate.headToHead.map((h) => (
                      <div key={h.opponentId} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted truncate flex-1">{h.opponentText.slice(0, 50)}{h.opponentText.length > 50 ? '...' : ''}</span>
                        <div className="flex gap-2 shrink-0">
                          <span className="font-mono text-xs text-success">{h.wins}W</span>
                          <span className="font-mono text-xs text-error">{h.losses}L</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Analysis section */}
            {aiAnalysis ? (
              <>
                {aiAnalysis.summary && (
                  <div className="bg-surface border border-border rounded-lg p-4 mb-6">
                    <p className="text-xs text-muted uppercase tracking-wider mb-2">Executive Summary</p>
                    <p className="text-sm text-foreground leading-relaxed">{aiAnalysis.summary}</p>
                  </div>
                )}
                {aiAnalysis.objections?.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs text-muted uppercase tracking-wider mb-3">Top objections raised during deliberation</p>
                    <div className="space-y-2">
                      {aiAnalysis.objections.map((obj, i) => (
                        <div key={i} className="bg-error-bg/30 border border-error-border/20 rounded-lg p-4">
                          <p className="text-sm text-foreground leading-relaxed">{obj.text}</p>
                          <span className="text-xs text-muted mt-1 inline-block">Severity: {obj.severity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {aiAnalysis.synergies?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wider mb-3">Runner-up synergies</p>
                    <div className="space-y-2">
                      {aiAnalysis.synergies.map((s, i) => (
                        <div key={i} className="bg-surface border border-border rounded-lg p-4">
                          <p className="text-sm text-accent font-medium mb-1">{s.idea}</p>
                          <p className="text-xs text-muted leading-relaxed">{s.synergy}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : d.champion && (
              <div className="text-center py-6">
                <button
                  onClick={runAISynthesis}
                  disabled={aiLoading}
                  className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-6 py-3 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  {aiLoading ? 'Analyzing...' : 'Generate AI Analysis'}
                </button>
                <p className="text-muted-light text-xs mt-2">Haiku will analyze cell discussions to extract objections, synergies, and an executive summary.</p>
              </div>
            )}

            <Divider />
          </>
        )}

        {/* ── CELL AUDIT ── */}
        {d.auditCells.length > 0 && (
          <>
            <SectionHeading sub="Inspect individual cells: who participated, what was said, how votes were cast">Cell Audit</SectionHeading>
            <div className="space-y-3">
              {d.auditCells.map((cell) => {
                const isExpanded = expandedCell === cell.id
                return (
                  <div key={cell.id} className="bg-surface border border-border rounded-lg overflow-hidden">
                    <button onClick={() => setExpandedCell(isExpanded ? null : cell.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-surface-hover transition-colors cursor-pointer">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-sm font-bold text-accent">{cell.id.slice(0, 8)}</span>
                        <span className="text-xs text-muted bg-background px-2 py-0.5 rounded">Tier {cell.tier}</span>
                        <span className="text-xs text-muted">{cell.participants.length} participants</span>
                        <span className="text-xs text-muted">{cell.commentCount} comments</span>
                        {cell.duration && <span className="text-xs text-muted font-mono">{cell.duration}m</span>}
                      </div>
                      <span className="text-muted text-lg">{isExpanded ? '\u2212' : '+'}</span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border">
                        <div className="p-4 border-b border-border">
                          <p className="text-xs text-muted uppercase tracking-wider mb-2">Participants</p>
                          <div className="flex flex-wrap gap-2">
                            {cell.participants.map((p, i) => (
                              <span key={i} className="text-sm text-foreground bg-background px-2 py-1 rounded">
                                {p.name} {p.zip && <span className="text-muted-light text-xs">({p.zip})</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="p-4 border-b border-border">
                          <p className="text-xs text-muted uppercase tracking-wider mb-3">Vote Results</p>
                          <div className="space-y-2">
                            {cell.ideas.map((idea, i) => {
                              const maxXP = cell.ideas[0]?.xp || 1
                              return (
                                <div key={idea.id} className="flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm truncate ${i === 0 ? 'text-gold font-medium' : 'text-foreground'}`}>{idea.text}</p>
                                  </div>
                                  <div className="w-24 h-4 bg-background rounded overflow-hidden shrink-0">
                                    <div className={`h-full rounded ${i === 0 ? 'bg-gold/50' : 'bg-accent/30'}`}
                                      style={{ width: `${(idea.xp / maxXP) * 100}%` }} />
                                  </div>
                                  <span className="font-mono text-xs text-muted w-16 text-right shrink-0">{idea.xp} XP ({idea.votes}v)</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        {cell.dialogue.length > 0 && (
                          <div className="p-4">
                            <p className="text-xs text-muted uppercase tracking-wider mb-3">Discussion (excerpt)</p>
                            <div className="space-y-3">
                              {cell.dialogue.map((msg, i) => (
                                <div key={i} className="flex gap-3">
                                  <span className="text-muted-light text-xs font-mono w-14 shrink-0 pt-0.5 text-right">{formatTime(msg.time)}</span>
                                  <div>
                                    <span className="text-accent text-sm font-medium">{msg.speaker}</span>
                                    <p className="text-sm text-subtle leading-relaxed">{msg.text}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <Divider />
          </>
        )}

        {/* ── TIMELINE ── */}
        {d.timeline.length > 0 && (
          <>
            <SectionHeading sub="Chronological record of the deliberation">Event Timeline</SectionHeading>
            <div className="relative">
              <div className="absolute left-[72px] md:left-[88px] top-0 bottom-0 w-px bg-border" />
              <div className="space-y-0">
                {d.timeline.map((evt, i) => {
                  const isHighlight = evt.event.includes('started') || evt.event.includes('Completed') || evt.event.includes('declared') || evt.event === 'Created'
                  return (
                    <div key={i} className={`relative flex gap-3 md:gap-4 py-3 ${isHighlight ? '' : 'opacity-70'}`}>
                      <div className="text-xs text-muted font-mono w-16 md:w-20 shrink-0 text-right pt-0.5">
                        <div>{formatDate(evt.timestamp).replace(/, \d{4}$/, '')}</div>
                        <div className="text-muted-light">{formatTime(evt.timestamp)}</div>
                      </div>
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 z-10 ${isHighlight ? 'bg-accent' : 'bg-border'}`} />
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${isHighlight ? 'text-foreground' : 'text-muted'}`}>{evt.event}</p>
                        {evt.detail && <p className="text-xs text-muted-light mt-0.5">{evt.detail}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <Divider />
          </>
        )}

        {/* ── EXPORT ── */}
        <SectionHeading sub="Download the full record for review or independent audit">Export &amp; Share</SectionHeading>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <a href={`/api/deliberations/${id}/export`} className="bg-surface hover:bg-surface-hover border border-border rounded-lg p-4 text-center transition-colors cursor-pointer block">
            <div className="text-2xl mb-2">&#128196;</div>
            <div className="text-sm text-foreground font-medium">Full Report</div>
            <div className="text-xs text-muted mt-1">JSON</div>
          </a>
          <a href={`/api/deliberations/${id}/export?format=csv`} className="bg-surface hover:bg-surface-hover border border-border rounded-lg p-4 text-center transition-colors cursor-pointer block">
            <div className="text-2xl mb-2">&#128202;</div>
            <div className="text-sm text-foreground font-medium">Ideas CSV</div>
            <div className="text-xs text-muted mt-1">Spreadsheet</div>
          </a>
          <a href={`/api/deliberations/${id}/export?format=pdf`} className="bg-surface hover:bg-surface-hover border border-border rounded-lg p-4 text-center transition-colors cursor-pointer block">
            <div className="text-2xl mb-2">&#128220;</div>
            <div className="text-sm text-foreground font-medium">PDF Report</div>
            <div className="text-xs text-muted mt-1">Printable</div>
          </a>
          <button onClick={() => navigator.clipboard.writeText(window.location.href)} className="bg-surface hover:bg-surface-hover border border-border rounded-lg p-4 text-center transition-colors cursor-pointer">
            <div className="text-2xl mb-2">&#128279;</div>
            <div className="text-sm text-foreground font-medium">Copy Link</div>
            <div className="text-xs text-muted mt-1">Share URL</div>
          </button>
        </div>

        {/* ── FOOTER ── */}
        <div className="mt-16 border-t border-border pt-8 text-center">
          <p className="text-muted-light text-xs">
            This audit report was generated by Unity Chant. All data is derived from recorded participant actions.
            <br />
            Report ID: <span className="font-mono">UC-{id.slice(0, 8).toUpperCase()}</span> &middot; {d.phase === 'COMPLETED' ? `Completed ${formatDate(d.completedAt!)}` : `Phase: ${d.phase}`}
          </p>
        </div>
      </main>
    </div>
  )
}
