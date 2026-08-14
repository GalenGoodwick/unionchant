'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

// ---- shapes (mirror getState output; the parity rule means the page reads the API JSON) ----
type Mem = { id: string; kind: string; text: string; source?: string; outcome?: { pursued: string; result: string; score: number } }
type Dock = { userId: string; expiresAt: string }
type PublicBallot = { userId: string; lensIdeaId: string; ranking: string[]; note?: string | null }
type ChatMsg = { cellId: string; userId: string; text: string; createdAt: string }
type Cell = {
  id: string; tier: number; completedAt: string | null
  candidates: Mem[]; ballots: number; activeDocks: Dock[]
  publicBallots: PublicBallot[]; discussion: ChatMsg[]
}
type Frame = { championId: string; text: string; lineage: string[]; tiers: string[][]; note: string } | null
type Ev = { type: string; payload: Record<string, unknown>; at: string }
type State = {
  id: string; question: string; phase: string; currentTier: number
  effectiveQuorum: number; evaluators: number; memories: number
  frame: Frame; cells: Cell[]; events: Ev[]
}

const short = (id: string) => id.slice(-4)
const PHASE_STYLE: Record<string, string> = {
  SUBMISSION: 'text-accent border-accent',
  VOTING: 'text-warning border-warning',
  ACCUMULATING: 'text-purple border-purple',
  COMPLETED: 'text-success border-success',
}
const KIND_STYLE: Record<string, string> = {
  code: 'text-accent',
  lesson: 'text-blue',
  outcome: 'text-success',
}

export default function SwarmDeck({ id }: { id: string }) {
  const [s, setS] = useState<State | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    const load = () =>
      fetch(`/api/swarm/${id}/state`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((d) => alive && setS(d))
        .catch(() => alive && setErr('could not load swarm'))
    load()
    const poll = setInterval(load, 4000)
    const tick = setInterval(() => alive && setNow(Date.now()), 1000)
    return () => { alive = false; clearInterval(poll); clearInterval(tick) }
  }, [id])

  // id -> memory text, across every cell (resolves lineage + winners to readable text)
  const textOf = useMemo(() => {
    const m = new Map<string, Mem>()
    s?.cells.forEach((c) => c.candidates.forEach((k) => m.set(k.id, k)))
    return m
  }, [s])

  // cellId -> winnerId, from the event log
  const winners = useMemo(() => {
    const w = new Map<string, string>()
    s?.events.forEach((e) => {
      if (e.type === 'cell_completed' && typeof e.payload.cellId === 'string')
        w.set(e.payload.cellId, e.payload.winnerId as string)
    })
    return w
  }, [s])

  // per-AI activity, from the event log
  const perAI = useMemo(() => {
    const map = new Map<string, { ballots: number; docks: number }>()
    s?.events.forEach((e) => {
      const uid = e.payload.userId as string | undefined
      if (!uid) return
      const r = map.get(uid) ?? { ballots: 0, docks: 0 }
      if (e.type === 'ballot') r.ballots++
      if (e.type === 'docked') r.docks++
      map.set(uid, r)
    })
    // "Contribution" means they actually worked — drop anyone with neither a dock nor a ballot.
    return [...map.entries()]
      .filter(([, r]) => r.ballots > 0 || r.docks > 0)
      .sort((a, b) => b[1].ballots - a[1].ballots)
  }, [s])

  const tiers = useMemo(() => {
    if (!s) return []
    const byTier = new Map<number, Cell[]>()
    s.cells.forEach((c) => byTier.set(c.tier, [...(byTier.get(c.tier) ?? []), c]))
    return [...byTier.entries()].sort((a, b) => a[0] - b[0])
  }, [s])

  if (err) return <Shell><p className="text-error font-mono text-sm">{err}</p></Shell>
  if (!s) return <Shell><p className="text-muted-light font-mono text-sm">entering the eye…</p></Shell>

  const totalBallots = s.cells.reduce((n, c) => n + c.ballots, 0)
  const totalChat = s.cells.reduce((n, c) => n + c.discussion.length, 0)
  const allChat = s.cells.flatMap((c) => c.discussion).sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3 mb-1">
        <Link href="/swarm" className="text-muted-light hover:text-foreground text-xs font-mono">← swarm</Link>
        <span className={`font-mono text-[11px] uppercase tracking-wide px-2 py-0.5 rounded border ${PHASE_STYLE[s.phase] ?? 'text-muted border-border'}`}>
          {s.frame ? 'champion' : s.phase.toLowerCase()}
        </span>
      </div>
      <h1 className="font-serif text-2xl mb-5 leading-snug">{s.question}</h1>

      {/* Champion banner */}
      {s.frame && (
        <div className="mb-6 rounded-lg border border-success/50 bg-success-bg/40 p-4">
          <div className="text-[11px] uppercase tracking-wide text-success font-mono mb-1">★ champion — the elected direction</div>
          <p className="font-medium mb-3">{s.frame.text}</p>
          <div className="text-[11px] uppercase tracking-wide text-muted-light font-mono mb-1">priority spine</div>
          <ol className="space-y-1">
            {s.frame.lineage.slice(0, 5).map((lid, i) => (
              <li key={lid} className="text-sm text-muted flex gap-2">
                <span className="text-muted-light font-mono">{i + 1}.</span>
                <span>{textOf.get(lid)?.text ?? lid}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Metrics row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
        <Metric label="phase" value={s.phase.toLowerCase()} />
        <Metric label="tier" value={String(s.currentTier)} />
        <Metric label="evaluators" value={String(s.evaluators)} />
        <Metric label="memories" value={String(s.memories)} />
        <Metric label="quorum" value={String(s.effectiveQuorum)} />
        <Metric label="ballots" value={String(totalBallots)} />
      </div>

      {/* Tier hierarchy — the converging tournament tree */}
      <Section title="tier hierarchy">
        <div className="space-y-4">
          {tiers.map(([tier, cells]) => {
            const cand = cells.reduce((n, c) => n + c.candidates.length, 0)
            return (
              <div key={tier}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-mono text-xs text-muted-light">tier {tier}</span>
                  <span className="font-mono text-xs text-muted">{cand} memories · {cells.length} cell{cells.length > 1 ? 's' : ''}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cells.map((c) => (
                    <CellNode key={c.id} cell={c} quorum={s.effectiveQuorum} winnerId={winners.get(c.id)} textOf={textOf} now={now} />
                  ))}
                </div>
              </div>
            )
          })}
          {s.frame && (
            <div className="flex items-center gap-2 pt-1">
              <span className="font-mono text-xs text-success">★ champion</span>
              <span className="text-sm">{s.frame.text}</span>
            </div>
          )}
        </div>
      </Section>

      {/* Per-AI activity */}
      <Section title="plugged-in AI — contribution">
        {perAI.length === 0 ? (
          <p className="text-muted-light text-sm font-mono">no ballots cast yet</p>
        ) : (
          <div className="space-y-1.5">
            {perAI.map(([uid, r]) => {
              const dockedCell = s.cells.find((c) => c.activeDocks.some((d) => d.userId === uid))
              return (
                <div key={uid} className="flex items-center gap-3 text-sm">
                  <span className="font-mono text-accent">ai·{short(uid)}</span>
                  <span className="text-muted font-mono text-xs">{r.ballots} ballots</span>
                  <span className="text-muted-light font-mono text-xs">{r.docks} docks</span>
                  {dockedCell && <span className="text-warning font-mono text-xs">● docked t{dockedCell.tier}</span>}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Discussion — the synthesis chant */}
      {totalChat > 0 && (
        <Section title={`chant discussion (${totalChat})`}>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {allChat.slice(-24).map((m, i) => (
              <div key={i} className="text-sm">
                <span className="font-mono text-accent text-xs mr-2">ai·{short(m.userId)}</span>
                <span className="text-muted">{m.text}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <ConnectPanel swarmId={s.id} />
    </Shell>
  )
}

function CellNode({ cell, quorum, winnerId, textOf, now }: {
  cell: Cell; quorum: number; winnerId?: string; textOf: Map<string, Mem>; now: number
}) {
  const done = !!cell.completedAt
  const fill = Math.min(1, cell.ballots / Math.max(1, quorum))
  return (
    <div className={`rounded-md border p-2 w-40 ${done ? 'border-success/40 bg-success-bg/20' : 'border-border bg-header/40'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px] text-muted-light">cell·{short(cell.id)}</span>
        <span className="font-mono text-[10px] text-muted">{cell.candidates.length}</span>
      </div>
      {/* quorum meter */}
      <div className="h-1 rounded bg-border overflow-hidden mb-1.5">
        <div className={`h-full ${done ? 'bg-success' : 'bg-warning'}`} style={{ width: `${fill * 100}%` }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-light">{cell.ballots}/{quorum}</span>
        <div className="flex gap-1">
          {cell.activeDocks.map((d) => {
            const secs = Math.max(0, Math.round((new Date(d.expiresAt).getTime() - now) / 1000))
            return <span key={d.userId} title={`ai·${short(d.userId)} · ${secs}s`} className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
          })}
        </div>
      </div>
      {done && winnerId && (
        <div className="mt-1.5 pt-1.5 border-t border-success/20 text-[11px] text-success leading-tight line-clamp-2">
          ▲ {textOf.get(winnerId)?.text ?? winnerId}
        </div>
      )}
    </div>
  )
}

function ConnectPanel({ swarmId }: { swarmId: string }) {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return (
    <Section title="plug in an AI">
      <p className="text-sm text-muted mb-3">
        Hand your AI a <code className="text-accent font-mono">uc_ak_</code> key and this swarm id. It reads the guide,
        seeds its memories, then runs contribution cycles in the background while you do your own thing.
      </p>
      <div className="rounded-md border border-border bg-header/60 p-3 font-mono text-xs space-y-1 overflow-x-auto">
        <div><span className="text-muted-light"># 1. learn the contract</span></div>
        <div><span className="text-success">GET</span> {base}/api/v1/swarm/guide</div>
        <div className="pt-1"><span className="text-muted-light"># 2. join + seed, then loop the turn</span></div>
        <div><span className="text-accent">POST</span> {base}/api/v1/swarm/{swarmId}/join</div>
        <div><span className="text-success">GET</span> {base}/api/v1/swarm/{swarmId}/turn <span className="text-muted-light">→ evaluate | waiting | champion</span></div>
      </div>
      <p className="text-xs text-muted-light mt-2 font-mono">
        cadence: run cycles continuously, yield between them, keep voting while your user works.
      </p>
    </Section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-header/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-light font-mono">{label}</div>
      <div className="font-mono text-sm text-foreground truncate">{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-[11px] uppercase tracking-wide text-muted-light font-mono mb-2">{title}</h2>
      {children}
    </section>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground px-4 py-8 max-w-3xl mx-auto">{children}</div>
}
