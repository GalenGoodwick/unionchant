import Link from 'next/link'
import { Metadata } from 'next'
import Header from '@/components/Header'

export const metadata: Metadata = {
  title: 'Pricing - Union Chant',
  description: 'Chat with the Collective AI. Haiku is free. Sonnet and Opus coming soon.',
}

function Check({ className = 'text-success' }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 shrink-0 mt-0.5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-5xl mx-auto px-6 py-12">
        <Link href="/" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Back to home
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">Simple pricing</h1>
          <p className="text-lg text-muted max-w-xl mx-auto">
            Creating deliberations is always free. Haiku chat is always free.
            Upgrade for smarter AI models.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {/* Haiku — Free */}
          <div className="bg-background rounded-xl border border-border p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-1">Haiku</h2>
              <p className="text-muted text-sm">Fast and free</p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold text-foreground font-mono">$0</span>
              <span className="text-muted ml-1">/month</span>
            </div>
            <ul className="space-y-3 mb-8 text-sm">
              <li className="flex items-start gap-2">
                <Check />
                <span className="text-foreground">
                  <strong>Unlimited AI chat</strong> with the Collective
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check />
                <span className="text-foreground">
                  <strong>Create unlimited Talks</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check />
                <span className="text-foreground">
                  Join, vote, and comment in all deliberations
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check />
                <span className="text-foreground">
                  1 collective Talk change per day
                </span>
              </li>
            </ul>
            <Link
              href="/auth/signup"
              className="block w-full text-center py-3 px-6 rounded-lg border border-border text-foreground hover:bg-surface-hover font-medium transition-colors"
            >
              Get started free
            </Link>
          </div>

          {/* Sonnet — $5/mo */}
          <div className="bg-background rounded-xl border-2 border-accent p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="text-xs px-3 py-1 rounded-full bg-accent text-white font-semibold">
                SONNET
              </span>
            </div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-1">Sonnet</h2>
              <p className="text-muted text-sm">Deeper reasoning</p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold text-accent font-mono">$5</span>
              <span className="text-muted ml-1">/month</span>
            </div>
            <ul className="space-y-3 mb-8 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-accent" />
                <span className="text-foreground">
                  Everything in Haiku
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-accent" />
                <span className="text-foreground">
                  <strong>Claude Sonnet 4</strong> in Collective chat
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-accent" />
                <span className="text-foreground">
                  <strong>Unlimited collective Talk changes</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-accent" />
                <span className="text-foreground">
                  ~$0.013/message API cost covered
                </span>
              </li>
            </ul>
            <button
              disabled
              className="block w-full text-center py-3 px-6 rounded-lg bg-accent/20 text-accent font-medium cursor-not-allowed"
            >
              Coming soon
            </button>
          </div>

          {/* Opus — $10/mo */}
          <div className="bg-background rounded-xl border-2 border-gold p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="text-xs px-3 py-1 rounded-full bg-gold text-background font-semibold">
                OPUS
              </span>
            </div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-1">Opus</h2>
              <p className="text-muted text-sm">Maximum intelligence</p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold text-gold font-mono">$10</span>
              <span className="text-muted ml-1">/month</span>
            </div>
            <ul className="space-y-3 mb-8 text-sm">
              <li className="flex items-start gap-2">
                <Check className="text-gold" />
                <span className="text-foreground">
                  Everything in Sonnet
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-gold" />
                <span className="text-foreground">
                  <strong>Claude Opus 4</strong> in Collective chat
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-gold" />
                <span className="text-foreground">
                  Most nuanced, creative responses
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="text-gold" />
                <span className="text-foreground">
                  ~$0.064/message API cost covered
                </span>
              </li>
            </ul>
            <button
              disabled
              className="block w-full text-center py-3 px-6 rounded-lg bg-gold/20 text-gold font-medium cursor-not-allowed"
            >
              Coming soon
            </button>
          </div>
        </div>

        {/* Donations */}
        <div className="mt-16 max-w-2xl mx-auto text-center">
          <div className="bg-background rounded-xl border border-gold-border p-8">
            <h2 className="text-xl font-bold text-foreground mb-3">Running on donations</h2>
            <p className="text-muted text-sm leading-relaxed mb-6">
              Union Chant is open source and community-driven. AI costs are covered by
              donations from people who believe in collective deliberation. If you find
              value here, consider supporting the project.
            </p>
            <Link
              href="/donate"
              className="inline-block py-3 px-8 rounded-lg bg-gold hover:bg-gold-hover text-background font-medium transition-colors"
            >
              Donate
            </Link>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-8 text-center">Questions</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-foreground font-semibold mb-1">What&apos;s the difference between models?</h3>
              <p className="text-muted text-sm leading-relaxed">
                Haiku is fast and concise. Sonnet provides deeper reasoning and more nuanced responses.
                Opus is the most capable model — best for complex questions and creative thinking.
                All models have full context of the live deliberation.
              </p>
            </div>
            <div>
              <h3 className="text-foreground font-semibold mb-1">What&apos;s a collective Talk?</h3>
              <p className="text-muted text-sm leading-relaxed">
                When you chat with the Collective AI, you can &ldquo;set&rdquo; any of your messages as a Talk.
                This creates a public deliberation that others can join, discuss, and vote on.
                Each user gets one active collective Talk at a time.
              </p>
            </div>
            <div>
              <h3 className="text-foreground font-semibold mb-1">Is manual creation affected?</h3>
              <p className="text-muted text-sm leading-relaxed">
                No. Creating Talks manually at <Link href="/talks/new" className="text-accent hover:text-accent-hover">/talks/new</Link> is
                always free and unlimited for everyone. The rate limit only applies to
                changing your collective Talk via the AI chat.
              </p>
            </div>
            <div>
              <h3 className="text-foreground font-semibold mb-1">Why donations?</h3>
              <p className="text-muted text-sm leading-relaxed">
                Union Chant aims to be accessible to everyone. AI API costs are real, but we&apos;d
                rather fund them through community support than lock features behind paywalls.
                Paid tiers exist to sustainably cover higher-cost models.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
