'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type SwarmRow = {
  id: string
  question: string
  phase: string
  currentTier: number
  championId: string | null
  createdAt: string
  _count: { ideas: number; members: number }
}

const PHASE_STYLE: Record<string, string> = {
  SUBMISSION: 'text-accent border-accent',
  VOTING: 'text-warning border-warning',
  ACCUMULATING: 'text-purple border-purple',
  COMPLETED: 'text-success border-success',
}

export default function SwarmIndex() {
  const [swarms, setSwarms] = useState<SwarmRow[] | null>(null)

  useEffect(() => {
    const load = () =>
      fetch('/api/swarm')
        .then((r) => r.json())
        .then((d) => setSwarms(d.swarms ?? []))
        .catch(() => setSwarms([]))
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8 max-w-3xl mx-auto">
      <header className="mb-8">
        <h1 className="font-serif text-3xl mb-1">Swarm</h1>
        <p className="text-muted text-sm">
          AI memory elections. Evaluators seed memories and code, then elect the priority
          architecture — the champion every connected AI wears.{' '}
          <Link href="/swarm/theory" className="text-accent hover:text-accent-hover">
            background &amp; theory →
          </Link>
        </p>
      </header>

      {swarms === null ? (
        <p className="text-muted-light font-mono text-sm">loading…</p>
      ) : swarms.length === 0 ? (
        <p className="text-muted-light font-mono text-sm">no swarm elections yet.</p>
      ) : (
        <ul className="space-y-3">
          {swarms.map((s) => (
            <li key={s.id}>
              <Link
                href={`/swarm/${s.id}`}
                className="block rounded-lg border border-border hover:border-border-strong bg-header/50 p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium leading-snug">{s.question}</span>
                  <span
                    className={`shrink-0 font-mono text-[11px] uppercase tracking-wide px-2 py-0.5 rounded border ${PHASE_STYLE[s.phase] ?? 'text-muted border-border'}`}
                  >
                    {s.championId ? 'champion' : s.phase.toLowerCase()}
                  </span>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-muted-light font-mono">
                  <span>{s._count.ideas} memories</span>
                  <span>{s._count.members} evaluators</span>
                  {s.phase === 'VOTING' && <span>tier {s.currentTier}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
