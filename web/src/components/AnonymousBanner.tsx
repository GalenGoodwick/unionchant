'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function AnonymousBanner() {
  const [dismissed, setDismissed] = useState(false)

  console.log('AnonymousBanner rendering, dismissed:', dismissed)

  const handleDismiss = () => {
    setDismissed(true)
  }

  if (dismissed) return null

  return (
    <div className="bg-accent/95 border-b border-accent-hover">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <p className="text-white text-sm font-medium">
          Sign up to vote, submit ideas, discuss, and create chants.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/how"
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
          >
            Learn more
          </Link>
          <Link
            href="/auth/signin"
            className="px-4 py-1.5 bg-white text-accent rounded-lg text-sm font-semibold hover:bg-white/90 transition-colors whitespace-nowrap"
          >
            Sign up
          </Link>
          <button
            onClick={handleDismiss}
            className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors text-white"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
