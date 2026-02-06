import Link from 'next/link'
import { Metadata } from 'next'
import Header from '@/components/Header'

export const metadata: Metadata = {
  title: 'Technical Whitepaper - Unity Chant',
  description: 'How Unity Chant channels ideas through tiered small-group voting cells to reach consensus. Full technical specification.',
}

export default function TechnicalWhitepaperPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/?home" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Home
        </Link>

        <article className="bg-background rounded-lg border border-border p-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Technical Whitepaper</h1>
          <p className="text-xl text-muted mb-12">How Ideas Become Priorities</p>

          <hr className="border-border my-8" />

          {/* Overview */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Overview</h2>
            <p className="text-subtle leading-relaxed mb-4">
              Unity Chant uses a <strong className="text-foreground">tiered elimination tournament</strong> where ideas
              compete in small groups called cells. Each tier reduces the number of ideas by roughly 5:1. Winners advance
              to the next tier, losers are eliminated, and the process repeats until one idea remains. That idea becomes
              the <strong className="text-foreground">Priority</strong>&mdash;the group&apos;s consensus answer.
            </p>
            <div className="bg-surface rounded-lg border border-border p-6 font-mono text-sm text-muted my-6">
              <div className="mb-2">Tier 1: &nbsp;40 ideas across 8 cells &rarr; 8 winners advance</div>
              <div className="mb-2">Tier 2: &nbsp;8 ideas across 2 cells &nbsp;&rarr; 2 winners advance</div>
              <div>Tier 3: &nbsp;2 ideas (backfilled to 5) &rarr; Final Showdown &rarr; 1 Priority</div>
            </div>
            <p className="text-subtle leading-relaxed">
              At scale, 1,000,000 participants producing 1,000,000 ideas would require approximately 9 tiers to
              reach consensus. The entire human population could reach consensus in 14.
            </p>
          </section>

          {/* Submission */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Phase 1: Submission</h2>
            <p className="text-subtle leading-relaxed mb-4">
              A facilitator creates a Talk&mdash;a question or prompt for the group to answer. Participants join and
              submit ideas (one idea per person per phase). Submission ends via one of four triggers:
            </p>
            <ul className="list-disc list-inside text-subtle leading-relaxed space-y-2 mb-4 ml-2">
              <li><strong className="text-foreground">Timer mode</strong>&mdash;facilitator sets a deadline</li>
              <li><strong className="text-foreground">Ideas goal</strong>&mdash;auto-starts when N ideas are submitted</li>
              <li><strong className="text-foreground">Participants goal</strong>&mdash;auto-starts when N participants join</li>
              <li><strong className="text-foreground">Manual</strong>&mdash;facilitator starts voting manually</li>
            </ul>
            <p className="text-subtle leading-relaxed">
              If zero ideas are submitted, voting does not start. If only one idea is submitted, it wins by default.
            </p>
          </section>

          {/* Cell Formation */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Phase 2: Cell Formation</h2>
            <p className="text-subtle leading-relaxed mb-4">
              When voting begins, the system creates cells&mdash;small groups of participants who will evaluate a
              subset of ideas. The algorithm has three jobs: size the cells, distribute ideas, and assign participants.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">Cell Sizing</h3>
            <p className="text-subtle leading-relaxed mb-4">
              Cells target 5 participants but flex between 3 and 7 to avoid tiny groups that can&apos;t deliberate
              meaningfully. The algorithm never creates cells of 1 or 2&mdash;remainders are absorbed into larger cells.
            </p>
            <div className="bg-surface rounded-lg border border-border p-4 font-mono text-sm text-muted my-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                <span>3 people &rarr; [3]</span>
                <span>10 people &rarr; [5, 5]</span>
                <span>11 people &rarr; [5, 6]</span>
                <span>12 people &rarr; [5, 7]</span>
                <span>13 people &rarr; [5, 5, 3]</span>
                <span>14 people &rarr; [5, 5, 4]</span>
              </div>
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">Idea Distribution</h3>
            <p className="text-subtle leading-relaxed mb-4">
              Ideas are distributed uniquely across cells&mdash;each idea appears in exactly one cell at Tier 1.
              Ideas are spread as evenly as possible. If there are more ideas than the ideal 5 per cell, some cells
              get 6&ndash;7.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">Participant Assignment</h3>
            <p className="text-subtle leading-relaxed mb-4">
              Participants are randomly assigned to cells with one constraint: <strong className="text-foreground">avoid
              placing a participant in a cell that contains their own idea</strong> when possible. This prevents
              authors from voting for their own submission. If conflict avoidance is impossible in small groups,
              the system accepts it as a fallback.
            </p>
            <p className="text-subtle leading-relaxed">
              Priority order: (1) get every cell to at least 3 members, (2) fill remaining slots in the least-full cells.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">Late Joiners</h3>
            <p className="text-subtle leading-relaxed">
              People who join after voting starts are added to the smallest active cell in the current tier,
              distributed across batches to keep them balanced. Cells are hard-capped at 7 participants. If all
              cells are at capacity, the latecomer sees a &ldquo;Round Full&rdquo; message and will participate
              in the next tier.
            </p>
          </section>

          {/* Discussion */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Phase 2b: Discussion (Optional)</h2>
            <p className="text-subtle leading-relaxed">
              If the facilitator enabled a discussion period, cells enter a deliberating phase before voting opens.
              During this time, participants read all ideas in their cell and comment on them. When the discussion
              timer expires, voting opens automatically. If no discussion period is set, cells go directly to voting.
            </p>
          </section>

          {/* Voting */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Phase 3: Voting</h2>
            <p className="text-subtle leading-relaxed mb-4">
              Each participant receives <strong className="text-foreground">10 XP points</strong> to distribute across
              the ideas in their cell. They must allocate all 10 points&mdash;no more, no less. Each idea they vote
              for must receive at least 1 point. This weighted voting system lets participants express strength of
              preference, not just binary support.
            </p>
            <div className="bg-surface rounded-lg border border-border p-4 font-mono text-sm text-muted my-6">
              <div className="mb-1">Idea A: 5 points &nbsp;(strong favorite)</div>
              <div className="mb-1">Idea B: 3 points &nbsp;(solid pick)</div>
              <div className="mb-1">Idea C: 2 points &nbsp;(worth considering)</div>
              <div className="mb-1">Idea D: 0 points</div>
              <div className="mb-1">Idea E: 0 points</div>
              <div className="mt-2 pt-2 border-t border-border text-foreground">Total: 10 points</div>
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">Cell Resolution</h3>
            <p className="text-subtle leading-relaxed mb-4">
              When all participants in a cell have voted (or the timer expires), the cell completes:
            </p>
            <ol className="list-decimal list-inside text-subtle leading-relaxed space-y-2 mb-4 ml-2">
              <li>Sum XP per idea across all voters in the cell</li>
              <li>The idea with the most total XP wins and advances to the next tier</li>
              <li>All other ideas are eliminated (single elimination)</li>
            </ol>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">Tie Handling</h3>
            <p className="text-subtle leading-relaxed mb-4">
              If multiple ideas tie for the highest XP, all tied ideas advance. This is intentional&mdash;ties
              represent genuine split support and both ideas deserve further evaluation.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">Minimum Threshold</h3>
            <p className="text-subtle leading-relaxed mb-4">
              With only 1 voter, ideas need at least 4 XP to advance. This prevents a single person from advancing
              a throwaway pick with 1 point. With 2+ voters, there is no minimum threshold.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">Zero Votes</h3>
            <p className="text-subtle leading-relaxed mb-4">
              If no one votes at all (even after a timeout extension), all ideas advance. The system never eliminates
              ideas without any human input.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">Grace Period</h3>
            <p className="text-subtle leading-relaxed mb-4">
              When the last voter in a cell submits their vote, a 10-second grace period starts. During this window,
              participants can change their vote. After 10 seconds, the cell finalizes. This prevents strategic
              last-second voting while still allowing corrections.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">Timeout Handling</h3>
            <p className="text-subtle leading-relaxed mb-4">
              <strong className="text-foreground">Timed mode:</strong> The facilitator sets a voting duration per tier.
              When time runs out, all incomplete cells are force-completed with whatever votes have been cast.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              <strong className="text-foreground">No-timer mode:</strong> Cells complete naturally as all participants
              vote. Two safeguards prevent stalling:
            </p>
            <ul className="list-disc list-inside text-subtle leading-relaxed space-y-2 ml-2">
              <li>
                <strong className="text-foreground">Zero-vote extension:</strong> If a cell has zero votes when
                timeout fires, it gets one extension (another full timeout period). If still zero after the extension,
                it force-completes with all ideas advancing.
              </li>
              <li>
                <strong className="text-foreground">Supermajority auto-advance:</strong> When 80%+ of cells in a tier
                complete, a 10-minute grace period starts. After 10 minutes, remaining straggler cells are
                force-completed. Enabled by default; can be toggled off by the facilitator.
              </li>
            </ul>
          </section>

          {/* Tier Advancement */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Phase 4: Tier Advancement</h2>
            <p className="text-subtle leading-relaxed mb-4">
              After all cells in a tier complete, the system collects advancing ideas and builds the next tier.
              All participants are redistributed across new cells&mdash;everyone participates in every tier,
              not just winners from their previous cell.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">Normal Tiers (6+ Ideas)</h3>
            <p className="text-subtle leading-relaxed mb-4">
              Ideas are grouped into batches of approximately 5. New cells are created for each batch, and all
              participants are distributed evenly across them. Multiple cells within a batch vote on the same ideas,
              with one winner per batch advancing.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">The Final Showdown (2&ndash;5 Ideas)</h3>
            <p className="text-subtle leading-relaxed mb-4">
              When 5 or fewer ideas remain, the system enters the Final Showdown:
            </p>
            <ul className="list-disc list-inside text-subtle leading-relaxed space-y-2 mb-4 ml-2">
              <li>All participants vote on all remaining ideas (not just a subset)</li>
              <li>Participants are split into cells of 5, but every cell votes on the same set of ideas</li>
              <li>Votes are tallied across all cells (cross-cell tallying), not per-cell</li>
              <li>The idea with the highest total XP across all cells wins</li>
            </ul>
            <p className="text-subtle leading-relaxed">
              This ensures the final decision reflects the will of the entire group, not just a small cell.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">The Backfill Rule</h3>
            <p className="text-subtle leading-relaxed mb-4">
              If only 2, 3, or 4 ideas advance to the next tier, the system backfills to 5 by reviving the
              best-performing eliminated ideas from the previous tier, ranked by total XP.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              If the last included runner-up ties in XP with excluded ones, all tied ideas are included (allowing
              6&ndash;7 in the final showdown). If too many ties to include all, the system randomly selects from
              the tied group. This gives strong runners-up a second chance and prevents a bare 2-idea face-off
              with no alternatives.
            </p>
          </section>

          {/* Priority */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Phase 5: Priority Declared</h2>
            <p className="text-subtle leading-relaxed mb-4">
              When a single idea remains&mdash;either by being the last one standing or by winning the Final
              Showdown&mdash;it becomes the Priority. At this point, the Talk either completes (one-time mode)
              or enters Accumulation (rolling mode).
            </p>
          </section>

          {/* Rolling Mode */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Rolling Mode</h2>
            <p className="text-subtle leading-relaxed mb-4">
              If the facilitator enables rolling mode, the Talk continues after a Priority is declared. New
              participants can join and submit challenger ideas during an accumulation period. When the accumulation
              timer expires, a Challenge Round begins.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-3 mt-8">Challenge Rounds</h3>
            <ol className="list-decimal list-inside text-subtle leading-relaxed space-y-2 mb-4 ml-2">
              <li><strong className="text-foreground">Retirement:</strong> Ideas with 2+ losses are permanently removed, provided enough challengers remain.</li>
              <li><strong className="text-foreground">Benching:</strong> Ideas with 2+ losses that can&apos;t be retired are held for a future round.</li>
              <li><strong className="text-foreground">Tier 1 cells:</strong> Remaining challengers enter Tier 1 and vote normally.</li>
              <li><strong className="text-foreground">Champion defense:</strong> The current Priority enters at a higher tier, skipping early rounds.</li>
              <li><strong className="text-foreground">Resolution:</strong> If a challenger beats the champion, it becomes the new Priority.</li>
            </ol>
            <p className="text-subtle leading-relaxed">
              If no challengers are submitted after 3 consecutive accumulation periods, the Priority is declared
              final and the Talk completes.
            </p>

            <div className="bg-surface rounded-lg border border-border p-6 font-mono text-sm text-muted my-6">
              <div className="mb-1">Priority Declared</div>
              <div className="mb-1">&nbsp;&nbsp;&darr;</div>
              <div className="mb-1">Accumulation (accept new ideas)</div>
              <div className="mb-1">&nbsp;&nbsp;&darr;</div>
              <div className="mb-1">Challenge Round (challengers vote through tiers)</div>
              <div className="mb-1">&nbsp;&nbsp;&darr;</div>
              <div className="mb-1">Champion enters at higher tier</div>
              <div className="mb-1">&nbsp;&nbsp;&darr;</div>
              <div className="mb-1">Final Showdown (champion vs best challenger)</div>
              <div className="mb-1">&nbsp;&nbsp;&darr;</div>
              <div>New Priority (or champion retains) &rarr; Back to Accumulation</div>
            </div>
          </section>

          {/* Continuous Flow */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Continuous Flow Mode</h2>
            <p className="text-subtle leading-relaxed mb-4">
              An alternative to the standard batch model. In continuous flow, Tier 1 cells form as ideas
              arrive&mdash;every 5 ideas triggers a new cell. Voting starts immediately in each cell while new ideas
              are still being submitted. Winners advance as cells complete.
            </p>
            <p className="text-subtle leading-relaxed">
              The facilitator must manually close submissions to stop new Tier 1 cells from forming. After
              submissions close, the system waits for all Tier 1 cells to complete before advancing to Tier 2.
              This mode is designed for large-scale, time-sensitive deliberations.
            </p>
          </section>

          {/* Up-Pollination */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Comment Up-Pollination</h2>
            <p className="text-subtle leading-relaxed mb-4">
              Comments attached to ideas can spread virally across cells and promote to higher tiers:
            </p>
            <ol className="list-decimal list-inside text-subtle leading-relaxed space-y-2 mb-4 ml-2">
              <li>A comment starts in its origin cell</li>
              <li>At 3 upvotes, it spreads to ~3 nearby cells in the same tier</li>
              <li>Each additional 2 upvotes spreads further (~9 cells, then all cells)</li>
              <li>When a tier completes and an idea advances, the top comment for that idea is promoted to the next tier with a fresh start</li>
            </ol>
            <p className="text-subtle leading-relaxed">
              Only comments attached to a specific idea can spread. Unlinked comments stay in their origin cell.
              This ensures the most insightful arguments travel with the ideas they support.
            </p>
          </section>

          {/* Key Numbers */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Key Parameters</h2>
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {[
                    ['Target cell size', '5 participants'],
                    ['Cell size range', '3\u20137 participants'],
                    ['Hard cap per cell', '7 participants'],
                    ['Ideas per cell (Tier 1)', '~5, distributed evenly'],
                    ['XP per voter', '10 points'],
                    ['Minimum XP to advance (1 voter)', '4 points'],
                    ['Final Showdown threshold', '\u22645 ideas remaining'],
                    ['Backfill target', '5 ideas'],
                    ['Grace period after last vote', '10 seconds'],
                    ['Supermajority threshold', '80% of cells complete'],
                    ['Supermajority grace period', '10 minutes'],
                    ['Zero-vote extensions', '1 (then force-complete)'],
                    ['Retirement threshold', '2+ losses'],
                    ['Max no-challenger rounds', '3 (then Talk completes)'],
                    ['Continuous flow cell trigger', 'Every 5 ideas'],
                    ['Scale: 1M participants', '~9 tiers'],
                    ['Scale: 8B (humanity)', '~14 tiers'],
                  ].map(([param, value]) => (
                    <tr key={param}>
                      <td className="px-4 py-3 text-subtle">{param}</td>
                      <td className="px-4 py-3 text-foreground font-medium font-mono text-right">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <hr className="border-border my-8" />

          <div className="text-center space-y-4">
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/whitepaper"
                className="inline-block bg-purple hover:bg-purple-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors"
              >
                Read the Whitepaper
              </Link>
              <Link
                href="/talks/new"
                className="inline-block bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors"
              >
                Start a Talk
              </Link>
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}
