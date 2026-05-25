'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

const hasGoogle = !!process.env.NEXT_PUBLIC_HAS_GOOGLE


function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const verified = searchParams.get('verified')
  const authError = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeySignupLoading, setPasskeySignupLoading] = useState(false)

  const handlePasskeySignin = async () => {
    setError('')
    setPasskeyLoading(true)
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')
      const optRes = await fetch('/api/webauthn/authenticate-options')
      if (!optRes.ok) throw new Error('No passkeys available')
      const options = await optRes.json()

      const credential = await startAuthentication({ optionsJSON: options })

      const verifyRes = await fetch('/api/webauthn/authenticate-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      })
      if (!verifyRes.ok) throw new Error('Verification failed')
      const { passkeyToken } = await verifyRes.json()

      const result = await signIn('credentials', {
        email: '__passkey__',
        password: passkeyToken,
        redirect: false,
      })

      if (result?.error) {
        setError('Passkey sign-in failed')
      } else {
        router.push('/')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey sign-in failed'
      if (!msg.includes('ceremony was sent an abort signal') && !msg.includes('not allowed')) {
        setError(msg)
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  const handlePasskeySignup = async () => {
    setError('')
    setPasskeySignupLoading(true)

    try {
      // Create account with synthetic email (no real email needed)
      const syntheticEmail = `passkey_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@hosted.unitychant.com`
      const randomPassword = crypto.randomUUID()
      const signupRes = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: null, email: syntheticEmail, password: randomPassword }),
      })

      if (!signupRes.ok) {
        const data = await signupRes.json()
        throw new Error(data.error || 'Failed to create account')
      }

      // Auto sign in
      const result = await signIn('credentials', {
        email: syntheticEmail,
        password: randomPassword,
        redirect: false,
      })

      if (result?.error) throw new Error('Failed to sign in')

      // Register passkey
      const { startRegistration } = await import('@simplewebauthn/browser')
      const optRes = await fetch('/api/webauthn/register-options')
      if (!optRes.ok) throw new Error('Failed to get registration options')
      const options = await optRes.json()
      const credential = await startRegistration({ optionsJSON: options })

      const verifyRes = await fetch('/api/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, deviceName: 'My device' }),
      })
      if (!verifyRes.ok) throw new Error('Passkey registration failed')

      // Prompt for push notifications
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission()
      }

      // Success - redirect
      router.push('/')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey signup failed'
      if (!msg.includes('ceremony was sent an abort signal') && !msg.includes('not allowed')) {
        setError(msg)
      }
    } finally {
      setPasskeySignupLoading(false)
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
        body: JSON.stringify({ email }),
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
        Sign in to Unity Chant
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

      {authError && authError !== 'expired-token' && (
        <div className="bg-error-bg border border-error text-error text-sm p-3 rounded-lg mb-4 text-center">
          {authError === 'OAuthAccountNotLinked'
            ? 'This email is already registered with a different sign-in method. Try email/password instead.'
            : authError === 'AccessDenied'
              ? 'Access denied. Your account may be suspended.'
              : `Sign-in failed (${authError}). Please try again.`}
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
            <button
              type="submit"
              disabled={loading}
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
          <div className="space-y-3">
            <Link
              href="/auth/anonymous"
              className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Enter Anonymously (No Personal Data Collected)
            </Link>
            <button
              onClick={handlePasskeySignup}
              disabled={passkeySignupLoading}
              className="w-full bg-gold hover:bg-gold-hover text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1721 9z" />
              </svg>
              {passkeySignupLoading ? 'Setting up...' : 'Create device-based account with Touch ID'}
            </button>
            <button
              onClick={handlePasskeySignin}
              disabled={passkeyLoading}
              className="w-full text-muted hover:text-foreground text-sm py-2 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2 2-.9 2-2zm-2 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm9-8c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2 2-.9 2-2z" />
              </svg>
              {passkeyLoading ? 'Verifying...' : 'Restore session with Touch ID'}
            </button>
            {hasGoogle && (
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
            )}
          </div>
        </>
      )}
    </>
  )
}

export default function SignIn() {
  return (
    <FrameLayout hideFooter showBack contentClassName="flex items-center justify-center">
      <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-8 w-full">
        <Suspense fallback={<div className="text-center text-muted">Loading...</div>}>
          <SignInForm />
        </Suspense>
      </div>
    </FrameLayout>
  )
}
