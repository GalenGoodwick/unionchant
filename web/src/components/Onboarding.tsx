'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

interface OnboardingProps {
  onComplete: () => void
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { data: session, update } = useSession()
  const [name, setName] = useState(session?.user?.name || '')
  const [bio, setBio] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ESC key to skip
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [])

  const handleSkip = async () => {
    try {
      await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skip: true }),
      })
    } catch {
      // Still dismiss even if API fails
    }
    onComplete()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Please enter your name')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          bio: bio.trim() || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save profile')
      }

      await update({ name: name.trim() })
      onComplete()
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
        <p className="text-muted mb-1">Teams chant, priorities are set.</p>
        <p className="text-muted text-sm mb-6">Join questions to vote on — or create your own.</p>

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
            />
            <p className="text-xs text-muted mt-1">This will be shown with your ideas and votes</p>
          </div>

          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-foreground mb-1">
              Bio <span className="text-muted">(optional)</span>
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us a bit about yourself..."
              maxLength={200}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground placeholder:text-muted focus:outline-none focus:border-accent resize-none"
            />
            <p className="text-xs text-muted mt-1">{bio.length}/200 characters</p>
          </div>

          {error && (
            <p className="text-error text-sm bg-error-bg p-2 rounded">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="w-full py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Saving...' : 'Get Started'}
          </button>

          <button
            type="button"
            onClick={handleSkip}
            className="w-full py-2 text-muted text-sm hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        </form>
      </div>
    </div>
  )
}
