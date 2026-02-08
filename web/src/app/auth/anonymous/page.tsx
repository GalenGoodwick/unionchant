'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import RunawayButton, { type ChallengeData } from '@/components/RunawayButton'

export default function AnonymousSignIn() {
  const router = useRouter()
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/anonymous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create anonymous session')
        setLoading(false)
        return
      }

      const { signIn } = await import('next-auth/react')
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      })

      if (result?.error) {
        setError('Failed to sign in')
        setLoading(false)
      } else {
        router.push('/')
      }
    } catch {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="bg-background rounded-lg p-8 max-w-2xl w-full border border-border">
        <h1 className="text-2xl font-bold text-foreground text-center mb-2">
          Anonymous Entry
        </h1>
        <p className="text-muted text-center mb-6">
          Non-linked account — no email, no password, no identity
        </p>

        <div className="bg-success-bg border border-success/30 text-success text-sm p-4 rounded-lg mb-6 space-y-2">
          <p className="font-semibold">🔒 How It Works</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li><strong>No email or password required</strong> — We generate a random account for you</li>
            <li><strong>No IP address stored</strong> — We actively strip it before processing</li>
            <li><strong>Your entries are preserved</strong> — Ideas and votes stay in the system permanently</li>
            <li><strong>Not linked to your identity</strong> — There is no way to trace this account back to you</li>
            <li><strong>One catch</strong> — If you lose your session (clear cookies, switch device), there is no way to recover it</li>
          </ul>
        </div>

        {error && (
          <div className="bg-error-bg border border-error text-error text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {!verified ? (
          <div className="space-y-3">
            <p className="text-muted text-sm text-center">Prove you&apos;re human — catch the button:</p>
            <RunawayButton onCaught={(_data: ChallengeData) => setVerified(true)} />
          </div>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating session...' : 'Enter Anonymously'}
          </button>
        )}

        <div className="mt-8 text-center space-y-3">
          <p className="text-muted text-sm">
            Want to save your participation history?{' '}
            <Link href="/auth/signin" className="text-accent hover:text-accent-hover">
              Sign in
            </Link>
            {' or '}
            <Link href="/auth/signup" className="text-accent hover:text-accent-hover">
              Sign up
            </Link>
          </p>
          <Link href="/" className="text-muted hover:text-foreground text-sm block">
            &larr; Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
