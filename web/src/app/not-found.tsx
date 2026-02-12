'use client'

import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

export default function NotFound() {
  return (
    <FrameLayout hideFooter contentClassName="flex items-center justify-center">
      <div className="text-center px-6">
        <div className="text-6xl font-bold text-border mb-4">404</div>
        <h1 className="text-sm font-bold text-foreground mb-2">Page Not Found</h1>
        <p className="text-muted text-xs mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors"
        >
          Go Home
        </Link>
      </div>
    </FrameLayout>
  )
}
