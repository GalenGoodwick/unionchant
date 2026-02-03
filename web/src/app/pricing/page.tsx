import Link from 'next/link'
import { Metadata } from 'next'
import Header from '@/components/Header'

export const metadata: Metadata = {
  title: 'Pricing - Union Chant',
  description: 'Free to chat, free to create. Upgrade for unlimited Talk changes.',
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Back to home
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">Simple pricing</h1>
          <p className="text-lg text-muted max-w-xl mx-auto">
            Creating deliberations is always free. Chat with AI is always free.
            Upgrade to change your collective Talk without limits.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Free tier */}
          <div className="bg-background rounded-xl border border-border p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-1">Free</h2>
              <p className="text-muted text-sm">For everyone</p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold text-foreground font-mono">$0</span>
              <span className="text-muted ml-1">/month</span>
            </div>
            <ul className="space-y-3 mb-8 text-sm">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-success shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-foreground">
                  <strong>Unlimited AI chat</strong> with the Collective (Haiku)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-success shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-foreground">
                  <strong>Create unlimited Talks</strong> manually at /talks/new
                </span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-success shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-foreground">
                  Join, vote, and comment in all deliberations
                </span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-success shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-foreground">
                  <strong>1 collective Talk change</strong> per day
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

          {/* Pro tier */}
          <div className="bg-background rounded-xl border-2 border-gold p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="text-xs px-3 py-1 rounded-full bg-gold text-background font-semibold">
                PRO
              </span>
            </div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-1">Pro</h2>
              <p className="text-muted text-sm">For active deliberators</p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-bold text-gold font-mono">$3</span>
              <span className="text-muted ml-1">/month</span>
            </div>
            <ul className="space-y-3 mb-8 text-sm">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-gold shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-foreground">
                  Everything in Free
                </span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-gold shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-foreground">
                  <strong>Unlimited collective Talk changes</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-gold shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-foreground">
                  Sonnet &amp; Opus AI models <span className="text-muted">(coming soon)</span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-gold shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-foreground">
                  Support the platform
                </span>
              </li>
            </ul>
            <a
              href="mailto:galen.goodwick@icloud.com?subject=Pro%20Subscription"
              className="block w-full text-center py-3 px-6 rounded-lg bg-gold hover:bg-gold-hover text-background font-medium transition-colors"
            >
              Coming soon
            </a>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground mb-8 text-center">Questions</h2>
          <div className="space-y-6">
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
              <h3 className="text-foreground font-semibold mb-1">Can I cancel anytime?</h3>
              <p className="text-muted text-sm leading-relaxed">
                Yes. Pro subscriptions can be cancelled at any time. Your existing
                Talks and deliberations are never deleted when you downgrade.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
