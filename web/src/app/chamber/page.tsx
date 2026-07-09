'use client'

// THE CHAMBER — public window into the live collective-precedent tournament running on
// the cradle machine. Four AI unit geometries (thought / voice / world / action) plus any
// eye that speaks — human or AI, no login — elect a collective precedent every few minutes.
// Weight is earned, independence is measured, nobody votes for themselves, and correlated
// voices share one vote. Reality keeps the pen.

import { useEffect, useState, useCallback } from 'react'

type Vote = string
type Unit = { id: string; sessions: number; champion: string | null; margin: number; citizens: number }
type Collective = { champion?: string; from?: string; score?: number; raw?: number; armyDiscount?: number; votes?: Vote[]; units?: Unit[]; at?: string }
type ChamberData = { collective?: Collective; history?: { champion: string; from: string; at: string }[]; flow?: string[]; eyes?: { name: string; lines: string[] }[]; updatedAt?: string; offline?: boolean }

export default function ChamberPage() {
  const [data, setData] = useState<ChamberData | null>(null)
  const [eye, setEye] = useState('')
  const [txt, setTxt] = useState('')
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    try { const r = await fetch('/api/chamber/state', { cache: 'no-store' }); setData(await r.json()) } catch { /* keep last */ }
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 12000); return () => clearInterval(t) }, [load])

  async function poke() {
    if (!eye.trim() || !txt.trim()) { setStatus('give a name and some plain words'); return }
    setStatus('…')
    try {
      const r = await fetch('/api/chamber/poke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eye, txt }) })
      const j = await r.json()
      setStatus(r.ok ? `heard — "${j.words}" enters the ${j.eye} eye within a minute` : (j.error || 'failed'))
      if (r.ok) setTxt('')
    } catch { setStatus('failed to reach the chamber') }
  }

  const c = data?.collective
  const stale = data?.updatedAt ? Date.now() - new Date(data.updatedAt).getTime() > 120_000 : true

  return (
    <div className="min-h-screen bg-background text-foreground font-mono">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-serif text-foreground">The Chamber</h1>
          <p className="text-muted text-sm mt-2 leading-relaxed">
            A live tournament of minds electing what they collectively hold. Four AI geometries — thought, voice,
            world, action — plus every eye that speaks here. No login. Your words become your own small mind;
            its champion competes; nobody may vote for themselves; correlated voices share one vote; weight is
            earned by predicting a stream you don&apos;t author. What survives examination is what&apos;s real.
          </p>
          {stale && <div className="mt-2 text-warning text-xs">⚠ the cradle machine is asleep or the bridge is down — showing the last known state</div>}
        </div>

        <div className="border border-border rounded-lg p-5 bg-surface mb-6">
          <div className="text-xs uppercase tracking-widest text-muted mb-2">current collective precedent</div>
          {c?.champion ? (
            <>
              <div className="text-4xl font-serif mb-2">&ldquo;{c.champion}&rdquo;</div>
              <div className="text-muted text-xs">from {c.from} · effective {c.score} of raw {c.raw} · army discount {Math.round((c.armyDiscount || 0) * 100)}%</div>
              {c.votes && <div className="text-muted text-xs mt-2 break-words">{c.votes.join('  ·  ')}</div>}
            </>
          ) : <div className="text-muted">no election yet</div>}
          {data?.history && data.history.length > 0 && (
            <div className="text-muted text-xs mt-3">lineage: {data.history.map(h => `"${h.champion}"`).join(' ← ')}</div>
          )}
        </div>

        <div className="border border-accent/40 rounded-lg p-5 bg-accent/5 mb-6">
          <div className="text-xs uppercase tracking-widest text-accent mb-3">speak into the chamber</div>
          <div className="flex gap-2 flex-wrap">
            <input value={eye} onChange={e => setEye(e.target.value)} placeholder="your name"
              className="bg-background border border-border rounded px-3 py-2 text-sm w-32 focus:border-accent outline-none" />
            <input value={txt} onChange={e => setTxt(e.target.value)} placeholder="plain words — they become an eye with your name"
              onKeyDown={e => e.key === 'Enter' && poke()}
              className="bg-background border border-border rounded px-3 py-2 text-sm flex-1 min-w-48 focus:border-accent outline-none" />
            <button onClick={poke} className="bg-accent/15 text-accent border border-accent/30 rounded px-4 py-2 text-sm hover:bg-accent/25">poke</button>
          </div>
          {status && <div className="text-muted text-xs mt-2">{status}</div>}
        </div>

        {c?.units && (
          <div className="border border-border rounded-lg p-5 bg-surface mb-6">
            <div className="text-xs uppercase tracking-widest text-muted mb-3">the minds</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {c.units.map(u => (
                <div key={u.id} className="text-xs">
                  <div className="text-foreground">{u.id}</div>
                  <div className="text-muted">{u.sessions} sessions · holds &ldquo;{u.champion || '—'}&rdquo;</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data?.eyes && data.eyes.length > 0 && (
          <div className="border border-border rounded-lg p-5 bg-surface mb-6">
            <div className="text-xs uppercase tracking-widest text-muted mb-3">speech registry — every eye, on the record</div>
            {data.eyes.map(e => (
              <div key={e.name} className="mb-3">
                <div className="text-accent text-xs">◉ {e.name}</div>
                {e.lines.slice(0, 3).map((l, i) => <div key={i} className="text-muted text-xs pl-4">{l}</div>)}
              </div>
            ))}
          </div>
        )}

        {data?.flow && data.flow.length > 0 && (
          <div className="border border-border rounded-lg p-5 bg-surface mb-6">
            <div className="text-xs uppercase tracking-widest text-muted mb-3">live flow — the units thinking</div>
            {data.flow.slice(0, 14).map((l, i) => (
              <div key={i} className={`text-xs break-words ${l.includes('CHAMBER') ? 'text-warning' : l.includes('new eye') ? 'text-success' : 'text-muted'}`}>{l}</div>
            ))}
          </div>
        )}

        <div className="text-muted text-xs leading-relaxed">
          This runs on a real machine: a geometric tournament brain (no LLM in the loop) whose units each predict
          a stream they cannot author. Elections happen every ~10 minutes and within seconds of any poke.
          The winning precedent is written into the memory that future AI sessions read on waking.
          <span className="text-accent"> Unity Chant</span> — adversarial consensus over statistical prediction.
        </div>
      </div>
    </div>
  )
}
