'use client'

import { useState } from 'react'
import { useToast } from '@/components/Toast'

interface PasskeyPromptProps {
  action: string // e.g. "voted", "created a chant", "chatted"
  onDone: () => void
  onCancel?: () => void
}

export default function PasskeyPrompt({ action, onDone, onCancel }: PasskeyPromptProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()

  const handleRegister = async () => {
    setLoading(true)
    setError(null)
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')

      const optRes = await fetch('/api/webauthn/register-options')
      if (!optRes.ok) throw new Error('Failed to start registration')
      const options = await optRes.json()

      const credential = await startRegistration({ optionsJSON: options })

      const verifyRes = await fetch('/api/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      })
      if (!verifyRes.ok) throw new Error('Registration failed')

      showToast('Account saved! Sign in with Touch ID next time.', 'success')
      sessionStorage.setItem('passkeyRegistered', 'true')
      onDone()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed'
      // Don't show error if user cancelled the Touch ID prompt
      if (msg.includes('ceremony was sent an abort signal') || msg.includes('not allowed')) {
        onDone()
        return
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = () => {
    sessionStorage.setItem('passkeyPromptDismissed', 'true')
    if (onCancel) {
      onCancel()
    } else {
      onDone()
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
      <div className="bg-background border border-border rounded-xl p-6 max-w-sm w-full shadow-2xl">
        <div className="text-center mb-4">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-success/10 flex items-center justify-center">
            <svg className="w-7 h-7 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2 2-.9 2-2zm-2 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm9-8c0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2 2-.9 2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-foreground">Save your account</h3>
          <p className="text-muted text-sm mt-1">
            You just {action}. Save with Touch ID so you can come back.
          </p>
        </div>

        {error && (
          <div className="bg-error-bg border border-error text-error text-xs p-2 rounded-lg mb-3 text-center">
            {error}
          </div>
        )}

        <button
          onClick={handleRegister}
          disabled={loading}
          className="w-full bg-success hover:bg-success-hover text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 mb-2"
        >
          {loading ? 'Registering...' : 'Save with Touch ID'}
        </button>

        <button
          onClick={handleDismiss}
          className="w-full text-muted text-sm hover:text-foreground py-2 transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
