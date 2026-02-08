'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Turnstile from '@/components/Turnstile'

export default function SignUpPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const handleCaptchaExpire = useCallback(() => setCaptchaToken(null), [])
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, captchaToken }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create account')
        return
      }

      setSuccess(true)
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setResent(true)
    } catch {
      // ignore
    } finally {
      setResending(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="bg-background rounded-lg p-8 max-w-md w-full mx-4 border border-border text-center">
          <div className="text-4xl mb-4">&#9993;</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Check your email</h1>
          <p className="text-muted mb-4">
            We sent a verification link to <strong>{email}</strong>. Click the link to verify your account.
          </p>
          <p className="text-muted text-sm mb-6">
            Check your spam/junk folder if you don&apos;t see it.
          </p>
          {resent ? (
            <p className="text-success text-sm mb-4">Verification email resent.</p>
          ) : (
            <button
              onClick={handleResend}
              disabled={resending}
              className="text-accent hover:text-accent-hover text-sm mb-4 disabled:opacity-50"
            >
              {resending ? 'Resending...' : 'Didn\'t get it? Resend verification email'}
            </button>
          )}
          <div>
            <Link href="/auth/signin" className="text-accent hover:text-accent-hover">
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="bg-background rounded-lg p-8 max-w-md w-full mx-4 border border-border">
        <h1 className="text-2xl font-bold text-foreground text-center mb-2">
          Create an account
        </h1>
        <p className="text-muted text-center mb-8">
          Millions of people, one honest answer.
        </p>

        {error && (
          <div className="bg-error-bg border border-error text-error text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <Link
          href="/auth/anonymous"
          className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors mb-6"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Enter Anonymously (No Data Collected)
        </Link>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted text-sm">or create an account</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-accent"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-accent"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-accent"
              placeholder="At least 8 characters"
            />
          </div>
          <Turnstile
            onVerify={setCaptchaToken}
            onExpire={handleCaptchaExpire}
            className="flex justify-center"
          />
          <p className="text-xs text-muted text-center">
            By signing up, you agree to our{' '}
            <Link href="/terms" className="text-accent hover:text-accent-hover underline">Terms of Service</Link>
            {' '}and{' '}
            <Link href="/privacy" className="text-accent hover:text-accent-hover underline">Privacy Policy</Link>.
          </p>
          <button
            type="submit"
            disabled={loading || !captchaToken}
            className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <p className="text-muted text-sm text-center mt-6">
          Already have an account?{' '}
          <Link href="/auth/signin" className="text-accent hover:text-accent-hover">
            Sign in
          </Link>
        </p>

        <div className="mt-8 text-center">
          <Link href="/" className="text-muted hover:text-foreground text-sm">
            &larr; Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
