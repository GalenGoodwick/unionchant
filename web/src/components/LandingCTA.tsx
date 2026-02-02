'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'

export default function LandingCTA({ variant = 'hero' }: { variant?: 'hero' | 'footer' }) {
  const { data: session } = useSession()

  if (variant === 'footer') {
    return session ? (
      <>
        <Link
          href="/feed"
          className="bg-accent hover:bg-accent-hover text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors"
        >
          Go to Feed
        </Link>
        <Link
          href="/deliberations/new"
          className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors border border-white/20"
        >
          Start a Talk
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
    <div className="flex flex-col sm:flex-row gap-4 justify-center">
      {session ? (
        <Link
          href="/feed"
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
        Watch Demo
      </Link>
    </div>
  )
}
