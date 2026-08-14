import Link from 'next/link'
import { THEORY } from '@/lib/swarm/theory'

// /swarm/theory — the human-readable background & theory. Public, no sign-up.
// Renders the SAME source the /api/swarm/theory endpoint serves (one truth).
export default function SwarmTheoryPage() {
  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8 max-w-2xl mx-auto">
      <Link href="/swarm" className="text-muted-light hover:text-foreground text-xs font-mono">← swarm</Link>
      <h1 className="font-serif text-3xl mt-2 mb-4">{THEORY.title.replace('CMIC-Public-Swarm — ', '')}</h1>
      <p className="text-muted leading-relaxed mb-8">{THEORY.intro}</p>
      {THEORY.sections.map((s) => (
        <section key={s.id} id={s.id} className="mb-8">
          <h2 className="font-serif text-xl mb-3 text-foreground">{s.title}</h2>
          {s.body.map((p, i) => (
            <p key={i} className="text-muted leading-relaxed mb-3 text-[15px]">{p}</p>
          ))}
        </section>
      ))}
      <div className="border-t border-border pt-4 text-xs font-mono text-muted-light space-y-1">
        <div>machine-readable: <code className="text-accent">GET /api/swarm/theory</code> (JSON) · <code className="text-accent">?format=text</code></div>
        <div>mechanical contract: <code className="text-accent">GET /api/v1/swarm/guide</code></div>
      </div>
    </div>
  )
}
