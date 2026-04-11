'use client'

import FrameLayout from '@/components/FrameLayout'

export default function HowItWorksPage() {

  return (
    <FrameLayout showBack hideFooter>
      <div className="py-6 px-1">

        <div className="mb-8">
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">How it actually works</h1>
          <p className="text-sm text-muted leading-relaxed">
            No jargon. No math degree required. Just the idea.
          </p>
        </div>

        {/* The Big Picture */}
        <section className="mb-8">
          <h2 className="font-serif text-lg font-bold text-foreground mb-3">The big picture</h2>
          <div className="space-y-3 text-sm text-foreground leading-relaxed">
            <p>
              Imagine you have 100 people and a question that needs answering.
              Everyone writes down their best idea. That&apos;s 100 ideas.
            </p>
            <p>
              Now put people into small groups of 5. Each group gets 5 of those ideas.
              They talk about them and pick the best one.
            </p>
            <p>
              The winning ideas from each group move on. New groups form. Same thing happens again.
              Talk, discuss, pick the best.
            </p>
            <p className="text-accent font-medium">
              After a few rounds, one idea is left. The one that convinced the most people
              in the most conversations.
            </p>
          </div>
        </section>

        {/* Why Small Groups */}
        <section className="mb-8">
          <h2 className="font-serif text-lg font-bold text-foreground mb-3">Why small groups?</h2>
          <div className="space-y-3 text-sm text-foreground leading-relaxed">
            <p>
              In a big crowd, the loudest voice wins. In a group of 5, everyone gets heard.
              You actually read every idea. You actually think about it.
            </p>
            <p>
              And because every group picks independently, no single person can control
              the outcome. A good idea has to win over and over, in group after group.
            </p>
          </div>
        </section>

        {/* Voting */}
        <section className="mb-8">
          <h2 className="font-serif text-lg font-bold text-foreground mb-3">How voting works</h2>
          <div className="space-y-3 text-sm text-foreground leading-relaxed">
            <p>
              You don&apos;t just pick one idea. You get 10 vote points to spread however you want.
            </p>
            <p>
              Love one idea? Give it 8 points and toss 2 to another. Think two ideas are
              equally good? Split it 5 and 5. Not sure? Spread it out evenly.
            </p>
            <p className="text-muted">
              This means your vote says <em>how much</em> you care, not just <em>which one</em> you picked.
            </p>
          </div>
        </section>

        {/* Scale */}
        <section className="mb-8">
          <h2 id="scale" className="font-serif text-lg font-bold text-foreground mb-3 scroll-mt-4">What about a million people?</h2>
          <div className="space-y-3 text-sm text-foreground leading-relaxed">
            <p>
              Same thing. Just more rounds.
            </p>
          </div>
          <div className="bg-surface/80 border border-border rounded-xl p-4 mt-3">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">25 people</span>
                <span className="text-foreground font-medium">2 rounds</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">625 people</span>
                <span className="text-foreground font-medium">4 rounds</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">78,000 people</span>
                <span className="text-foreground font-medium">7 rounds</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">2 million people</span>
                <span className="text-foreground font-medium">9 rounds</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-2">
                <span className="text-muted">Everyone on Earth</span>
                <span className="text-accent font-medium">14 rounds</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-muted mt-3 leading-relaxed">
            It doesn&apos;t matter how many people show up. The process stays the same.
            Small groups, real conversations, best idea wins.
          </p>
        </section>

        {/* Good arguments travel */}
        <section className="mb-8">
          <h2 className="font-serif text-lg font-bold text-foreground mb-3">Good arguments travel</h2>
          <div className="space-y-3 text-sm text-foreground leading-relaxed">
            <p>
              When someone writes a comment that other people find helpful, it gets
              shared to other groups automatically. The more people like it, the further it spreads.
            </p>
            <p className="text-muted">
              So even if you&apos;re in a different group, you might see the argument that
              changed someone else&apos;s mind. Good reasoning doesn&apos;t stay trapped in one conversation.
            </p>
          </div>
        </section>

        {/* Can it be cheated */}
        <section className="mb-8">
          <h2 className="font-serif text-lg font-bold text-foreground mb-3">Can it be cheated?</h2>
          <div className="space-y-3 text-sm text-foreground leading-relaxed">
            <p>
              Groups are random. You don&apos;t know who you&apos;ll be with.
              And an idea has to win in every round to make it through.
            </p>
            <p>
              The more rounds there are, the more groups of people your idea
              has to convince. You can&apos;t fake that.
            </p>
          </div>
        </section>

        <div className="border-t border-border pt-6 flex justify-center gap-4 flex-wrap">
          <a href="/whitepaper" className="bg-purple hover:bg-purple-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors">
            Read the Whitepaper
          </a>
          <a href="/chants" className="bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors">
            Go to Chants
          </a>
        </div>

      </div>
    </FrameLayout>
  )
}
