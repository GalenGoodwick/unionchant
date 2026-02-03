import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center px-6">
        <div className="text-8xl font-bold text-border mb-4">404</div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Page Not Found</h1>
        <p className="text-muted mb-8 max-w-md">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/"
            className="bg-accent hover:bg-accent-hover text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Go Home
          </Link>
          <Link
            href="/talks"
            className="bg-surface hover:bg-border text-foreground px-6 py-2 rounded-lg font-medium transition-colors border border-border"
          >
            Browse Talks
          </Link>
        </div>
      </div>
    </div>
  )
}
