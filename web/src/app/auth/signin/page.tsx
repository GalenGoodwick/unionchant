'use client'

import { useState, useCallback, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Turnstile from '@/components/Turnstile'

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const verified = searchParams.get('verified')
  const authError = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const handleCaptchaExpire = useCallback(() => setCaptchaToken(null), [])

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password')
      } else {
        router.push('/')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, captchaToken }),
      })
      if (res.ok) {
        setForgotSent(true)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to send reset email')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-foreground text-center mb-2">
        Sign in to Union Chant
      </h1>
      <p className="text-muted text-center mb-8">
        Join the conversation
      </p>

      {verified && (
        <div className="bg-success-bg border border-success text-success text-sm p-3 rounded-lg mb-4 text-center">
          Email verified! You can now sign in.
        </div>
      )}

      {authError === 'expired-token' && (
        <div className="bg-error-bg border border-error text-error text-sm p-3 rounded-lg mb-4 text-center">
          Verification link expired. Please sign up again.
        </div>
      )}

      {error && (
        <div className="bg-error-bg border border-error text-error text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {forgotMode ? (
        forgotSent ? (
          <div className="text-center">
            <p className="text-muted mb-4">
              If an account exists for <strong>{email}</strong>, we sent a password reset link.
            </p>
            <button onClick={() => { setForgotMode(false); setForgotSent(false) }} className="text-accent hover:text-accent-hover text-sm">
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <p className="text-muted text-sm text-center">Enter your email to receive a reset link</p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-accent"
            />
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
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <button type="button" onClick={() => setForgotMode(false)} className="w-full text-muted text-sm hover:text-foreground">
              Back to sign in
            </button>
          </form>
        )
      ) : (
        <>
          <div className="space-y-4">
            <button
              onClick={() => signIn('google', { callbackUrl: '/' })}
              className="w-full bg-background hover:bg-surface text-foreground font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors border border-border"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </div>

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-muted text-sm">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleCredentialsLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="Email"
              className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-accent"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Password"
              className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="flex justify-between items-center mt-4 text-sm">
            <button onClick={() => setForgotMode(true)} className="text-muted hover:text-foreground">
              Forgot password?
            </button>
            <Link href="/auth/signup" className="text-accent hover:text-accent-hover">
              Sign up
            </Link>
          </div>
        </>
      )}

      <div className="mt-8 text-center">
        <Link href="/" className="text-muted hover:text-foreground text-sm">
          &larr; Back to home
        </Link>
      </div>
    </>
  )
}

export default function SignIn() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="bg-background rounded-lg p-8 max-w-md w-full mx-4 border border-border">
        <Suspense fallback={<div className="text-center text-muted">Loading...</div>}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  )
}
