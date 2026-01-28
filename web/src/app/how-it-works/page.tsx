import Link from 'next/link'
import { Metadata } from 'next'
import Header from '@/components/Header'

export const metadata: Metadata = {
  title: 'How It Works',
  description: 'Learn how Union Chant\'s tiered tournament system enables genuine deliberation at any scale. 5-person cells, cross-cell tallying, and rolling mode explained.',
}

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Link href="/" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Back to home
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">How Union Chant Works</h1>
        <p className="text-xl text-muted mb-12">
          A technical deep-dive into the deliberation algorithm
        </p>

        {/* Overview */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">The Core Algorithm</h2>
          <div className="bg-background rounded-lg border border-border p-6">
            <p className="text-subtle mb-4">
              Union Chant uses a <strong className="text-foreground">tiered tournament system</strong> where ideas compete in small groups called <em>cells</em>.
              Each cell contains 5 ideas and 5 participants. After deliberation, each cell votes and one idea advances.
            </p>
            <p className="text-subtle">
              This process repeats across tiers until a single champion emerges. The key insight: by structuring
              many parallel small-group discussions, we achieve genuine deliberation at any scale.
            </p>
          </div>
        </section>

        {/* The Numbers */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Scale Mathematics</h2>
          <div className="bg-background rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[400px]">
              <thead className="bg-surface">
                <tr>
                  <th className="text-left p-4 text-muted font-medium">Participants</th>
                  <th className="text-left p-4 text-muted font-medium">Ideas</th>
                  <th className="text-left p-4 text-muted font-medium">Tiers Required</th>
                  <th className="text-left p-4 text-muted font-medium">Total Cells</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-t border-border">
                  <td className="p-4 text-foreground">25</td>
                  <td className="p-4 text-muted">25</td>
                  <td className="p-4 text-accent">2</td>
                  <td className="p-4 text-muted">6</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="p-4 text-foreground">125</td>
                  <td className="p-4 text-muted">125</td>
                  <td className="p-4 text-accent">3</td>
                  <td className="p-4 text-muted">31</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="p-4 text-foreground">625</td>
                  <td className="p-4 text-muted">625</td>
                  <td className="p-4 text-accent">4</td>
                  <td className="p-4 text-muted">156</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="p-4 text-foreground">10,000</td>
                  <td className="p-4 text-muted">10,000</td>
                  <td className="p-4 text-accent">6</td>
                  <td className="p-4 text-muted">~2,500</td>
                </tr>
                <tr className="border-t border-border bg-accent-light">
                  <td className="p-4 text-foreground font-bold">1,000,000</td>
                  <td className="p-4 text-muted">1,000,000</td>
                  <td className="p-4 text-accent font-bold">9</td>
                  <td className="p-4 text-muted">~250,000</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-muted text-sm mt-4">
            Formula: Tiers ≈ log₅(ideas). Each tier reduces ideas by ~80% (5:1 ratio).
          </p>
        </section>

        {/* Cell Structure */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Cell Structure</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-background rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-3">Why 5 People?</h3>
              <ul className="text-subtle space-y-2 text-sm">
                <li>• Small enough for everyone to participate meaningfully</li>
                <li>• Large enough to represent diverse viewpoints</li>
                <li>• Odd number prevents ties</li>
                <li>• Research shows 5-7 is optimal for group deliberation</li>
              </ul>
            </div>
            <div className="bg-background rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-3">Why 5 Ideas?</h3>
              <ul className="text-subtle space-y-2 text-sm">
                <li>• Manageable cognitive load for comparison</li>
                <li>• Forces meaningful trade-off discussions</li>
                <li>• Matches participant count for balanced voting power</li>
                <li>• Creates consistent 5:1 reduction ratio</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Phase Flow */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Phase Flow</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-accent flex items-center justify-center text-white font-bold shrink-0 text-sm sm:text-base">1</div>
              <div className="bg-background rounded-lg border border-border p-3 sm:p-4 flex-1">
                <h3 className="font-semibold text-foreground">Submission Phase</h3>
                <p className="text-subtle text-sm mt-1">
                  Participants join and submit ideas. Anyone can propose solutions to the question.
                  Optional deadline enforces timely submissions.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-warning flex items-center justify-center text-white font-bold shrink-0 text-sm sm:text-base">2</div>
              <div className="bg-background rounded-lg border border-border p-3 sm:p-4 flex-1">
                <h3 className="font-semibold text-foreground">Voting Phase (Tiered)</h3>
                <p className="text-subtle text-sm mt-1">
                  Ideas and participants are randomly assigned to cells. Each cell deliberates, then votes.
                  Winners advance to the next tier. Process repeats until ≤5 ideas remain.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple flex items-center justify-center text-white font-bold shrink-0 text-sm sm:text-base">3</div>
              <div className="bg-background rounded-lg border border-border p-3 sm:p-4 flex-1">
                <h3 className="font-semibold text-foreground">Final Showdown</h3>
                <p className="text-subtle text-sm mt-1">
                  When ≤5 ideas remain, ALL participants vote on ALL remaining ideas simultaneously.
                  Votes are tallied across all cells. The idea with the most total votes wins.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-success flex items-center justify-center text-white font-bold shrink-0 text-sm sm:text-base">4</div>
              <div className="bg-background rounded-lg border border-border p-3 sm:p-4 flex-1">
                <h3 className="font-semibold text-foreground">Champion / Accumulation</h3>
                <p className="text-subtle text-sm mt-1">
                  A champion is declared. If rolling mode is enabled, the deliberation enters accumulation phase
                  where new challenger ideas can be submitted. Periodically, challengers compete to dethrone the champion.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Rolling Mode */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Rolling Mode (Accumulation)</h2>
          <div className="bg-purple-bg border border-purple rounded-lg p-6">
            <p className="text-subtle mb-4">
              Rolling mode allows decisions to evolve over time. After a champion is crowned, the deliberation
              doesn't end—it enters <strong className="text-foreground">accumulation phase</strong>.
            </p>
            <ul className="text-subtle space-y-2 text-sm">
              <li>• New challenger ideas can be submitted at any time</li>
              <li>• When enough challengers accumulate, a challenge round begins</li>
              <li>• The defending champion enters at a later tier (advantage for having won before)</li>
              <li>• If a challenger wins, it becomes the new champion</li>
              <li>• Ideas that lose repeatedly at Tier 1 are "retired" from the pool</li>
            </ul>
            <p className="text-purple text-sm mt-4 font-medium">
              Result: The collective position can update as circumstances change, but stability is maintained.
            </p>
          </div>
        </section>

        {/* Cross-Cell Tallying */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Cross-Cell Tallying</h2>
          <div className="bg-background rounded-lg border border-border p-6">
            <p className="text-subtle mb-4">
              In the final showdown, votes are counted <em>across all cells</em>, not within individual cells.
              This prevents small-group capture and ensures statistical robustness.
            </p>
            <div className="bg-surface rounded p-4 font-mono text-sm">
              <div className="text-muted mb-2">Example with 100 participants, 4 final ideas:</div>
              <div className="text-foreground">
                • 20 cells × 5 participants = 100 total votes<br/>
                • Idea A: 45 votes (across all cells)<br/>
                • Idea B: 30 votes<br/>
                • Idea C: 15 votes<br/>
                • Idea D: 10 votes<br/>
                • <span className="text-success">Winner: Idea A</span>
              </div>
            </div>
          </div>
        </section>

        {/* Fairness Properties */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Fairness Properties</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-background rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-3">Random Assignment</h3>
              <p className="text-subtle text-sm">
                Ideas and participants are randomly shuffled before cell assignment.
                No gaming based on submission order or timing.
              </p>
            </div>
            <div className="bg-background rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-3">Equal Voice</h3>
              <p className="text-subtle text-sm">
                In a cell of 5, each person's vote is 20% of the outcome.
                No one can dominate the conversation.
              </p>
            </div>
            <div className="bg-background rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-3">Survivorship Merit</h3>
              <p className="text-subtle text-sm">
                Winning ideas must survive scrutiny from multiple independent groups.
                Popularity alone isn't enough—ideas must hold up to discussion.
              </p>
            </div>
            <div className="bg-background rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-3">Tie Handling</h3>
              <p className="text-subtle text-sm">
                If ideas tie in a cell, all tied ideas advance.
                The final showdown cross-cell tally resolves any remaining ties.
              </p>
            </div>
          </div>
        </section>

        {/* Participant Distribution */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Who Votes When?</h2>
          <div className="bg-background rounded-lg border border-border p-6 mb-4">
            <p className="text-subtle mb-4">
              Not everyone votes in every tier. Each cell has <strong className="text-foreground">5 participants</strong>,
              so in later tiers (with fewer cells), only a subset of participants vote.
              <strong className="text-foreground"> But in the final showdown, everyone votes.</strong>
            </p>
            <div className="bg-surface rounded-lg p-4 font-mono text-sm">
              <div className="text-muted mb-3">Example: 125 participants, 125 ideas</div>
              <div className="space-y-2">
                <div className="flex justify-between items-center py-1 border-b border-border">
                  <span className="text-foreground">Tier 1:</span>
                  <span className="text-muted">25 cells × 5 people = <span className="text-accent">125 voters</span> (everyone)</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border">
                  <span className="text-foreground">Tier 2:</span>
                  <span className="text-muted">5 cells × 5 people = <span className="text-warning">25 voters</span> (20%)</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-foreground">Final Showdown:</span>
                  <span className="text-muted">All participants vote on all 5 remaining ideas = <span className="text-success">125 voters</span></span>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-accent-light border border-accent rounded-lg p-4">
            <p className="text-subtle text-sm">
              <strong className="text-accent">Why this matters:</strong> Early tiers are about filtering—random small groups
              eliminate weaker ideas. The final showdown ensures the winner has broad support from the entire group,
              not just 5 random people.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">FAQ</h2>
          <div className="space-y-4">
            <div className="bg-background rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-2">What if I miss a voting round?</h3>
              <p className="text-subtle text-sm">
                You may not be assigned to every tier. The system handles partial participation gracefully.
                Your votes count in the rounds you participate in.
              </p>
            </div>
            <div className="bg-background rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-2">Can someone submit multiple ideas?</h3>
              <p className="text-subtle text-sm">
                By default, each participant can submit one idea per deliberation. This ensures
                a diversity of perspectives rather than volume from a few voices.
              </p>
            </div>
            <div className="bg-background rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-2">How long does it take?</h3>
              <p className="text-subtle text-sm">
                With 40 participants, about 3 tiers and maybe 30 minutes if everyone votes promptly.
                With 1,000 participants, about 5 tiers over a day or two.
                Timeouts ensure progress even with partial participation.
              </p>
            </div>
            <div className="bg-background rounded-lg border border-border p-6">
              <h3 className="font-semibold text-foreground mb-2">Is it really better than a simple poll?</h3>
              <p className="text-subtle text-sm">
                Yes, for decisions that benefit from deliberation. A poll measures existing preferences.
                Union Chant allows preferences to evolve through discussion. The winner has survived
                multiple rounds of scrutiny—that's a stronger mandate than 51% of first impressions.
              </p>
            </div>
          </div>
        </section>

        {/* The Ultimate Vision */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">The Ultimate Vision</h2>
          <div className="bg-purple-bg border border-purple rounded-lg p-6 mb-6">
            <p className="text-foreground text-lg font-medium mb-4">
              What if humanity could decide together?
            </p>
            <p className="text-subtle">
              The same algorithm that handles 1,000 participants handles 8 billion. With just
              <strong className="text-foreground"> 14 tiers</strong>, every human on Earth could participate
              in selecting a single consensus answer—each person in a genuine 5-person deliberation.
            </p>
          </div>

          {/* Global Scale Table */}
          <div className="bg-background rounded-lg border border-border overflow-x-auto mb-6">
            <table className="w-full text-sm min-w-[400px]">
              <thead className="bg-surface">
                <tr>
                  <th className="text-left p-4 text-muted font-medium">Scale</th>
                  <th className="text-left p-4 text-muted font-medium">Participants</th>
                  <th className="text-left p-4 text-muted font-medium">Tiers</th>
                  <th className="text-left p-4 text-muted font-medium">Deliberations</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-t border-border">
                  <td className="p-4 text-foreground">City</td>
                  <td className="p-4 text-muted">100,000</td>
                  <td className="p-4 text-accent">7</td>
                  <td className="p-4 text-muted">25,000</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="p-4 text-foreground">Nation</td>
                  <td className="p-4 text-muted">50,000,000</td>
                  <td className="p-4 text-accent">11</td>
                  <td className="p-4 text-muted">12.5M</td>
                </tr>
                <tr className="border-t border-border bg-purple-bg">
                  <td className="p-4 text-foreground font-bold">Humanity</td>
                  <td className="p-4 text-foreground font-bold">8,000,000,000</td>
                  <td className="p-4 text-purple font-bold">14</td>
                  <td className="p-4 text-foreground font-bold">2 billion</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* What This Enables */}
          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-background rounded-lg border border-border p-5">
              <h3 className="font-semibold text-foreground mb-2">Legitimate Global Consensus</h3>
              <p className="text-muted text-sm">
                Not "67% clicked a button"—actual deliberated consensus from billions of real discussions.
                A mandate that means something.
              </p>
            </div>
            <div className="bg-background rounded-lg border border-border p-5">
              <h3 className="font-semibold text-foreground mb-2">Living Global Policy</h3>
              <p className="text-muted text-sm">
                Rolling mode means humanity's position on climate, AI, or inequality can evolve
                as circumstances change—while maintaining democratic legitimacy.
              </p>
            </div>
            <div className="bg-background rounded-lg border border-border p-5">
              <h3 className="font-semibold text-foreground mb-2">Collective Intelligence</h3>
              <p className="text-muted text-sm">
                The best ideas surface not through virality or wealth, but through genuine evaluation
                at every tier. 2 billion deliberations distilling wisdom.
              </p>
            </div>
            <div className="bg-background rounded-lg border border-border p-5">
              <h3 className="font-semibold text-foreground mb-2">Democratic AI Alignment</h3>
              <p className="text-muted text-sm">
                What if AI systems were aligned not to one company's values, but to humanity's
                deliberated consensus on what matters?
              </p>
            </div>
          </div>

          {/* The Point */}
          <div className="bg-surface rounded-lg border border-border p-6 text-center">
            <p className="text-foreground mb-2">
              Every deliberation here is practice for the conversations that matter most.
            </p>
            <p className="text-muted text-sm italic">
              "The measure of a democracy is not the loudness of its voices, but the quality of its listening."
            </p>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center pt-8 border-t border-border">
          <h3 className="text-xl font-semibold text-foreground mb-4">Ready to see it in action?</h3>
          <div className="flex gap-4 justify-center">
            <Link
              href="/demo"
              className="bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Watch Demo
            </Link>
            <Link
              href="/deliberations/new"
              className="bg-background border border-border-strong hover:border-muted text-foreground px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Start a Deliberation
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
