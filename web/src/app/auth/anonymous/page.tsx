'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import RunawayButton, { type ChallengeData } from '@/components/RunawayButton'
import FrameLayout from '@/components/FrameLayout'

export default function AnonymousSignIn() {
  const router = useRouter()
  const [verified, setVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  // Fetch a signed challenge token on mount
  useEffect(() => {
    fetch('/api/challenge/anonymous')
      .then(r => r.json())
      .then(d => setChallengeToken(d.token))
      .catch(() => {})
  }, [retryKey])

  const handleCaught = useCallback(async (data: ChallengeData) => {
    if (!challengeToken) return
    setVerifying(true)
    try {
      const res = await fetch('/api/challenge/anonymous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: challengeToken,
          pointerEvents: data.pointerEvents,
          chaseDurationMs: data.chaseDurationMs,
          evadeCount: data.evadeCount,
          surrendered: data.surrendered,
        }),
      })
      const json = await res.json()
      if (json.verified) {
        setVerified(true)
      } else {
        setError('Verification failed — try again')
        setRetryKey(k => k + 1)
      }
    } catch {
      setError('Verification failed — try again')
      setRetryKey(k => k + 1)
    } finally {
      setVerifying(false)
    }
  }, [challengeToken])

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
    <FrameLayout hideFooter>
      <div className="flex-1 flex items-center justify-center py-8">
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-6 w-full">
          <h1 className="text-xl font-bold text-foreground text-center mb-1.5">
            Anonymous Entry
          </h1>
          <p className="text-muted text-xs text-center mb-4">
            Non-linked account — no email, no password, no identity
          </p>

          <div className="bg-success-bg border border-success/30 text-success text-xs p-3 rounded-lg mb-4 space-y-1.5">
            <p className="font-semibold">How It Works</p>
            <ul className="list-disc list-inside space-y-0.5 text-[11px]">
              <li><strong>No email or password required</strong> — We generate a random account for you</li>
              <li><strong>No IP address stored</strong> — We actively strip it before processing</li>
              <li><strong>Your entries are preserved</strong> — Ideas and votes stay in the system permanently</li>
              <li><strong>Not linked to your identity</strong> — There is no way to trace this account back to you</li>
              <li><strong>One catch</strong> — If you lose your session (clear cookies, switch device), there is no way to recover it</li>
            </ul>
          </div>

          {error && (
            <div className="bg-error-bg border border-error text-error text-xs p-2.5 rounded-lg mb-3">
              {error}
            </div>
          )}

          {!verified ? (
            <div className="space-y-2">
              <p className="text-muted text-xs text-center">Prove you&apos;re human — catch the button:</p>
              {verifying ? (
                <div className="text-center py-8">
                  <p className="text-accent text-sm animate-pulse">Verifying...</p>
                </div>
              ) : (
                <RunawayButton key={retryKey} onCaught={handleCaught} />
              )}
            </div>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? 'Creating session...' : 'Enter Anonymously'}
            </button>
          )}

          <div className="mt-6 text-center space-y-2">
            <p className="text-muted text-xs">
              Want to save your participation history?{' '}
              <Link href="/auth/signin" className="text-accent hover:text-accent-hover">
                Sign in
              </Link>
              {' or '}
              <Link href="/auth/signup" className="text-accent hover:text-accent-hover">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </FrameLayout>
  )
}
