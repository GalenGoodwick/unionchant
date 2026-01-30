import Link from 'next/link'
import { Metadata } from 'next'
import Header from '@/components/Header'

export const metadata: Metadata = {
  title: 'About | Union Chant',
  description: 'Learn about Union Chant — scalable direct democracy through tiered small-group deliberation.',
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">About Union Chant</h1>
        <p className="text-lg text-muted mb-10">
          Scalable direct democracy through small-group deliberation.
        </p>

        <div className="space-y-4">
          <Link
            href="/how-it-works"
            className="block bg-background border border-border rounded-lg p-6 hover:border-accent transition-colors group"
          >
            <h2 className="text-xl font-semibold text-foreground group-hover:text-accent transition-colors mb-2">
              How It Works
            </h2>
            <p className="text-muted">
              A technical deep-dive into the tiered tournament algorithm — 5-person cells, cross-cell tallying, rolling mode, and how ideas compete at scale.
            </p>
          </Link>

          <Link
            href="/demo"
            className="block bg-background border border-border rounded-lg p-6 hover:border-accent transition-colors group"
          >
            <h2 className="text-xl font-semibold text-foreground group-hover:text-accent transition-colors mb-2">
              Interactive Demo
            </h2>
            <p className="text-muted">
              Watch the deliberation algorithm in action. See how ideas are submitted, cells form, votes are cast, and winners advance through tiers.
            </p>
          </Link>

          <Link
            href="/whitepaper"
            className="block bg-background border border-border rounded-lg p-6 hover:border-accent transition-colors group"
          >
            <h2 className="text-xl font-semibold text-foreground group-hover:text-accent transition-colors mb-2">
              Whitepaper
            </h2>
            <p className="text-muted">
              The full vision — why existing systems fail, the theory behind Union Chant, and how collective decision-making can scale to millions.
            </p>
          </Link>
        </div>
      </div>
    </div>
  )
}
