import Link from 'next/link'
import { Metadata } from 'next'
import Header from '@/components/Header'
import LandingCTA from '@/components/LandingCTA'
import CollectiveChat from '@/components/CollectiveChat'

export const metadata: Metadata = {
  title: 'Union Chant - Holding Quiet Hope',
  description: 'One place where humanity decides together. Submit ideas, deliberate in small groups, reach consensus at any scale.',
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* ── Collective Chat — first thing mobile users see ── */}
      <section className="bg-header border-b border-gold-border">
        <div className="max-w-xl mx-auto px-4 py-6">
          <CollectiveChat />
        </div>
      </section>

      {/* ── Hero ── */}
      <section className="bg-header text-white">
        <div className="max-w-5xl mx-auto px-6 py-24 md:py-36 text-center">
          <p className="text-accent-light text-sm font-medium tracking-widest uppercase mb-6">
            Holding Quiet Hope
          </p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-8 leading-[1.1] tracking-tight">
            What if a million people{' '}
            <br className="hidden sm:block" />
            could actually agree?
          </h1>
          <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-12 leading-relaxed font-sans">
            Not a slim majority outvoting a frustrated minority. Not a poll.
            Not a petition. Real consensus&mdash;built through real conversation,
            at any scale.
          </p>
          <LandingCTA />
        </div>
      </section>

      {/* ── The Insight ── */}
      <section className="bg-background py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-6">
          <div className="max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
              The best conversations happen in small groups
            </h2>
            <p className="text-lg text-subtle leading-relaxed mb-6">
              Think about the best discussions you&apos;ve ever had. They
              probably weren&apos;t in a stadium or a comment section. They were
              around a table, with a few people who had time to actually listen.
            </p>
            <p className="text-lg text-subtle leading-relaxed">
              Union Chant takes this insight and scales it. Instead of putting
              everyone in one noisy room, we create{' '}
              <em className="text-foreground">thousands</em> of small
              conversations happening in parallel&mdash;then connect them
              through a clear, repeatable tournament.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="bg-surface py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 text-center">
            Three steps to consensus
          </h2>
          <p className="text-muted text-center mb-16 text-lg max-w-2xl mx-auto">
            From a million ideas to one answer&mdash;and everyone had a voice.
          </p>

          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-accent font-mono">1</span>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Everyone submits ideas
              </h3>
              <p className="text-muted leading-relaxed">
                Not choosing from a preset list. Everyone proposes their own
                solution to the question.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-warning/10 border-2 border-warning flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-warning font-mono">2</span>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Small groups deliberate
              </h3>
              <p className="text-muted leading-relaxed">
                Groups of 5 discuss, debate, and vote. Each group picks one
                winner. Thousands of groups deliberate in parallel.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-success/10 border-2 border-success flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-success font-mono">3</span>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Winners advance
              </h3>
              <p className="text-muted leading-relaxed">
                Winning ideas enter new groups with other winners. The process
                repeats until one consensus emerges.
              </p>
            </div>
          </div>

          <div className="text-center mt-16">
            <Link
              href="/how-it-works"
              className="text-accent hover:text-accent-hover font-medium transition-colors"
            >
              See the full algorithm &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ── The Numbers ── */}
      <section className="bg-header text-white py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            The math is remarkable
          </h2>
          <p className="text-white/60 mb-16 text-lg max-w-2xl mx-auto">
            Each tier reduces ideas by 80%. The same algorithm handles 25
            people or 8 billion.
          </p>

          <div className="grid grid-cols-3 gap-6 md:gap-8 mb-16 max-w-lg mx-auto">
            <div>
              <div className="text-4xl md:text-5xl font-bold font-mono text-accent-light mb-2">
                5
              </div>
              <div className="text-white/50 text-sm">people per group</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-bold font-mono text-accent-light mb-2">
                9
              </div>
              <div className="text-white/50 text-sm">rounds for 1 million</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-bold font-mono text-accent-light mb-2">
                14
              </div>
              <div className="text-white/50 text-sm">rounds for all of humanity</div>
            </div>
          </div>

          <div className="inline-flex flex-col items-start bg-white/5 rounded-xl p-6 md:p-8 text-left max-w-lg w-full">
            <div className="w-full space-y-4 font-mono text-sm">
              <div className="flex justify-between items-center">
                <span className="text-white/60">25 people</span>
                <span className="text-accent-light">2 rounds</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/60">625 people</span>
                <span className="text-accent-light">4 rounds</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/60">10,000 people</span>
                <span className="text-accent-light">6 rounds</span>
              </div>
              <div className="flex justify-between items-center border-t border-white/10 pt-4">
                <span className="text-white font-bold">1,000,000 people</span>
                <span className="text-accent-light font-bold">9 rounds</span>
              </div>
              <div className="flex justify-between items-center border-t border-white/10 pt-4">
                <span className="text-white/80">8 billion (humanity)</span>
                <span className="text-accent-light">14 rounds</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Different ── */}
      <section className="bg-background py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 text-center">
            Not a poll. Not a vote. Deliberation.
          </h2>
          <p className="text-muted text-center mb-16 text-lg max-w-2xl mx-auto">
            Traditional voting counts existing preferences. Union Chant lets
            preferences evolve through discussion.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-surface rounded-xl border border-border p-8">
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Every voice is heard
              </h3>
              <p className="text-muted leading-relaxed">
                In a group of 5, you can&apos;t be drowned out. No algorithm
                buries your comment. No one can shout you down. Your perspective
                gets genuine consideration.
              </p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-8">
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Ideas win on merit
              </h3>
              <p className="text-muted leading-relaxed">
                To become the consensus, an idea must survive scrutiny from many
                independent groups. Popularity and volume don&apos;t help&mdash;only
                genuine persuasion.
              </p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-8">
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Decisions evolve
              </h3>
              <p className="text-muted leading-relaxed">
                Champions can be challenged. New ideas can dethrone old ones.
                The collective position updates as circumstances
                change&mdash;but stability is maintained.
              </p>
            </div>
            <div className="bg-surface rounded-xl border border-border p-8">
              <h3 className="text-xl font-semibold text-foreground mb-3">
                A stronger mandate
              </h3>
              <p className="text-muted leading-relaxed">
                The winner has been evaluated across multiple contexts and
                compared against alternatives several times. That&apos;s
                legitimacy based on durability&mdash;not a slim 51%.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── The Vision ── */}
      <section className="bg-surface py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-lg md:text-xl text-foreground leading-relaxed mb-8 font-serif italic">
            &ldquo;Imagine a million people reaching genuine consensus on a
            difficult issue. Not a slim majority outvoting a frustrated minority,
            but a million individuals who each participated in real
            conversations, heard different perspectives, and arrived together at
            a decision they collectively shaped. That is not just a vote count.
            That is a mandate. That is collective will made tangible.&rdquo;
          </p>
          <Link
            href="/whitepaper"
            className="text-accent hover:text-accent-hover font-medium transition-colors"
          >
            Read the full whitepaper &rarr;
          </Link>
        </div>
      </section>

      {/* ── Use Cases ── */}
      <section className="bg-background py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-16 text-center">
            For any group, at any scale
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Organizations
              </h3>
              <p className="text-muted leading-relaxed">
                The mailroom clerk&apos;s brilliant insight gets the same fair
                hearing as the VP&apos;s pet project. Ideas evaluated on
                merit, not rank.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Communities
              </h3>
              <p className="text-muted leading-relaxed">
                Participate from your phone, on your own time. More voices lead
                to better decisions. No more town halls dominated by the usual
                few.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Governance
              </h3>
              <p className="text-muted leading-relaxed">
                Give citizens a structured way to deliberate on specific
                issues&mdash;not just vote for representatives every few years.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-header text-white py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            The world has never had a tool that could do this.
          </h2>
          <p className="text-white/60 text-lg mb-10 max-w-xl mx-auto">
            Good decisions don&apos;t emerge from silence or noise. They emerge
            from conversation&mdash;given the right form.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <LandingCTA variant="footer" />
          </div>
          <div className="mt-12 flex flex-wrap gap-8 justify-center text-sm text-white/40">
            <Link href="/pitch" className="hover:text-white/70 transition-colors">
              Full Pitch
            </Link>
            <Link href="/whitepaper" className="hover:text-white/70 transition-colors">
              Whitepaper
            </Link>
            <Link href="/how-it-works" className="hover:text-white/70 transition-colors">
              How It Works
            </Link>
            <Link href="/demo" className="hover:text-white/70 transition-colors">
              Demo
            </Link>
            <Link href="/how-it-works" className="hover:text-white/70 transition-colors">
              How It Works
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-foreground text-white/40 py-6">
        <div className="max-w-5xl mx-auto px-6 text-center text-sm">
          &copy; 2026 Union Chant. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
