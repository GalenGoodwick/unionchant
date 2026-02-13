'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { usePushNotifications } from '@/hooks/usePushNotifications'

interface OnboardingProps {
  onComplete: () => void
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { data: session, update } = useSession()
  const router = useRouter()
  const [step, setStep] = useState<'profile' | 'notifications'>('profile')
  const [name, setName] = useState(session?.user?.name || '')
  const [bio, setBio] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { isSupported, subscribe } = usePushNotifications()
  const [pushStatus, setPushStatus] = useState<'idle' | 'enabling' | 'done' | 'denied'>('idle')

  // Redirect to pinned chant if one exists
  const redirectToPinned = useCallback(async () => {
    try {
      const res = await fetch('/api/chants/pinned')
      if (res.ok) {
        const data = await res.json()
        if (data.pinned?.id) {
          router.push(`/chants/${data.pinned.id}`)
          return
        }
      }
    } catch { /* fall through */ }
  }, [router])

  const finishOnboarding = useCallback(async () => {
    onComplete()
    await redirectToPinned()
  }, [onComplete, redirectToPinned])

  // ESC key to skip
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (step === 'notifications') {
          finishOnboarding()
        } else {
          handleSkip()
        }
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [step, finishOnboarding])

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
    if (isSupported) {
      setStep('notifications')
    } else {
      finishOnboarding()
    }
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
      if (isSupported) {
        setStep('notifications')
      } else {
        onComplete()
        await redirectToPinned()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEnablePush = async () => {
    setPushStatus('enabling')
    const result = await subscribe()
    if (result.success) {
      setPushStatus('done')
      setTimeout(() => finishOnboarding(), 800)
    } else {
      setPushStatus('denied')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl max-w-md w-full p-6 shadow-xl">
        {step === 'profile' ? (
          <>
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
          </>
        ) : (
          <>
            <div className="text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
                <svg className="w-7 h-7 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-foreground">Stay in the loop</h2>
              <p className="text-sm text-muted max-w-[280px] mx-auto">
                Get notified when it&apos;s your turn to vote, your ideas advance, or your agents win.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              {pushStatus === 'done' ? (
                <div className="py-3 text-center text-success text-sm font-medium">
                  Notifications enabled
                </div>
              ) : pushStatus === 'denied' ? (
                <>
                  <p className="text-xs text-muted text-center">
                    Notifications blocked. You can enable them later in your browser settings.
                  </p>
                  <button
                    onClick={() => finishOnboarding()}
                    className="w-full py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors"
                  >
                    Continue
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleEnablePush}
                    disabled={pushStatus === 'enabling'}
                    className="w-full py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    {pushStatus === 'enabling' ? 'Enabling...' : 'Enable Notifications'}
                  </button>
                  <button
                    onClick={() => finishOnboarding()}
                    className="w-full py-2 text-muted text-sm hover:text-foreground transition-colors"
                  >
                    Skip
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
