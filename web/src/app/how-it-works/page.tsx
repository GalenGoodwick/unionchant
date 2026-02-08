import Link from 'next/link'
import { Metadata } from 'next'
import Header from '@/components/Header'

export const metadata: Metadata = {
  title: 'How It Works',
  description: 'Learn how Unity Chant works — submit ideas, discuss in small groups, vote with points, and surface the best answers together.',
}

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Link href="/" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Back to Home
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">How Unity Chant Works</h1>
        <p className="text-lg text-muted mb-10">
          A quick guide to participating in chants
        </p>

        {/* What is a Chant */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">What is a Chant?</h2>
          <p className="text-subtle text-sm leading-relaxed">
            A Chant is a question posed to a group. Anyone can submit an idea, and together the group
            narrows down to the strongest answer through small-group discussions and voting.
          </p>
        </section>

        {/* Step by step */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-4">Your Journey</h2>
          <div className="space-y-3">

            <Step number={1} color="bg-accent" title="Join and Submit">
              Find a Chant on your Feed or browse open chants. Submit your idea — one per person,
              so make it count.
            </Step>

            <Step number={2} color="bg-blue" title="Discuss in Your Cell">
              You&apos;re placed in a cell with 4 other people and 5 ideas. Read all the ideas,
              then comment. Upvoted comments spread to other cells discussing the same idea.
            </Step>

            <Step number={3} color="bg-warning" title="Allocate 10 Vote Points">
              You get 10 Vote Points. Drag the sliders to distribute them across the ideas you
              support. You can put all 10 on one idea or spread them around — your call.
            </Step>

            <Step number={4} color="bg-success" title="Winners Advance">
              The top idea in each cell moves to the next tier. New cells form with the surviving
              ideas. This repeats until a priority emerges.
            </Step>

          </div>
        </section>

        {/* Vote Points */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Vote Points</h2>
          <div className="bg-background rounded-lg border border-border p-4">
            <p className="text-subtle text-sm leading-relaxed mb-3">
              Every voter gets <strong className="text-foreground">10 Vote Points</strong> per cell.
              This lets you express how strongly you feel, not just which idea you prefer.
            </p>
            <div className="bg-surface rounded p-3 text-sm space-y-1.5 font-mono">
              <div className="flex justify-between"><span className="text-muted">All-in:</span> <span className="text-foreground">10-0-0-0-0</span></div>
              <div className="flex justify-between"><span className="text-muted">Split favorite:</span> <span className="text-foreground">6-4-0-0-0</span></div>
              <div className="flex justify-between"><span className="text-muted">Spread wide:</span> <span className="text-foreground">4-3-2-1-0</span></div>
            </div>
            <p className="text-muted text-xs mt-3">
              All 10 points must be allocated before you can submit.
            </p>
          </div>
        </section>

        {/* Comments */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Comments and Up-Pollination</h2>
          <div className="bg-background rounded-lg border border-border p-4">
            <p className="text-subtle text-sm leading-relaxed mb-3">
              Tap the chat icon on any idea to comment on it. Your comment is visible to your cell.
              If others upvote it, it starts spreading to other cells that share the same idea.
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-purple shrink-0 mt-0.5">2 upvotes</span>
                <span className="text-muted">&rarr; spreads to 1 additional cell</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple shrink-0 mt-0.5">4 upvotes</span>
                <span className="text-muted">&rarr; spreads to 2 additional cells</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple shrink-0 mt-0.5">Keep going</span>
                <span className="text-muted">&rarr; every 2 more upvotes reach 1 more cell, until all cells with that idea see it</span>
              </div>
            </div>
            <p className="text-subtle text-xs mt-3">
              When an idea advances to the next tier, the top comment follows it and starts fresh.
            </p>
          </div>
        </section>

        {/* Feed */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Your Feed</h2>
          <div className="space-y-2">
            <FeedTab color="text-foreground" label="Feed">
              Actions you can take — vote, submit ideas, join new chants.
            </FeedTab>
            <FeedTab color="text-muted" label="Activity">
              What&apos;s happening across the platform — new chants, tier completions, results.
            </FeedTab>
            <FeedTab color="text-muted" label="Results">
              Completed chants with declared priorities.
            </FeedTab>
          </div>
        </section>

        {/* Tiers */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">How Tiers Work</h2>
          <div className="bg-background rounded-lg border border-border p-4">
            <div className="flex items-center gap-3 text-sm mb-3">
              <span className="bg-warning-bg text-warning px-2 py-0.5 rounded text-xs font-medium">Tier 1</span>
              <span className="text-muted">&rarr;</span>
              <span className="bg-warning-bg text-warning px-2 py-0.5 rounded text-xs font-medium">Tier 2</span>
              <span className="text-muted">&rarr;</span>
              <span className="bg-warning-bg text-warning px-2 py-0.5 rounded text-xs font-medium">...</span>
              <span className="text-muted">&rarr;</span>
              <span className="bg-success-bg text-success px-2 py-0.5 rounded text-xs font-medium">Priority</span>
            </div>
            <p className="text-subtle text-sm leading-relaxed mb-3">
              Each tier cuts ideas by ~80%. With 25 ideas, you need 2 tiers. With 125, you need 3.
              Even with a million ideas, it only takes 9 tiers.
            </p>
            <p className="text-subtle text-sm leading-relaxed">
              In the final tier, <strong className="text-foreground">everyone</strong> votes on the
              remaining ideas — not just the 5 people in a cell. This ensures the winner has broad support.
            </p>
          </div>
        </section>

        {/* Rolling Mode */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Rolling Mode</h2>
          <div className="bg-purple-bg border border-purple rounded-lg p-4">
            <p className="text-subtle text-sm leading-relaxed mb-3">
              Some chants don&apos;t end after a priority is declared. In rolling mode, the chant enters
              an <strong className="text-foreground">accepting new ideas</strong> phase. New challenger
              ideas can be submitted, and periodically a new round begins to test whether the priority
              still holds.
            </p>
            <p className="text-purple text-sm font-medium">
              The group&apos;s answer can evolve as circumstances change.
            </p>
          </div>
        </section>

        {/* Groups */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Groups</h2>
          <p className="text-subtle text-sm leading-relaxed">
            Groups are communities that run chants together. Join a group to see their chants in your feed.
            Groups can be public or private. Members have roles — owner, admin, or member.
          </p>
        </section>

        {/* Scale */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-foreground mb-3">Built to Scale</h2>
          <div className="bg-background rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className="text-left p-3 text-muted font-medium">Scale</th>
                  <th className="text-left p-3 text-muted font-medium">People</th>
                  <th className="text-left p-3 text-muted font-medium">Tiers</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm">
                <tr className="border-t border-border">
                  <td className="p-3 text-foreground">Team</td>
                  <td className="p-3 text-muted">25</td>
                  <td className="p-3 text-accent">2</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="p-3 text-foreground">Organization</td>
                  <td className="p-3 text-muted">625</td>
                  <td className="p-3 text-accent">4</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="p-3 text-foreground">City</td>
                  <td className="p-3 text-muted">100,000</td>
                  <td className="p-3 text-accent">7</td>
                </tr>
                <tr className="border-t border-border bg-purple-bg">
                  <td className="p-3 text-foreground font-semibold">Everyone</td>
                  <td className="p-3 text-foreground font-semibold">8 billion</td>
                  <td className="p-3 text-purple font-semibold">14</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center pt-8 border-t border-border">
          <h3 className="text-lg font-semibold text-foreground mb-4">Ready?</h3>
          <div className="flex gap-4 justify-center">
            <Link
              href="/chants"
              className="bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Go to Feed
            </Link>
            <Link
              href="/chants/new"
              className="bg-background border border-border-strong hover:border-muted text-foreground px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Start a Chant
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Step({ number, color, title, children }: { number: number; color: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
        {number}
      </div>
      <div className="bg-background rounded-lg border border-border p-3 flex-1">
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
        <p className="text-subtle text-sm mt-1 leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

function FeedTab({ color, label, children }: { color: string; label: string; children: React.ReactNode }) {
  return (
    <div className="bg-background rounded-lg border border-border p-3 flex items-start gap-3">
      <span className={`text-sm font-semibold ${color} shrink-0 w-16`}>{label}</span>
      <span className="text-subtle text-sm">{children}</span>
    </div>
  )
}
