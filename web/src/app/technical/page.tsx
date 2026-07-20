'use client'

import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

export default function TechnicalWhitepaperPage() {
  return (
    <FrameLayout hideFooter showBack>
      <article className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-6 mt-4">
        <h1 className="text-4xl font-bold text-foreground mb-2">Technical Paper</h1>
        <p className="text-xl text-muted mb-12">How Ideas Become Priorities</p>

        <hr className="border-border my-8" />

        {/* 1. The Problem */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">The Problem</h2>
          <p className="text-subtle leading-relaxed mb-4">
            You have 50,000 people and a hard question. How should the city spend its infrastructure
            budget? You could run a poll, but polls only let people choose between options someone
            else picked. You could hold a town hall, but 50 people show up and the loudest three
            do all the talking. You could survey everyone, but you get 50,000 disconnected opinions
            with no deliberation.
          </p>
          <p className="text-subtle leading-relaxed">
            What you actually want is for all 50,000 people to <em>discuss</em> the question in small
            enough groups that everyone gets heard, and for the best ideas to rise to the top
            through repeated evaluation by different groups of people. That&apos;s what Unity Chant does.
          </p>
        </section>

        {/* 2. The Core Mechanism */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">The Core Mechanism</h2>
          <p className="text-subtle leading-relaxed mb-4">
            Everyone submits one idea. The ideas are shuffled and dealt into small groups
            of 5 called <strong className="text-foreground">cells</strong>, 5 ideas
            per cell, 5 voters per cell. Each cell votes. One idea advances. The other four
            do not.
          </p>
          <p className="text-subtle leading-relaxed mb-4">
            The top ideas from every cell are collected and dealt into <em>new</em> cells
            of 5. Now each idea faces top ideas from other cells, ideas that already survived
            one round of scrutiny. New voters evaluate them. One advances. Four do not.
          </p>
          <p className="text-subtle leading-relaxed">
            This repeats. Each round cuts the field by 5x, and each round the competition
            gets harder, every surviving idea has beaten more opponents, evaluated by
            more people. After enough rounds, one idea remains, the <strong className="text-foreground">Winner</strong>.
            Not the most popular idea. The most robust one.
          </p>
        </section>

        {/* 3. Your City */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Your City of 50,000</h2>
          <p className="text-subtle leading-relaxed mb-4">
            50,000 residents. Each submits one idea. Here is how 50,000 ideas become one Winner.
          </p>
          <p className="text-subtle leading-relaxed mb-4">
            Every round, surviving ideas are grouped into <strong className="text-foreground">batches</strong> of
            5. All 50,000 residents vote every round, they&apos;re distributed across batches, split
            into cells of 5 within each batch. Every cell in a batch votes on the same 5 ideas. Votes
            are summed across all cells in the batch. One idea advances per batch. The rest do not.
          </p>
          <p className="text-subtle leading-relaxed mb-4">
            As the field narrows, the number of batches shrinks, but the number of voters
            per batch <em>grows</em>. Each surviving idea faces more scrutiny, not less:
          </p>
          <div className="bg-surface rounded-lg border border-border overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left text-muted font-medium">Round</th>
                  <th className="px-4 py-2 text-right text-muted font-medium">Ideas</th>
                  <th className="px-4 py-2 text-right text-muted font-medium">Batches</th>
                  <th className="px-4 py-2 text-right text-muted font-medium">Voters per batch</th>
                  <th className="px-4 py-2 text-right text-muted font-medium">Advancing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ['1', '50,000', '10,000', '5', '10,000'],
                  ['2', '10,000', '2,000', '25', '2,000'],
                  ['3', '2,000', '400', '125', '400'],
                  ['4', '400', '80', '625', '80'],
                  ['5', '80', '16', '3,125', '16'],
                  ['6', '16', '3', '~16,700', '3'],
                ].map(([round, ideas, batches, voters, winners]) => (
                  <tr key={round}>
                    <td className="px-4 py-2 text-subtle">{round}</td>
                    <td className="px-4 py-2 text-right text-foreground font-medium">{ideas}</td>
                    <td className="px-4 py-2 text-right text-muted">{batches}</td>
                    <td className="px-4 py-2 text-right text-foreground">{voters}</td>
                    <td className="px-4 py-2 text-right text-foreground">{winners}</td>
                  </tr>
                ))}
                <tr className="bg-accent/5">
                  <td className="px-4 py-2 text-accent font-medium">Final</td>
                  <td className="px-4 py-2 text-right text-foreground font-medium">5</td>
                  <td className="px-4 py-2 text-right text-muted">1</td>
                  <td className="px-4 py-2 text-right text-accent font-semibold">50,000</td>
                  <td className="px-4 py-2 text-right text-accent font-semibold">1 Winner</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-subtle leading-relaxed mb-4">
            In Round 1, each idea is seen by 5 people. By Round 5, each surviving idea
            is evaluated by over 3,000. In the final, all 50,000 residents vote on the
            same 5 ideas and every vote counts toward the result.
          </p>
          <p className="text-subtle leading-relaxed mb-4">
            After Round 6, only 3 ideas remain. The 2 strongest non-advancing ideas from
            Round 6 are brought back to fill the field to 5. Then all 50,000 residents vote
            on the same 5 finalists. The idea with the most total support becomes the Winner.
          </p>
          <p className="text-subtle leading-relaxed font-medium text-foreground">
            Seven rounds. 50,000 people. Every person participated every round. Every idea
            got a fair hearing. The winner didn&apos;t just get the most clicks, it convinced
            the most people in the most conversations.
          </p>
        </section>

        {/* 4. Scale */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Scale</h2>
          <p className="text-subtle leading-relaxed mb-4">
            Each round reduces ideas by 5x. This means scale grows <em>logarithmically</em>, doubling
            the number of participants adds roughly one round. The process stays exactly the same
            at any size. Only the number of rounds changes.
          </p>
          <div className="bg-surface rounded-lg border border-border overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left text-muted font-medium">Participants</th>
                  <th className="px-4 py-2 text-right text-muted font-medium">Rounds</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ['25', '2'],
                  ['625', '4'],
                  ['15,000', '6'],
                  ['1,000,000', '~9'],
                ].map(([people, rounds]) => (
                  <tr key={people}>
                    <td className="px-4 py-2 text-subtle">{people}</td>
                    <td className="px-4 py-2 text-right text-foreground font-medium">{rounds}</td>
                  </tr>
                ))}
                <tr className="bg-accent/5">
                  <td className="px-4 py-2 text-foreground font-medium">8 billion (everyone on Earth)</td>
                  <td className="px-4 py-2 text-right text-accent font-semibold">~14</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-subtle leading-relaxed mb-4">
            Your city of 50,000? Seven rounds. Not seven months, seven rounds of voting,
            each taking as long as you give people to think. Rounds happen in parallel across
            all cells, so the calendar time is measured in days, not the number of participants.
          </p>
          <p className="text-subtle leading-relaxed font-medium text-foreground">
            A million people reaching genuine consensus, not a slim majority, but an answer
            stress-tested in thousands of independent small-group conversations, in nine rounds.
          </p>
        </section>

        {/* 5. How Voting Works */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">How Voting Works</h2>
          <p className="text-subtle leading-relaxed mb-4">
            Voters don&apos;t just pick one idea. Each person gets <strong className="text-foreground">10 points</strong> to
            distribute across the ideas in their cell, however they want. All 10 must be spent.
          </p>
          <p className="text-subtle leading-relaxed mb-4">
            Love one idea? Give it 8 points and toss 2 to a runner-up. See two strong options?
            Split 5 and 5. This lets people express <em>how much</em> they support each idea,
            not just which one they&apos;d pick if forced.
          </p>
          <p className="text-subtle leading-relaxed mb-4">
            When voting closes, points are summed per idea across all voters in the cell.
            Highest total advances. The rest do not.
          </p>
          <p className="text-subtle leading-relaxed">
            If ideas tie, all tied ideas advance. If a cell has only one voter, an idea
            needs at least 4 points to advance, preventing a single person from pushing
            a throwaway pick.
          </p>
        </section>

        {/* 6. The Final */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">The Final</h2>
          <p className="text-subtle leading-relaxed mb-4">
            When 5 or fewer ideas remain, the process enters
            its <strong className="text-foreground">final round</strong>.
            This works differently from earlier rounds:
          </p>
          <ul className="list-disc list-inside text-subtle leading-relaxed space-y-3 mb-4 ml-2">
            <li>
              <strong className="text-foreground">Same ideas, all voters.</strong> Every
              cell receives the same set of finalists. All active participants vote.
            </li>
            <li>
              <strong className="text-foreground">Votes counted across cells.</strong> Points
              are summed across every cell, not per cell. The idea with the highest
              total across <em>all</em> voters wins.
            </li>
          </ul>
          <p className="text-subtle leading-relaxed mb-4">
            This is important. In earlier rounds, each cell picks its own top idea independently.
            In the final, the entire population determines the outcome together.
          </p>
          <p className="text-subtle leading-relaxed">
            If fewer than 5 ideas reach the final, the strongest non-advancing ideas from the
            previous round are brought back to fill the field to 5. Strong runners-up get a
            second chance, the final always has real competition.
          </p>
        </section>

        {/* 7. Online Mode */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Running It Online</h2>
          <p className="text-subtle leading-relaxed mb-4">
            Share a link. People arrive at their own pace. The system handles everything automatically:
          </p>
          <ul className="list-disc list-inside text-subtle leading-relaxed space-y-3 mb-4 ml-2">
            <li>
              <strong className="text-foreground">Cells form as ideas arrive.</strong> Every
              5th idea submitted triggers a new cell. No waiting for a deadline.
            </li>
            <li>
              <strong className="text-foreground">Voters join as they arrive.</strong> People
              enter available cells on a first-come basis. No pre-registration required.
            </li>
            <li>
              <strong className="text-foreground">Rounds advance automatically.</strong> As
              soon as 5 advancing ideas accumulate at any round, they form a new cell at the next
              round. A Round 2 cell can be voting while Round 1 cells are still forming.
            </li>
          </ul>
          <p className="text-subtle leading-relaxed">
            The facilitator closes submissions when ready. The process runs itself to completion.
          </p>
        </section>

        {/* 8. Running an Event */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Running an Event</h2>
          <p className="text-subtle leading-relaxed mb-4">
            For in-person groups, the facilitator controls the pace:
          </p>
          <ul className="list-disc list-inside text-subtle leading-relaxed space-y-3 ml-2">
            <li>Collect all ideas first, then start voting</li>
            <li>All cells at a round finish before the next round begins</li>
            <li>Everyone is reassigned to new cells each round, every person participates in every round</li>
          </ul>
        </section>

        {/* 9. Integrity */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Why It Can&apos;t Be Gamed</h2>
          <p className="text-subtle leading-relaxed mb-4">
            Groups are random. You don&apos;t know who you&apos;ll be with. An idea has to win in
            every round to survive, not once, but in cell after cell, evaluated by different
            people each time. Coordinating enough voters to control the outcome would require
            controlling a majority in every cell at every round across the entire process.
          </p>

          <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">Sybil resistance</h3>
          <p className="text-subtle leading-relaxed mb-4">
            A common attack on voting systems is creating fake accounts to stuff the ballot.
            In a traditional poll, 100 fake accounts means 100 extra votes, a linear advantage.
          </p>
          <p className="text-subtle leading-relaxed mb-4">
            In Unity Chant, fake accounts are distributed randomly across cells. To guarantee
            an outcome in a single cell, you need 3 of the 5 voters. But your idea has to win in
            every round. In a 50,000-person deliberation with 7 rounds, an attacker would need to
            control a majority in the right cells at every tier, an exponentially growing
            number of accounts for diminishing influence. 100 fake voters in a pool of 50,000
            have a negligible chance of landing together in the same cells round after round.
          </p>
          <p className="text-subtle leading-relaxed mb-4">
            The structure makes Sybil attacks expensive. The more rounds there are, the
            harder it gets. The more participants there are, the more diluted any coordinated
            block becomes. Scale is the defense.
          </p>

          <h3 className="text-lg font-semibold text-foreground mb-3 mt-6">Additional safeguards</h3>
          <ul className="list-disc list-inside text-subtle leading-relaxed space-y-2 ml-2">
            <li>You are never placed in a cell with your own idea</li>
            <li>Cells with zero votes keep waiting, no ideas are removed without human input</li>
            <li>A grace period after the last vote lets others reconsider before a cell finalizes</li>
          </ul>
        </section>

        {/* 10. Comments Travel */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Good Arguments Travel</h2>
          <p className="text-subtle leading-relaxed mb-4">
            When someone writes a comment that others find helpful, it spreads. At 3 upvotes, a
            comment reaches neighboring cells. When an idea advances to the next round, its most
            upvoted comment is promoted with it.
          </p>
          <p className="text-subtle leading-relaxed">
            A voter in Round 4 can see the argument that changed minds back in Round 1.
            Good reasoning travels with the ideas it supports, it doesn&apos;t stay
            trapped in one conversation.
          </p>
        </section>

        {/* 11. Reference */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Reference</h2>
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {[
                  ['Cell size', '5 (flexible 3\u20137)'],
                  ['Points per voter', '10'],
                  ['Min points to advance (1 voter)', '4'],
                  ['Final round threshold', '5 or fewer ideas remaining'],
                  ['Final round scoring', 'All votes summed across cells'],
                  ['Online: new cell every', '5 ideas submitted'],
                  ['Online: next round every', '5 ideas advance'],
                  ['50,000 participants', '~7 rounds'],
                  ['1,000,000 participants', '~9 rounds'],
                  ['8 billion participants', '~14 rounds'],
                ].map(([param, value]) => (
                  <tr key={param}>
                    <td className="px-4 py-3 text-subtle">{param}</td>
                    <td className="px-4 py-3 text-foreground font-medium text-right">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <hr className="border-border my-8" />

        <div className="flex justify-center gap-4 flex-wrap">
          <Link
            href="/demo"
            className="bg-purple hover:bg-purple-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Watch Demo
          </Link>
          <Link
            href="/chants"
            className="bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Go to Chants
          </Link>
        </div>
      </article>
    </FrameLayout>
  )
}
