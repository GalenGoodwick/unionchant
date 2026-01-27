import Link from 'next/link'

export default function DonatePage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-header text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-semibold font-serif hover:text-accent-light transition-colors">
            Union Chant
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/deliberations" className="hover:text-accent-light transition-colors">
              Deliberations
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href="/" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Back to home
        </Link>

        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">Support Union Chant</h1>
          <p className="text-xl text-muted mb-8">
            Help us build tools for collective decision-making
          </p>

          <div className="bg-background rounded-lg p-8 border border-border mb-8">
            <div className="text-6xl mb-4 text-muted">Coming Soon</div>
            <p className="text-muted">
              We&apos;re setting up donation options. Check back soon!
            </p>
          </div>

          <div className="text-muted text-sm">
            <p className="mb-4">
              Union Chant is free for public deliberations and always will be.
              Your donations help us maintain the platform and build new features.
            </p>
            <p>
              Questions? Contact us at{' '}
              <a href="mailto:hello@unionchant.com" className="text-accent hover:text-accent-hover">
                hello@unionchant.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
