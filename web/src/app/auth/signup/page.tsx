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

  if (success) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="bg-background rounded-lg p-8 max-w-md w-full mx-4 border border-border text-center">
          <div className="text-4xl mb-4">&#9993;</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Check your email</h1>
          <p className="text-muted mb-6">
            We sent a verification link to <strong>{email}</strong>. Click the link to verify your account.
          </p>
          <Link href="/auth/signin" className="text-accent hover:text-accent-hover">
            Go to sign in
          </Link>
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
          Vote on ideas with others. Teams talk, priorities are set.
        </p>

        {error && (
          <div className="bg-error-bg border border-error text-error text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

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
