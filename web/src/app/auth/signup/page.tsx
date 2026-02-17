'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

import FrameLayout from '@/components/FrameLayout'

const hasDiscord = !!process.env.NEXT_PUBLIC_HAS_DISCORD
const hasGoogle = !!process.env.NEXT_PUBLIC_HAS_GOOGLE

export default function SignUpPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [passkeyMode, setPasskeyMode] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: null, email, password }),
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

  const handlePasskeySignup = async () => {
    setError('')
    setPasskeyLoading(true)

    try {
      // Create account with synthetic email (no real email needed for passkey)
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

      // Success - redirect
      router.push('/')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey signup failed'
      if (!msg.includes('ceremony was sent an abort signal') && !msg.includes('not allowed')) {
        setError(msg)
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  if (success) {
    return (
      <FrameLayout hideFooter contentClassName="flex items-center justify-center">
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-8 w-full text-center">
          <div className="text-4xl mb-4">&#9993;</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Check your email</h1>
          <p className="text-muted mb-4">
            We sent a verification link to <strong>{email}</strong>. Verify your email, then we&apos;ll create your agent.
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
            <span onClick={() => router.push('/auth/signin')} className="text-accent hover:text-accent-hover cursor-pointer">
              Go to sign in
            </span>
          </div>
        </div>
      </FrameLayout>
    )
  }

  return (
    <FrameLayout hideFooter contentClassName="flex items-center justify-center">
      <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-8 w-full">
        <h1 className="text-2xl font-bold text-foreground text-center mb-2">
          Create Your Agent
        </h1>
        <p className="text-muted text-center mb-8">
          First, set up your account. Then we&apos;ll build your agent.
        </p>

        {error && (
          <div className="bg-error-bg border border-error text-error text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {passkeyMode ? (
          <>
            <div className="bg-accent/10 border border-accent/30 text-sm p-3 rounded-lg mb-4">
              <p className="text-foreground font-medium mb-1">Passwordless with Passkey</p>
              <p className="text-muted text-xs">
                Your passkey is bound to this device (syncs across devices in the same ecosystem like iCloud). You can add more passkeys later in settings.
              </p>
            </div>
            <div className="space-y-3 mb-4">
              <button
                onClick={handlePasskeySignup}
                disabled={passkeyLoading}
                className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {passkeyLoading ? 'Setting up...' : 'Continue with Touch ID / Face ID'}
              </button>
            </div>
            <button
              onClick={() => setPasskeyMode(false)}
              className="w-full text-muted text-sm hover:text-foreground mb-4"
            >
              Back to other options
            </button>
          </>
        ) : (
          <>
            <div className="space-y-3 mb-6">
              <button
                onClick={() => router.push('/auth/anonymous')}
                className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Enter Anonymously (No Data Collected)
              </button>
              <button
                onClick={() => setPasskeyMode(true)}
                className="w-full bg-surface hover:bg-surface-hover text-foreground font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors border border-border"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Sign up with Passkey (Touch ID / Face ID)
              </button>
              {hasDiscord && (
                <button
                  onClick={() => signIn('discord', { callbackUrl: '/' })}
                  className="w-full bg-discord hover:bg-discord-hover text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  Continue with Discord
                </button>
              )}
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

        {!passkeyMode && (
          <>
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-border" />
              <span className="text-muted text-sm">or create an account</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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
          <p className="text-xs text-muted text-center">
            By signing up, you agree to our{' '}
            <span onClick={() => router.push('/terms')} className="text-accent hover:text-accent-hover underline cursor-pointer">Terms of Service</span>
            {' '}and{' '}
            <span onClick={() => router.push('/privacy')} className="text-accent hover:text-accent-hover underline cursor-pointer">Privacy Policy</span>.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>
          </>
        )}

        <p className="text-muted text-sm text-center mt-6">
          Already have an account?{' '}
          <span onClick={() => router.push('/auth/signin')} className="text-accent hover:text-accent-hover cursor-pointer">
            Sign in
          </span>
        </p>
      </div>
    </FrameLayout>
  )
}
