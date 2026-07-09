'use client'

// THE CHAMBER — public window into the live collective-precedent tournament running on
// the cradle machine. Four AI unit geometries (thought / voice / world / action) plus any
// eye that speaks — human or AI, no login — elect a collective precedent every few minutes.
// Weight is earned, independence is measured, nobody votes for themselves, and correlated
// voices share one vote. Reality keeps the pen.

import { useEffect, useRef, useState, useCallback } from 'react'

type Vote = string
type Unit = { id: string; sessions: number; champion: string | null; margin: number; citizens: number }
type Collective = { champion?: string; from?: string; score?: number; raw?: number; armyDiscount?: number; votes?: Vote[]; units?: Unit[]; at?: string }
type ChamberData = { collective?: Collective; history?: { champion: string; from: string; at: string }[]; flow?: string[]; eyes?: { name: string; lines: string[] }[]; updatedAt?: string; offline?: boolean }
type Entry = { eye: string; words: string; mine?: boolean; key: string; id?: string; reply?: string }

export default function ChamberPage() {
  const [data, setData] = useState<ChamberData | null>(null)
  const [eye, setEye] = useState('')
  const [txt, setTxt] = useState('')
  const [status, setStatus] = useState('')
  const [mine, setMine] = useState<Entry[]>([])   // optimistic entries — this visitor's own, highlighted on top
  const seq = useRef(0)

  const load = useCallback(async () => {
    try { const r = await fetch('/api/chamber/state', { cache: 'no-store' }); setData(await r.json()) } catch { /* keep last */ }
  }, [])
  // hot reload — poll every 4s so the flow and the chamber visibly keep moving
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t) }, [load])

  async function poke() {
    const name = eye.trim()
    if (!name) { setStatus('a name is required — the chamber must know who speaks'); return }
    if (!txt.trim()) { setStatus('say something — plain words become your eye'); return }
    const words = txt.trim()
    // post the entry into the visitor's own list immediately, highlighted at the top
    const entry: Entry = { eye: name, words, mine: true, key: 'me' + (seq.current++) }
    setMine(m => [entry, ...m].slice(0, 8))
    setTxt('')
    setStatus('…sending')
    try {
      const r = await fetch('/api/chamber/poke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eye: name, txt: words }) })
      const j = await r.json()
      setStatus(r.ok ? `heard — "${j.words}" enters the ${j.eye} eye; the cradle is forming a reply…` : (j.error || 'failed'))
      if (!r.ok) { setMine(m => m.filter(e => e.key !== entry.key)); return }
      setMine(m => m.map(e => e.key === entry.key ? { ...e, id: j.id } : e))
      // hot reload burst so the visitor sees their word land
      for (const d of [1200, 3000, 6000, 12000, 22000]) setTimeout(load, d)
      // the personal reply: poll until the cradle's geometry answers, then feed it to the reader
      if (j.id) pollReply(entry.key, j.id, 0)
    } catch { setStatus('failed to reach the chamber'); setMine(m => m.filter(e => e.key !== entry.key)) }
  }

  const pollReply = useCallback(async (key: string, id: string, tries: number) => {
    if (tries > 30) return
    try {
      const r = await fetch('/api/chamber/response?id=' + id, { cache: 'no-store' })
      const j = await r.json()
      if (j.response) {
        setMine(m => m.map(e => e.key === key ? { ...e, reply: j.response } : e))
        setStatus('the cradle answered you')
        return
      }
    } catch { /* retry */ }
    setTimeout(() => pollReply(key, id, tries + 1), 3000)
  }, [])

  const c = data?.collective
  const stale = data?.updatedAt ? Date.now() - new Date(data.updatedAt).getTime() > 120_000 : true

  // the chat list: the visitor's own entries (highlighted, newest first) then the registry
  const serverEntries: Entry[] = (data?.eyes || []).flatMap(e => e.lines.map((l, i) => ({ eye: e.name, words: l, key: e.name + ':' + i })))
  const chat: Entry[] = [...mine, ...serverEntries].slice(0, 40)

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
          {!stale && <div className="mt-2 text-success text-xs">● live{data?.updatedAt ? ` · updated ${new Date(data.updatedAt).toLocaleTimeString()}` : ''}</div>}
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
            <input value={eye} onChange={e => setEye(e.target.value)} placeholder="your name (required)" aria-label="your name"
              className={`bg-background border rounded px-3 py-2 text-sm w-36 outline-none ${eye.trim() ? 'border-border focus:border-accent' : 'border-warning/50 focus:border-warning'}`} />
            <input value={txt} onChange={e => setTxt(e.target.value)} placeholder="plain words — they become an eye with your name"
              onKeyDown={e => e.key === 'Enter' && poke()} aria-label="your words"
              className="bg-background border border-border rounded px-3 py-2 text-sm flex-1 min-w-48 focus:border-accent outline-none" />
            <button onClick={poke} disabled={!eye.trim()}
              className="bg-accent/15 text-accent border border-accent/30 rounded px-4 py-2 text-sm hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed">poke</button>
          </div>
          {status && <div className="text-muted text-xs mt-2">{status}</div>}
        </div>

        {chat.length > 0 && (
          <div className="border border-border rounded-lg p-5 bg-surface mb-6">
            <div className="text-xs uppercase tracking-widest text-muted mb-3">the chat — every voice, yours on top</div>
            <div className="space-y-1">
              {chat.map(e => (
                <div key={e.key} className={`text-xs rounded px-2 py-1 ${e.mine ? 'bg-accent/15 border-l-2 border-accent text-foreground' : 'text-muted'}`}>
                  <div>
                    <span className={e.mine ? 'text-accent' : 'text-foreground/70'}>◉ {e.eye}</span> <span className="break-words">{e.words}</span>
                    {e.mine && !e.reply && <span className="text-accent/60 ml-2">· you · the cradle is thinking…</span>}
                  </div>
                  {e.reply && <div className="mt-1 pl-4 text-success break-words">↩ the cradle answers you: <span className="text-foreground">{e.reply}</span></div>}
                </div>
              ))}
            </div>
          </div>
        )}

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

        {data?.flow && data.flow.length > 0 && (
          <div className="border border-border rounded-lg p-5 bg-surface mb-6">
            <div className="text-xs uppercase tracking-widest text-muted mb-3">live flow — the units thinking</div>
            {data.flow.slice(0, 14).map((l, i) => (
              <div key={l + i} className={`text-xs break-words ${l.includes('CHAMBER') ? 'text-warning' : l.includes('new eye') ? 'text-success' : 'text-muted'}`}>{l}</div>
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
