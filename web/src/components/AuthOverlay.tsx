'use client'

import { useState, useCallback } from 'react'
import { signIn } from 'next-auth/react'

const hasGoogle = !!process.env.NEXT_PUBLIC_HAS_GOOGLE

interface AuthOverlayProps {
  open: boolean
  onClose: () => void
  onAuthSuccess: () => void
  callbackUrl?: string
  tempUserId?: string  // Current temp account to merge after real sign-in
}

export default function AuthOverlay({ open, onClose, onAuthSuccess, callbackUrl, tempUserId }: AuthOverlayProps) {
  const [error, setError] = useState('')
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeySignupLoading, setPasskeySignupLoading] = useState(false)
  // Name step — shown after successful in-page auth if user has no name
  const [nameStep, setNameStep] = useState(false)
  const [name, setName] = useState('')
  const [nameLoading, setNameLoading] = useState(false)
  const [anonUpgrading, setAnonUpgrading] = useState(false)

  const completeAuth = useCallback(async () => {
    // Merge temp account memberships into the real account
    if (tempUserId) {
      await fetch('/api/user/merge-temp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempUserId }),
      }).catch(() => {})
    }

    // Check if user needs a display name
    try {
      const res = await fetch('/api/user/me')
      if (res.ok) {
        const user = await res.json()
        if (!user.name || user.name.startsWith('Anonymous_') || user.name.startsWith('passkey_')) {
          setNameStep(true)
          return
        }
      }
    } catch {}
    onAuthSuccess()
  }, [onAuthSuccess, tempUserId])

  const handleNameSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setNameLoading(true)
    try {
      const res = await fetch('/api/user/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to save name')
        return
      }
    } catch {
      setError('Network error')
      return
    } finally {
      setNameLoading(false)
    }
    onAuthSuccess()
  }

  const handleSkipName = () => {
    onAuthSuccess()
  }

  const handlePasskeySignup = async () => {
    setError('')
    setPasskeySignupLoading(true)
    try {
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
      const result = await signIn('credentials', {
        email: syntheticEmail,
        password: randomPassword,
        redirect: false,
      })
      if (result?.error) throw new Error('Failed to sign in')

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

      await completeAuth()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey signup failed'
      if (!msg.includes('ceremony was sent an abort signal') && !msg.includes('not allowed')) {
        setError(msg)
      }
    } finally {
      setPasskeySignupLoading(false)
    }
  }

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
        await completeAuth()
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

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl: callbackUrl || '/chants' })
  }

  if (!open) return null

  const anyLoading = passkeyLoading || passkeySignupLoading || anonUpgrading

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(2, 6, 23, 0.80)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget && !anyLoading && !nameStep) onClose() }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-lg border p-6 space-y-4"
        style={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }}
      >
        {nameStep ? (
          <>
            <h2 className="text-lg font-bold text-foreground text-center">Choose a display name</h2>
            <p className="text-xs text-muted text-center">Other participants will see this name</p>
            {error && (
              <div className="text-xs text-error text-center p-2 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                {error}
              </div>
            )}
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter' && name.trim()) handleNameSubmit() }}
              placeholder="Your display name"
              className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-accent"
              autoFocus
              maxLength={50}
            />
            <button
              onClick={handleNameSubmit}
              disabled={!name.trim() || nameLoading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-40"
              style={{ backgroundColor: '#0891b2' }}
            >
              {nameLoading ? 'Saving...' : 'Continue'}
            </button>
            <button
              onClick={handleSkipName}
              className="w-full text-xs text-muted hover:text-foreground transition-colors py-1"
            >
              Skip for now
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-foreground text-center">Sign in to continue</h2>
            <p className="text-xs text-muted text-center">Your place is saved, you won&apos;t lose your spot</p>

            {error && (
              <div className="text-xs text-error text-center p-2 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                {error}
              </div>
            )}

            <div className="space-y-2.5">
              <button
                onClick={async () => {
                  setError('')
                  setAnonUpgrading(true)
                  try {
                    // Upgrade the temp account to a full anonymous account
                    const res = await fetch('/api/user/upgrade-temp', { method: 'POST' })
                    if (!res.ok) {
                      // Fallback: create new anonymous account
                      const anonRes = await fetch('/api/anonymous', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                      })
                      if (!anonRes.ok) throw new Error('Failed to create account')
                      const { email, password } = await anonRes.json()
                      const result = await signIn('credentials', { email, password, redirect: false })
                      if (result?.error) throw new Error('Sign in failed')
                    }
                    await completeAuth()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed')
                  } finally {
                    setAnonUpgrading(false)
                  }
                }}
                disabled={anyLoading || anonUpgrading}
                className="w-full py-2.5 px-4 rounded-lg flex items-center justify-center gap-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#0891b2' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                {anonUpgrading ? 'Entering...' : 'Enter Anonymously'}
              </button>

              <button
                onClick={handlePasskeySignup}
                disabled={anyLoading}
                className="w-full py-2.5 px-4 rounded-lg flex items-center justify-center gap-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#f59e0b' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                {passkeySignupLoading ? 'Setting up...' : 'Create account with Touch ID'}
              </button>

              <button
                onClick={handlePasskeySignin}
                disabled={anyLoading}
                className="w-full text-muted hover:text-foreground text-xs py-1.5 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2 2-.9 2-2zm-2 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
                {passkeyLoading ? 'Verifying...' : 'Restore session with Touch ID'}
              </button>

              {hasGoogle && (
                <button
                  onClick={handleGoogleSignIn}
                  disabled={anyLoading}
                  className="w-full py-2.5 px-4 rounded-lg flex items-center justify-center gap-2.5 text-sm font-semibold text-foreground transition-colors border disabled:opacity-50"
                  style={{ backgroundColor: '#020617', borderColor: '#1e293b' }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>
              )}
            </div>

            <button
              onClick={onClose}
              disabled={anyLoading}
              className="w-full text-xs text-muted hover:text-foreground transition-colors py-1"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
