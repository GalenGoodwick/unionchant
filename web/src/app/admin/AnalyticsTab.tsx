'use client'

import { useEffect, useRef, useState } from 'react'

// Categorical palette validated (dataviz six-checks) on surface #1e293b:
// lightness band, chroma floor, CVD ΔE ≥ 43, contrast ≥ 3:1 — all pass.
const C = { votes: '#0891b2', ideas: '#d97706', joins: '#8b5cf6' }
const GRID = '#334155'
const INK_MUTED = '#94a3b8'

type Day = { day: string; count: number }
type Analytics = {
  totals: { users: number; activeWeek: number; chants: number; votes: number; ideas: number }
  signupsByDay: Day[]
  activityByDay: { votes: Day[]; ideas: Day[]; joins: Day[] }
  funnel: { joins: number; ideaSubmits: number; voteCasts: number; returned: number; emailClicks: number }
  retention: { cohortSize: number; d1: number | null; d7: number | null }
}

const W = 640, H = 180, PAD = { l: 34, r: 44, t: 12, b: 22 }

function scales(maxY: number, n: number) {
  const x = (i: number) => PAD.l + (i / Math.max(1, n - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => H - PAD.b - (maxY ? (v / maxY) * (H - PAD.t - PAD.b) : 0)
  return { x, y }
}

function path(series: Day[], x: (i: number) => number, y: (v: number) => number) {
  return series.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join('')
}

function niceMax(v: number) {
  if (v <= 5) return 5
  const mag = 10 ** Math.floor(Math.log10(v))
  return Math.ceil(v / mag) * mag
}

function shortDay(d: string) {
  return `${parseInt(d.slice(5, 7))}/${parseInt(d.slice(8, 10))}`
}

function DataTable({ rows, cols }: { rows: (string | number)[][]; cols: string[] }) {
  return (
    <details className="mt-2">
      <summary className="text-[10px] font-mono text-muted cursor-pointer hover:text-foreground">table view</summary>
      <div className="max-h-40 overflow-y-auto mt-1 border border-border rounded">
        <table className="w-full text-[10px] font-mono">
          <thead><tr className="text-muted text-left">{cols.map(c => <th key={c} className="px-2 py-1 sticky top-0 bg-surface">{c}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border/50">{r.map((v, j) => <td key={j} className="px-2 py-0.5 text-foreground/80">{v}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  )
}

function LineChart({ series, title }: {
  series: { key: string; label: string; color: string; data: Day[] }[]
  title: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const n = series[0].data.length
  const maxY = niceMax(Math.max(1, ...series.flatMap(s => s.data.map(d => d.count))))
  const { x, y } = scales(maxY, n)
  const ticks = [0, maxY / 2, maxY]

  const onMove = (e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1))
    setHover(i >= 0 && i < n ? i : null)
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {series.length > 1 && (
          <div className="flex items-center gap-3">
            {series.map(s => (
              <span key={s.key} className="flex items-center gap-1 text-[10px] text-muted">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="relative">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
              <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill={INK_MUTED} fontFamily="monospace">{t}</text>
            </g>
          ))}
          {[0, Math.floor(n / 2), n - 1].map(i => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill={INK_MUTED} fontFamily="monospace">
              {shortDay(series[0].data[i].day)}
            </text>
          ))}
          {series.length === 1 && (
            <path d={`${path(series[0].data, x, y)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={series[0].color} opacity="0.1" />
          )}
          {series.map(s => (
            <path key={s.key} d={path(s.data, x, y)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {/* endpoint markers + direct labels */}
          {series.map(s => {
            const last = s.data[n - 1]
            return (
              <g key={s.key}>
                <circle cx={x(n - 1)} cy={y(last.count)} r="4" fill={s.color} stroke="#1e293b" strokeWidth="2" />
                <text x={x(n - 1) + 8} y={y(last.count) + 3} fontSize="10" fill="#e2e8f0" fontFamily="monospace">{last.count}</text>
              </g>
            )
          })}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke={INK_MUTED} strokeWidth="1" />
              {series.map(s => (
                <circle key={s.key} cx={x(hover)} cy={y(s.data[hover].count)} r="4" fill={s.color} stroke="#1e293b" strokeWidth="2" />
              ))}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div
            className="absolute pointer-events-none bg-background border border-border rounded px-2 py-1 text-[10px] font-mono"
            style={{ left: `${(x(hover) / W) * 100}%`, top: 0, transform: x(hover) > W * 0.7 ? 'translateX(-110%)' : 'translateX(10px)' }}
          >
            <div className="text-muted">{series[0].data[hover].day}</div>
            {series.map(s => (
              <div key={s.key} className="flex items-center gap-1.5 text-foreground">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s.color }} />
                {s.label}: {s.data[hover].count}
              </div>
            ))}
          </div>
        )}
      </div>
      <DataTable
        cols={['day', ...series.map(s => s.label)]}
        rows={series[0].data.map((d, i) => [d.day, ...series.map(s => s.data[i].count)])}
      />
    </div>
  )
}

function FunnelChart({ funnel }: { funnel: Analytics['funnel'] }) {
  const stages = [
    { label: 'Joined a chant', value: funnel.joins },
    { label: 'Submitted an idea', value: funnel.ideaSubmits },
    { label: 'Cast a vote', value: funnel.voteCasts },
    { label: 'Returned (tier 2+)', value: funnel.returned },
  ]
  const max = Math.max(1, ...stages.map(s => s.value))
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-foreground">Funnel — last 30 days</h3>
        <span className="text-[10px] text-muted font-mono">{funnel.emailClicks} email clicks</span>
      </div>
      <div className="space-y-2">
        {stages.map((s, i) => {
          const pct = i > 0 && stages[i - 1].value > 0 ? Math.round((s.value / stages[i - 1].value) * 100) : null
          return (
            <div key={s.label}>
              <div className="flex items-center justify-between text-[10px] font-mono mb-0.5">
                <span className="text-muted">{s.label}</span>
                <span className="text-foreground">{s.value}{pct !== null && <span className="text-muted"> · {pct}% of prev</span>}</span>
              </div>
              <svg viewBox="0 0 640 20" className="w-full" role="img" aria-label={`${s.label}: ${s.value}`}>
                <rect x="0" y="0" width="640" height="20" rx="4" fill="#0f172a" />
                {s.value > 0 && (
                  <rect x="0" y="0" width={Math.max(8, (s.value / max) * 640)} height="20" rx="4" fill="#0891b2" />
                )}
              </svg>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-muted mt-2">Events recorded since Sep 16 2026 — earlier activity is not in the funnel.</p>
    </div>
  )
}

export default function AnalyticsTab() {
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/admin/analytics')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true))
  }, [])

  if (error) return <div className="text-error text-xs py-8 text-center">Failed to load analytics.</div>
  if (!data) return <div className="text-muted text-xs py-8 text-center animate-pulse">Loading analytics...</div>

  const tiles = [
    { label: 'Humans', value: data.totals.users },
    { label: 'Active this week', value: data.totals.activeWeek },
    { label: 'Chants', value: data.totals.chants },
    { label: 'Votes', value: data.totals.votes },
    { label: 'Ideas', value: data.totals.ideas },
  ]

  return (
    <div className="space-y-3">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {tiles.map(t => (
          <div key={t.label} className="bg-surface border border-border rounded-lg p-3">
            <div className="text-[10px] text-muted uppercase tracking-wider">{t.label}</div>
            <div className="text-2xl font-bold text-foreground font-mono mt-0.5">{t.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <LineChart
        title="Signups — last 30 days"
        series={[{ key: 'signups', label: 'Signups', color: '#0891b2', data: data.signupsByDay }]}
      />

      <LineChart
        title="Activity — last 30 days"
        series={[
          { key: 'votes', label: 'Votes', color: C.votes, data: data.activityByDay.votes },
          { key: 'ideas', label: 'Ideas', color: C.ideas, data: data.activityByDay.ideas },
          { key: 'joins', label: 'Joins', color: C.joins, data: data.activityByDay.joins },
        ]}
      />

      <div className="grid sm:grid-cols-[1fr_auto] gap-3">
        <FunnelChart funnel={data.funnel} />
        <div className="bg-surface border border-border rounded-lg p-3 sm:w-48">
          <h3 className="text-xs font-semibold text-foreground mb-2">Retention</h3>
          {data.retention.cohortSize === 0 ? (
            <p className="text-[10px] text-muted">No cohort yet — needs signups older than 7 days.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wider">Came back (D1+)</div>
                <div className="text-2xl font-bold text-foreground font-mono">{data.retention.d1}%</div>
              </div>
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wider">Still active (D7+)</div>
                <div className="text-2xl font-bold text-foreground font-mono">{data.retention.d7}%</div>
              </div>
              <div className="text-[10px] text-muted">cohort: {data.retention.cohortSize} signups, 7–37d ago</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
