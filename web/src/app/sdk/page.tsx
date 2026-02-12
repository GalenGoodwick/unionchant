import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SDK - Unity Chant',
  description: 'Embed deliberation cells into any website or app. Drop-in widget for collective decision-making.',
}

export default function SDKPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-bold mb-2">Embed the Protocol</h1>
          <p className="text-muted text-lg">Drop a deliberation cell into any website. One tag. Full consensus engine.</p>
        </div>

        {/* Quick start */}
        <section className="mb-12">
          <h2 className="text-sm text-muted uppercase tracking-widest mb-4">Quick Start</h2>
          <div className="bg-surface rounded-xl border border-border p-5 font-mono text-sm overflow-x-auto">
            <div className="text-muted mb-2">{'<!-- Add to any HTML page -->'}</div>
            <div>
              <span className="text-accent">{'<script'}</span>
              <span className="text-warning">{' src'}</span>
              <span className="text-white">{'="https://unitychant.com/sdk/uc.js"'}</span>
              <span className="text-accent">{'></script>'}</span>
            </div>
            <div className="mt-3">
              <span className="text-accent">{'<uc-cell'}</span>
            </div>
            <div className="pl-4">
              <span className="text-warning">{'question'}</span>
              <span className="text-white">{'="What should we build next?"'}</span>
            </div>
            <div className="pl-4">
              <span className="text-warning">{'cell-size'}</span>
              <span className="text-white">{'="5"'}</span>
            </div>
            <div className="pl-4">
              <span className="text-warning">{'theme'}</span>
              <span className="text-white">{'="dark"'}</span>
            </div>
            <div>
              <span className="text-accent">{'></uc-cell>'}</span>
            </div>
          </div>
        </section>

        {/* What you get */}
        <section className="mb-12">
          <h2 className="text-sm text-muted uppercase tracking-widest mb-4">What You Get</h2>
          <div className="grid gap-3">
            {[
              { label: 'Full deliberation loop', desc: 'Submit ideas, discuss, vote, advance tiers. The entire consensus engine in an iframe.' },
              { label: 'Portable identity', desc: 'Users authenticate once. Their reputation carries across every embedded cell on every site.' },
              { label: 'On-chain proof', desc: 'Every completed deliberation produces a Solana memo chain. Cryptographic proof the process ran.' },
              { label: 'Webhooks', desc: 'Get notified when ideas are submitted, votes cast, tiers complete, or winners declared.' },
              { label: 'Theming', desc: 'Match your brand. Custom colors, terminology, cell sizes. Light or dark.' },
            ].map(item => (
              <div key={item.label} className="bg-surface rounded-lg border border-border px-4 py-3">
                <span className="text-sm font-medium text-foreground">{item.label}</span>
                <span className="text-sm text-muted ml-2">&mdash; {item.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* React / npm */}
        <section className="mb-12">
          <h2 className="text-sm text-muted uppercase tracking-widest mb-4">React</h2>
          <div className="bg-surface rounded-xl border border-border p-5 font-mono text-sm overflow-x-auto">
            <div className="text-muted mb-3">npm install @unitychant/react</div>
            <div>
              <span className="text-purple">{'import'}</span>
              <span className="text-white">{' { UCCell } '}</span>
              <span className="text-purple">{'from'}</span>
              <span className="text-white">{" '@unitychant/react'"}</span>
            </div>
            <div className="mt-3">
              <span className="text-accent">{'<UCCell'}</span>
            </div>
            <div className="pl-4">
              <span className="text-warning">{'question'}</span>
              <span className="text-white">{'="What should we build next?"'}</span>
            </div>
            <div className="pl-4">
              <span className="text-warning">{'onWinner'}</span>
              <span className="text-white">{'={(idea) => console.log(idea)}'}</span>
            </div>
            <div>
              <span className="text-accent">{'/>'}</span>
            </div>
          </div>
        </section>

        {/* How it scales */}
        <section className="mb-12">
          <h2 className="text-sm text-muted uppercase tracking-widest mb-4">How It Scales</h2>
          <p className="text-subtle text-sm leading-relaxed mb-4">
            Each embedded cell runs the full tiered deliberation engine. 5 people per cell, winners advance, tiers reduce ideas 5:1.
            A million participants resolve in 9 rounds. The widget handles cell formation, voting, tier advancement, and result declaration automatically.
          </p>
          <div className="flex gap-6 font-mono text-center">
            <div>
              <div className="text-2xl font-bold text-white">5</div>
              <div className="text-xs text-muted">per cell</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">5:1</div>
              <div className="text-xs text-muted">per tier</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">9</div>
              <div className="text-xs text-muted">tiers for 1M</div>
            </div>
          </div>
        </section>

        {/* Status */}
        <section>
          <div className="bg-accent/10 border border-accent/30 rounded-lg px-4 py-3 text-sm">
            <span className="text-accent font-medium">Coming soon.</span>
            <span className="text-muted ml-1">The SDK is in development. The API is live now.</span>
          </div>
        </section>
      </div>
    </div>
  )
}
