import Link from 'next/link'
import { Metadata } from 'next'
import Header from '@/components/Header'

export const metadata: Metadata = {
  title: 'Pitch',
  description: 'Union Chant: Mass Consensus as a Service. The first social media platform built for consensus, not conflict.',
}

export default function PitchPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* ── Title Slide ── */}
      <section className="bg-header text-white py-24 md:py-36">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
            Union Chant
          </h1>
          <p className="text-2xl md:text-3xl text-accent-light font-serif mb-8">
            Mass Consensus as a Service
          </p>
          <p className="text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
            The first social media platform built for mass consensus.
            A human-algorithm engine that transforms disagreement into
            legitimate, legible agreement.
          </p>
        </div>
      </section>

      {/* ── The Problem ── */}
      <section className="bg-background py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-sm font-medium text-error tracking-widest uppercase mb-4">
            The Problem
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
            We have no collective voice at coordinated scale.
          </h2>
          <div className="space-y-6 text-lg text-subtle leading-relaxed">
            <p>
              People are highly motivated to make a difference but have no
              productive mechanism to act on it. Movements mobilize but
              can&apos;t decide. Unions vote but don&apos;t deliberate.
              Communities fracture over shared resources.
            </p>
            <p>
              The tools we have produce noise, not consensus. Social media
              amplifies conflict. Polls measure existing preferences without
              changing them. Town halls are dominated by whoever shows up and
              shouts loudest.
            </p>
            <p className="text-foreground font-medium">
              People want a feeling of power and control over their own fate.
              They want a venue. They want a voice that actually means something.
            </p>
          </div>
        </div>
      </section>

      {/* ── The Solution ── */}
      <section className="bg-surface py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-sm font-medium text-accent tracking-widest uppercase mb-4">
            The Solution
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
            Mass Consensus as a Service (MCaaS)
          </h2>
          <div className="space-y-6 text-lg text-subtle leading-relaxed mb-12">
            <p>
              Union Chant is a structured, time-bounded democratic event
              designed to help large groups reach legitimate consensus quickly
              through parallel deliberation.
            </p>
            <p>
              A human-algorithm platform where ideas enter continuously,
              resolve periodically, and merge upward into an evolving
              consensus. Highly participatory, mathematically structured to
              ensure convergence.
            </p>
            <p className="text-foreground font-medium font-serif text-xl">
              Consensus over conflict. Summoning the truth from the public.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-background rounded-xl border border-border p-6">
              <h3 className="font-semibold text-foreground mb-2">Universal Participation</h3>
              <p className="text-muted text-sm leading-relaxed">
                Everyone submits ideas. Everyone deliberates in small groups
                of 5. Everyone votes in the final round. No one is excluded.
              </p>
            </div>
            <div className="bg-background rounded-xl border border-border p-6">
              <h3 className="font-semibold text-foreground mb-2">Meaningful Deliberation</h3>
              <p className="text-muted text-sm leading-relaxed">
                Not clicking buttons. Real discussion in small groups where
                you can&apos;t be drowned out and your perspective gets
                genuine consideration.
              </p>
            </div>
            <div className="bg-background rounded-xl border border-border p-6">
              <h3 className="font-semibold text-foreground mb-2">Fast Convergence</h3>
              <p className="text-muted text-sm leading-relaxed">
                1 million people can reach genuine consensus in days.
                Parallel deliberation means scale doesn&apos;t slow
                the process&mdash;it just adds more groups.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="bg-background py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-sm font-medium text-warning tracking-widest uppercase mb-4">
            How It Works
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
            Convergence Waves
          </h2>
          <p className="text-lg text-subtle leading-relaxed mb-12">
            Ideas enter continuously, resolve periodically, and merge upward
            into an evolving consensus through tiered small-group deliberation.
          </p>

          <div className="space-y-6 mb-12">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center shrink-0">
                <span className="text-lg font-bold text-accent font-mono">1</span>
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Submit</h3>
                <p className="text-muted leading-relaxed">
                  Everyone proposes their own solution. Not choosing from a
                  preset list&mdash;generating the options themselves.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-warning/10 border-2 border-warning flex items-center justify-center shrink-0">
                <span className="text-lg font-bold text-warning font-mono">2</span>
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Deliberate</h3>
                <p className="text-muted leading-relaxed">
                  Groups of 5 discuss, debate, and vote. Thousands of groups
                  deliberate in parallel. Each picks one winner.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-success/10 border-2 border-success flex items-center justify-center shrink-0">
                <span className="text-lg font-bold text-success font-mono">3</span>
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Converge</h3>
                <p className="text-muted leading-relaxed">
                  Winners advance and face other winners. The process repeats
                  across tiers. One consensus emerges&mdash;forged through
                  real conversation, not just counted clicks.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-purple/10 border-2 border-purple flex items-center justify-center shrink-0">
                <span className="text-lg font-bold text-purple font-mono">4</span>
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Evolve</h3>
                <p className="text-muted leading-relaxed">
                  The consensus stands but can be challenged. New ideas enter,
                  new rounds trigger. The collective position updates as
                  circumstances change.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The Math ── */}
      <section className="bg-header text-white py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-sm font-medium text-accent-light tracking-widest uppercase mb-4">
            The Scale
          </p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Structured deliberation where 1 million people reach genuine
            consensus in days.
          </h2>
          <p className="text-white/60 text-lg mb-16">
            Each tier reduces ideas by 80%. The same algorithm handles a
            union local or all of humanity.
          </p>

          <div className="bg-white/5 rounded-xl p-6 md:p-8 mb-12">
            <div className="space-y-4 font-mono">
              <div className="flex justify-between items-center text-sm">
                <span className="text-white/50">Union local</span>
                <span className="text-white/50">500 members</span>
                <span className="text-accent-light font-medium">4 rounds</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-white/50">Large union</span>
                <span className="text-white/50">50,000 members</span>
                <span className="text-accent-light font-medium">7 rounds</span>
              </div>
              <div className="flex justify-between items-center text-sm border-t border-white/10 pt-4">
                <span className="text-white font-bold">National movement</span>
                <span className="text-white font-bold">1,000,000 people</span>
                <span className="text-accent-light font-bold">9 rounds</span>
              </div>
              <div className="flex justify-between items-center text-sm border-t border-white/10 pt-4">
                <span className="text-white/70">Global consensus</span>
                <span className="text-white/70">8 billion</span>
                <span className="text-accent-light">14 rounds</span>
              </div>
            </div>
          </div>

          <p className="text-white/80 text-lg font-medium text-center">
            Political science said this was impossible&mdash;universal
            participation, meaningful deliberation, and fast convergence
            at scale.
          </p>
        </div>
      </section>

      {/* ── The Legitimacy Argument ── */}
      <section className="bg-background py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-sm font-medium text-success tracking-widest uppercase mb-4">
            The Value
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
            The power of legitimate consensus
          </h2>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-error-bg border border-error-border rounded-xl p-6">
              <p className="text-sm text-error font-medium mb-2">Without Union Chant</p>
              <p className="text-foreground text-lg font-serif italic">
                &ldquo;Our leadership decided.&rdquo;
              </p>
            </div>
            <div className="bg-success-bg border border-success-border rounded-xl p-6">
              <p className="text-sm text-success font-medium mb-2">With Union Chant</p>
              <p className="text-foreground text-lg font-serif italic">
                &ldquo;47,000 members deliberated and chose this priority.&rdquo;
              </p>
            </div>
          </div>

          <div className="space-y-6 text-lg text-subtle leading-relaxed">
            <p>
              That distinction changes everything. It changes how management
              responds to a union demand. It changes how politicians respond
              to a movement. It changes how members feel about their own
              organization.
            </p>
            <p className="text-foreground font-medium">
              Legitimacy is the product. The algorithm is just how you get there.
            </p>
          </div>
        </div>
      </section>

      {/* ── Use Cases ── */}
      <section className="bg-surface py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-sm font-medium text-purple tracking-widest uppercase mb-4">
            Who It&apos;s For
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-12">
            Any group that needs to speak with one voice
          </h2>

          <div className="space-y-6">
            <div className="bg-background rounded-xl border border-border p-8">
              <h3 className="text-xl font-semibold text-foreground mb-3">Unions</h3>
              <p className="text-muted leading-relaxed">
                Contract priorities, strike authorization, leadership platforms.
                Every member gets a real seat at the table through small-group
                deliberation. The result carries genuine democratic
                legitimacy&mdash;not a rubber stamp.
              </p>
            </div>
            <div className="bg-background rounded-xl border border-border p-8">
              <h3 className="text-xl font-semibold text-foreground mb-3">Movements</h3>
              <p className="text-muted leading-relaxed">
                Movements that can articulate unified demands win. Those that
                can&apos;t, fizzle. Union Chant is the mechanism to go from
                shared anger to shared position. Climate, housing, labor,
                justice&mdash;any movement that needs to decide, not just march.
              </p>
            </div>
            <div className="bg-background rounded-xl border border-border p-8">
              <h3 className="text-xl font-semibold text-foreground mb-3">Partnerships &amp; Coalitions</h3>
              <p className="text-muted leading-relaxed">
                Why waste months of conflict when you could know what everyone
                already agrees on? Coalitions of organizations can find common
                ground through structured deliberation instead of endless
                negotiation between leaders who may not represent their base.
              </p>
            </div>
            <div className="bg-background rounded-xl border border-border p-8">
              <h3 className="text-xl font-semibold text-foreground mb-3">Civic Governance</h3>
              <p className="text-muted leading-relaxed">
                Participatory budgeting, citizen assemblies, public input on
                policy. Give citizens a structured way to deliberate on
                specific issues&mdash;not just vote for representatives
                every few years.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Business Model ── */}
      <section className="bg-background py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-sm font-medium text-accent tracking-widest uppercase mb-4">
            Model
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
            Something simple and scalable
          </h2>
          <div className="space-y-6 text-lg text-subtle leading-relaxed mb-12">
            <p>
              Non-profit foundation owns the core platform. Open source (AGPL).
              Free for unions, movements, and communities.
            </p>
            <p>
              For-profit subsidiary serves enterprise: private instances,
              SLA support, analytics, DAO governance integrations.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-surface rounded-xl border border-border p-6">
              <h3 className="font-semibold text-foreground mb-2">Non-profit (Core)</h3>
              <ul className="text-muted text-sm space-y-2">
                <li>Open source platform (AGPL-3.0)</li>
                <li>Free for unions &amp; movements</li>
                <li>Grant-funded development</li>
                <li>Mission-protected governance</li>
              </ul>
            </div>
            <div className="bg-surface rounded-xl border border-border p-6">
              <h3 className="font-semibold text-foreground mb-2">Subsidiary (Revenue)</h3>
              <ul className="text-muted text-sm space-y-2">
                <li>Enterprise private instances</li>
                <li>DAO governance integrations</li>
                <li>Analytics &amp; facilitation tools</li>
                <li>SLA support &amp; custom deployment</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── The Ask ── */}
      <section className="bg-header text-white py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-sm font-medium text-accent-light tracking-widest uppercase mb-4">
            The Vision
          </p>
          <h2 className="text-3xl md:text-4xl font-bold mb-8">
            The world has never had a tool that could do this.
          </h2>
          <p className="text-white/70 text-lg leading-relaxed mb-4">
            Structured deliberation where 1 million people could reach genuine
            consensus in days. Not a slim majority outvoting a frustrated
            minority, but a million individuals who each participated in real
            conversations, heard different perspectives, and arrived together
            at a decision they collectively shaped.
          </p>
          <p className="text-accent-light text-xl font-serif font-medium mb-12">
            That is not just a vote count. That is a mandate.
            That is collective will made tangible.
          </p>
          <div className="flex flex-wrap gap-6 justify-center text-sm text-white/40">
            <Link href="/demo" className="hover:text-white/70 transition-colors">
              Watch Demo
            </Link>
            <Link href="/whitepaper" className="hover:text-white/70 transition-colors">
              Whitepaper
            </Link>
            <Link href="/how-it-works" className="hover:text-white/70 transition-colors">
              How It Works
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
