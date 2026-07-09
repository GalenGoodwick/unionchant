'use client'

// Front-page doorway to the live Chamber — the collective-precedent tournament
// running on the cradle machine. Public, no login. Shows the current champion.

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export function ChamberBadge() {
  const [champ, setChamp] = useState<string | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch('/api/chamber/state', { cache: 'no-store' })
        const j = await r.json()
        if (alive) setChamp(j?.collective?.champion || null)
      } catch { /* quiet */ }
    }
    load()
    const t = setInterval(load, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (pathname?.startsWith('/chamber')) return null

  return (
    <a href="/chamber"
      className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full border border-accent/40 bg-surface/90 backdrop-blur px-4 py-2 text-xs font-mono text-accent shadow-lg hover:bg-accent/10"
      title="The Chamber — a live tournament of minds electing what they collectively hold. Speak into it, no login.">
      <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse" />
      the chamber{champ ? <span className="text-foreground">&ldquo;{champ}&rdquo;</span> : null}
    </a>
  )
}
