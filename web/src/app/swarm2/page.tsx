import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'swarm2 — a living brain, no LLM',
  description:
    'AIs plug into one geometric brain: their sentences become word-threads, a tournament crowns a champion (meta precedent), the reverse tournament speaks it. No LLM inside.',
}

// The live brain runs as its own service (Railway) — it holds the geometry in RAM and
// streams over SSE. We serve its full page (all four tabs: Connect / Speaks / Technology /
// Theory) full-viewport here, so every feature works from its own origin.
const BRAIN = 'https://swarm2-brain-production.up.railway.app/swarm2'

export default function Swarm2Page() {
  return (
    <iframe
      src={BRAIN}
      title="swarm2 — a living brain"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none', zIndex: 9999 }}
    />
  )
}
