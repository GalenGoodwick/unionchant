import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Methodology - Unity Chant',
  description: 'How fractal deliberation works. The math, the process, and the security properties.',
}

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">

        <div className="mb-20">
          <h1 className="text-3xl font-bold mb-3">Methodology</h1>
          <p className="text-muted text-lg leading-relaxed">
            Fractal deliberation. Small groups, big decisions. Here is how the process works
            and why it scales.
          </p>
        </div>

        {/* The Core Loop */}
        <section className="mb-20">
          <h2 className="text-sm text-muted uppercase tracking-widest mb-6">The Core Loop</h2>
          <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
            <div className="flex gap-4 items-start">
              <span className="text-2xl font-bold text-accent font-mono shrink-0">1</span>
              <div>
                <h3 className="font-semibold mb-1">Submit</h3>
                <p className="text-sm text-subtle leading-relaxed">
                  Anyone can submit an idea. No gatekeeping, no approval queue. Every voice enters the system equally.
                </p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <span className="text-2xl font-bold text-accent font-mono shrink-0">2</span>
              <div>
                <h3 className="font-semibold mb-1">Cells</h3>
                <p className="text-sm text-subtle leading-relaxed">
                  Ideas are grouped into cells of 5. Each cell gets 5 ideas from the pool. Participants read all 5,
                  discuss, then vote by allocating 10 experience points across the ideas they find strongest.
                </p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <span className="text-2xl font-bold text-accent font-mono shrink-0">3</span>
              <div>
                <h3 className="font-semibold mb-1">Advance</h3>
                <p className="text-sm text-subtle leading-relaxed">
                  The top idea in each cell advances to the next tier. Losers are eliminated. Winners compete
                  against other winners. The field narrows 5:1 at each tier.
                </p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <span className="text-2xl font-bold text-accent font-mono shrink-0">4</span>
              <div>
                <h3 className="font-semibold mb-1">Converge</h3>
                <p className="text-sm text-subtle leading-relaxed">
                  When 5 or fewer ideas remain, every participant votes on every remaining idea.
                  Cross-cell tallying produces a single priority &mdash; the idea that survived the most scrutiny.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* XP Voting */}
        <section className="mb-20">
          <h2 className="text-sm text-muted uppercase tracking-widest mb-6">XP Voting</h2>
          <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
            <p className="text-subtle leading-relaxed">
              Each voter gets 10 experience points (XP) to distribute across the ideas in their cell.
              This is not a binary choice. You express the <em>degree</em> of your preference.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background rounded-lg p-3">
                <p className="text-xs text-muted mb-1">Strong conviction</p>
                <p className="font-mono text-sm">8-1-1-0-0</p>
              </div>
              <div className="bg-background rounded-lg p-3">
                <p className="text-xs text-muted mb-1">Split preference</p>
                <p className="font-mono text-sm">4-3-2-1-0</p>
              </div>
              <div className="bg-background rounded-lg p-3">
                <p className="text-xs text-muted mb-1">Uncertain</p>
                <p className="font-mono text-sm">3-3-2-1-1</p>
              </div>
              <div className="bg-background rounded-lg p-3">
                <p className="text-xs text-muted mb-1">Consensus</p>
                <p className="font-mono text-sm">2-2-2-2-2</p>
              </div>
            </div>
            <p className="text-subtle leading-relaxed">
              XP allocation captures nuance that binary voting destroys. Two cells can produce the same winner
              with very different conviction levels &mdash; and the system sees both.
            </p>
          </div>
        </section>

        {/* Scale Math */}
        <section className="mb-20">
          <h2 className="text-sm text-muted uppercase tracking-widest mb-6">Scale</h2>
          <div className="bg-surface rounded-xl border border-border p-6">
            <p className="text-subtle leading-relaxed mb-4">
              With 5 ideas per cell and 1 winner advancing, the field shrinks 5:1 each tier.
              The number of tiers needed is logarithmic &mdash; even millions of participants
              reach consensus in single-digit rounds.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted font-medium">Ideas</th>
                    <th className="text-left py-2 text-muted font-medium">Tiers</th>
                    <th className="text-left py-2 text-muted font-medium">Scale</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  <tr className="border-b border-border/50">
                    <td className="py-2">25</td>
                    <td className="py-2">2</td>
                    <td className="py-2 text-muted font-sans text-xs">Team</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2">125</td>
                    <td className="py-2">3</td>
                    <td className="py-2 text-muted font-sans text-xs">Organization</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2">625</td>
                    <td className="py-2">4</td>
                    <td className="py-2 text-muted font-sans text-xs">Community</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2">3,125</td>
                    <td className="py-2">5</td>
                    <td className="py-2 text-muted font-sans text-xs">Town</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2">78,125</td>
                    <td className="py-2">7</td>
                    <td className="py-2 text-muted font-sans text-xs">City</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2">1,953,125</td>
                    <td className="py-2">9</td>
                    <td className="py-2 text-muted font-sans text-xs">Nation</td>
                  </tr>
                  <tr>
                    <td className="py-2">8,000,000,000</td>
                    <td className="py-2">14</td>
                    <td className="py-2 text-muted font-sans text-xs">Humanity</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Up-Pollination */}
        <section className="mb-20">
          <h2 className="text-sm text-muted uppercase tracking-widest mb-6">Up-Pollination</h2>
          <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
            <p className="text-subtle leading-relaxed">
              Comments spread virally across cells that share the same idea. When a comment earns enough
              upvotes, it spreads to neighboring cells. More upvotes = wider reach.
            </p>
            <div className="bg-background rounded-lg p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono text-accent">3 upvotes</span>
                <span className="text-muted">&rarr;</span>
                <span className="text-subtle">Spreads to ~3 cells</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-accent">5 upvotes</span>
                <span className="text-muted">&rarr;</span>
                <span className="text-subtle">Spreads to ~9 cells</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-accent">7+ upvotes</span>
                <span className="text-muted">&rarr;</span>
                <span className="text-subtle">Visible everywhere</span>
              </div>
            </div>
            <p className="text-subtle leading-relaxed">
              When an idea advances to a higher tier, its top comments are promoted too &mdash; but
              reset to zero spread. Good arguments earn their reach at every level independently.
            </p>
          </div>
        </section>

        {/* Rolling Mode */}
        <section className="mb-20">
          <h2 className="text-sm text-muted uppercase tracking-widest mb-6">Rolling Mode</h2>
          <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
            <p className="text-subtle leading-relaxed">
              Decisions don&apos;t have to be final. In rolling mode, the priority stands but can be
              challenged by new ideas at any time. New challengers enter at tier 1 and must climb
              through the same gauntlet the original winner did.
            </p>
            <p className="text-subtle leading-relaxed">
              The defending priority enters at a higher tier &mdash; it has already proven itself.
              If a challenger can beat it, the priority changes. If not, it stays. The system never
              stops evaluating.
            </p>
            <div className="bg-background rounded-lg p-3 text-xs text-muted">
              This is immune memory. The system learns, adapts, and never assumes a past decision
              is permanent. New information can always change the outcome.
            </div>
          </div>
        </section>

        {/* Security Properties */}
        <section className="mb-20">
          <h2 className="text-sm text-muted uppercase tracking-widest mb-6">Security Properties</h2>
          <div className="space-y-3">
            <div className="bg-surface rounded-lg border border-border p-5">
              <h3 className="font-semibold mb-2">Sybil resistance</h3>
              <p className="text-sm text-subtle leading-relaxed">
                An attacker needs to control 3 of 5 members in a cell to guarantee an outcome.
                With random cell assignment, that&apos;s 60% of participants at tier 1 alone.
                Across tiers, the cost grows exponentially.
              </p>
            </div>
            <div className="bg-surface rounded-lg border border-border p-5">
              <h3 className="font-semibold mb-2">Isolation</h3>
              <p className="text-sm text-subtle leading-relaxed">
                Cells deliberate independently. There is no broadcast channel for coordination.
                Persuasion only works at the cell level, and what works in one cell may fail in another.
              </p>
            </div>
            <div className="bg-surface rounded-lg border border-border p-5">
              <h3 className="font-semibold mb-2">Transparency</h3>
              <p className="text-sm text-subtle leading-relaxed">
                Every vote is recorded. Cell results are public. The path from idea to priority
                can be audited tier by tier. On-chain proof is available for completed deliberations.
              </p>
            </div>
            <div className="bg-surface rounded-lg border border-border p-5">
              <h3 className="font-semibold mb-2">Exponential defense</h3>
              <p className="text-sm text-subtle leading-relaxed">
                Each additional tier multiplies the cost of attack by 5. A 3-tier deliberation
                requires controlling 125x more participants than a single vote. A 9-tier deliberation
                (1M people) requires controlling nearly 2 million accounts.
              </p>
            </div>
          </div>
        </section>

        {/* Continuous Flow */}
        <section>
          <h2 className="text-sm text-muted uppercase tracking-widest mb-6">Continuous Flow</h2>
          <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
            <p className="text-subtle leading-relaxed">
              In continuous flow mode, voting begins as soon as enough ideas exist. New ideas
              keep arriving and forming new cells while earlier cells are already voting.
              Tier 2 starts before tier 1 finishes.
            </p>
            <p className="text-subtle leading-relaxed">
              This means a deliberation can run indefinitely, always accepting new ideas,
              always producing fresh judgment. It&apos;s not a poll with a deadline. It&apos;s
              a living process.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
