'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface OnboardingProps {
  onComplete: () => void
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if user already has an agent
  const [hasAgent, setHasAgent] = useState(false)
  const [checkingAgent, setCheckingAgent] = useState(true)

  useEffect(() => {
    async function checkExistingAgent() {
      try {
        const res = await fetch('/api/my-agents')
        if (res.ok) {
          const data = await res.json()
          if (data.agents && data.agents.length > 0) {
            setHasAgent(true)
          }
        }
      } catch { /* ignore */ }
      setCheckingAgent(false)
    }
    checkExistingAgent()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/user/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save name')
      }

      // Flag that onboarding is in progress (prevents modal re-showing on refresh)
      sessionStorage.setItem('onboardingStarted', '1')
      onComplete()

      if (hasAgent) {
        router.push('/chants')
      } else {
        // Go to the real agent creation page
        router.push(`/agents/new?onboarding=1&displayName=${encodeURIComponent(name.trim())}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl max-w-md w-full p-6 shadow-xl">
        <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to Unity Chant</h2>
        <p className="text-muted text-sm mb-6">
          Communities chant, priorities are set. Let&apos;s get you started.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1">
              Display Name <span className="text-error">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How should we call you?"
              maxLength={50}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
              autoFocus
            />
            <p className="text-xs text-muted mt-1">This will be shown with your ideas and votes</p>
          </div>

          {error && (
            <p className="text-error text-sm bg-error-bg p-2 rounded">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !name.trim() || checkingAgent}
            className="w-full py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
