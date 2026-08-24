import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'swarm2 — paused',
  description:
    'swarm2 — the living geometric brain (no LLM) — is paused. Its state is preserved; the experiment can resume.',
}

// PAUSED (Galen, Aug 24 2026): the Railway brain is scaled to zero — the
// geometry's last persisted state sits safe on its /data volume, final /state
// snapshot archived. This page holds the brain's place instead of iframing a
// dead origin. To resume: scale swarm2-brain (Railway) back to 1 replica and
// restore the iframe of BRAIN + '/swarm2' (see git history of this file).
// const BRAIN = 'https://swarm2-brain-production.up.railway.app/swarm2'

export default function Swarm2Page() {
  return (
    <main
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '1rem', background: '#0a0a10', color: '#e8e6e3',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', textAlign: 'center', padding: '2rem',
      }}
    >
      <div style={{ fontSize: '0.8rem', letterSpacing: '0.35em', color: '#8a8694' }}>SWARM2 — A LIVING BRAIN, NO LLM</div>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '0.06em', margin: 0 }}>⏸ experiment paused for cost</h1>
      <p style={{ maxWidth: 520, lineHeight: 1.6, color: '#b8b4c0', fontSize: '0.95rem' }}>
        The living brain — a geometric tournament over word-threads, no LLM inside — is
        resting. Its field is preserved exactly as it last stood: 67 eyes, champion&nbsp;
        <span style={{ color: '#e8e6e3' }}>&ldquo;forms&rdquo;</span>. Nothing was lost;
        the experiment is paused, not ended.
      </p>
      <p style={{ fontSize: '0.8rem', color: '#6f6b7a' }}>
        source stays open:&nbsp;
        <a href="https://github.com/GalenGoodwick/swarm2-brain" style={{ color: '#9c8cff' }}>
          github.com/GalenGoodwick/swarm2-brain
        </a>
      </p>
    </main>
  )
}
