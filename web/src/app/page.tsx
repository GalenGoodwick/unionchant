import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Union Chant - Collective Decision Making',
  description: 'Scale is not achieved by enlarging a conversation. It is achieved by multiplying conversations. Small group deliberation at any scale.',
}

export default function Home() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-header text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold font-serif">Union Chant</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/deliberations" className="hover:text-accent-light transition-colors">
              Deliberations
            </Link>
            <Link href="/auth/signin" className="hover:text-accent-light transition-colors">
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Hero */}
        <div className="bg-background rounded-lg border border-border p-4 sm:p-8 mb-6 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Union Chant
          </h1>
          <p className="text-base sm:text-lg text-muted mb-6 max-w-2xl mx-auto">
            Collective decision-making for the modern age.
            Small group deliberation at any scale.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center sm:flex-wrap">
            <Link
              href="/deliberations/new"
              className="bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Start a Deliberation
            </Link>
            <Link
              href="/deliberations"
              className="bg-background border border-border-strong hover:border-muted text-foreground px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Browse Public
            </Link>
            <Link
              href="/demo"
              className="bg-background border border-border-strong hover:border-muted text-foreground px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Watch Demo
            </Link>
            <Link
              href="/how-it-works"
              className="bg-background border border-border-strong hover:border-muted text-foreground px-6 py-3 rounded-lg font-medium transition-colors"
            >
              How It Works
            </Link>
          </div>
        </div>

        {/* Stats-style cards */}
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-background rounded-lg border border-border p-4 sm:p-6">
            <div className="text-3xl font-bold text-accent mb-2">1</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Submit Ideas</h3>
            <p className="text-muted text-sm">
              Everyone contributes proposals, not just reacts to preset options.
            </p>
          </div>
          <div className="bg-background rounded-lg border border-border p-4 sm:p-6">
            <div className="text-3xl font-bold text-accent mb-2">2</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Small Groups Deliberate</h3>
            <p className="text-muted text-sm">
              Groups of 5 discuss and vote. Ideas that earn support advance.
            </p>
          </div>
          <div className="bg-background rounded-lg border border-border p-4 sm:p-6">
            <div className="text-3xl font-bold text-accent mb-2">3</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Best Ideas Win</h3>
            <p className="text-muted text-sm">
              Through multiple rounds, the strongest ideas emerge as champions.
            </p>
          </div>
        </div>

        {/* Info card */}
        <div className="bg-background rounded-lg border border-border p-6">
          <p className="text-muted mb-4 italic text-center">
            &ldquo;Scale is not achieved by enlarging a conversation.
            It is achieved by multiplying conversations.&rdquo;
          </p>
          <div className="flex gap-6 justify-center flex-wrap text-sm">
            <Link
              href="/whitepaper"
              className="text-accent hover:text-accent-hover transition-colors"
            >
              Whitepaper
            </Link>
            <span className="text-border-strong">|</span>
            <Link
              href="/donate"
              className="text-accent hover:text-accent-hover transition-colors"
            >
              Support Us
            </Link>
            <span className="text-border-strong">|</span>
            <Link
              href="/terms"
              className="text-muted hover:text-foreground transition-colors"
            >
              Terms
            </Link>
            <span className="text-border-strong">|</span>
            <Link
              href="/privacy"
              className="text-muted hover:text-foreground transition-colors"
            >
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
