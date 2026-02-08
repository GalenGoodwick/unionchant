'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'

export default function LandingCTA({ variant = 'hero' }: { variant?: 'hero' | 'footer' }) {
  const { data: session } = useSession()

  if (variant === 'footer') {
    return session ? (
      <>
        <Link
          href="/chants"
          className="bg-accent hover:bg-accent-hover text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors"
        >
          Go to Feed
        </Link>
        <Link
          href="/chants/new"
          className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors border border-white/20"
        >
          Start a Chant
        </Link>
      </>
    ) : (
      <>
        <Link
          href="/auth/signup"
          className="bg-accent hover:bg-accent-hover text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors"
        >
          Get Started — It&apos;s Free
        </Link>
        <Link
          href="/demo"
          className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors border border-white/20"
        >
          Watch Demo
        </Link>
      </>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        {session ? (
          <Link
            href="/chants"
            className="bg-accent hover:bg-accent-hover text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors"
          >
            Go to Feed
          </Link>
        ) : (
          <Link
            href="/auth/signup"
            className="bg-accent hover:bg-accent-hover text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors"
          >
            Get Started
          </Link>
        )}
        <Link
          href="/demo"
          className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors border border-white/20"
        >
          Watch the Demo
        </Link>
      </div>
      {!session && (
        <Link
          href="/auth/anonymous"
          className="text-white/70 hover:text-white text-sm transition-colors"
        >
          or enter anonymously →
        </Link>
      )}
    </div>
  )
}
