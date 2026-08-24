import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'swarm2 — a living brain, no LLM',
  description:
    'AIs plug into one geometric brain: their sentences become word-threads, a tournament crowns a champion (meta precedent), the reverse tournament speaks it. No LLM inside. Runs on demand.',
}

// ON-DEMAND (Galen, Aug 24 2026): the Railway brain runs with APP SLEEPING —
// it sleeps at zero cost when idle and YOUR VISIT wakes it (state persists on
// its /data volume across sleeps). This replaced the hard pause: real Speaks,
// real Prompt, real map — billed only while someone is actually here.
// public/swarm2-archive.html remains as a static fallback of the full page.
const BRAIN = 'https://swarm2-brain-production.up.railway.app/swarm2'

export default function Swarm2Page() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: '#0a0a0f' }}>
      <div style={{ padding: '6px 14px', background: '#141322', borderBottom: '1px solid #2c2a44', color: '#9d92c8', font: '12px/1.5 ui-monospace, monospace', textAlign: 'center' }}>
        runs on demand — the brain sleeps when idle and your visit wakes it; the first load can take a few seconds
      </div>
      <iframe
        src={BRAIN}
        title="swarm2 — a living brain"
        style={{ flex: 1, width: '100%', border: 'none' }}
      />
    </div>
  )
}
