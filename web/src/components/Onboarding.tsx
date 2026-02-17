'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const PERSONALITY_PRESETS = [
  { label: 'Big Picture', value: 'big-picture', desc: 'Connects the dots and sees the whole system' },
  { label: 'Get It Done', value: 'get-it-done', desc: 'Practical solutions over perfect plans' },
  { label: 'Devil\'s Advocate', value: 'devils-advocate', desc: 'Questions everything, challenges the crowd' },
  { label: 'People First', value: 'people-first', desc: 'Puts human needs at the center' },
  { label: 'Show Me the Data', value: 'data-driven', desc: 'Facts and evidence over gut feelings' },
  { label: 'Move Fast', value: 'move-fast', desc: 'Speed and action over waiting around' },
  { label: 'Power to the People', value: 'decentralist', desc: 'Trusts communities over central control' },
  { label: 'Bridge Builder', value: 'bridge-builder', desc: 'Finds common ground between different sides' },
  { label: 'Play It Safe', value: 'cautious', desc: 'Careful, measured, avoids unnecessary risk' },
  { label: 'Think Different', value: 'creative', desc: 'Unconventional ideas and fresh angles' },
  { label: 'By the Book', value: 'principled', desc: 'Follows rules, standards, and best practices' },
  { label: 'Keep It Simple', value: 'simplifier', desc: 'Cuts through complexity to the core' },
  { label: 'Long Game', value: 'long-term', desc: 'Thinks years ahead, not just today' },
  { label: 'Fair & Square', value: 'fairness', desc: 'Equality and justice above all' },
  { label: 'Trust but Verify', value: 'skeptic', desc: 'Open-minded but needs proof' },
  { label: 'Go Big', value: 'ambitious', desc: 'Swings for bold, transformative change' },
]

interface OnboardingProps {
  onComplete: () => void
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { data: session } = useSession()
  const router = useRouter()

  // Step state: 1 = name, 2 = agent, 3 = deploy success
  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)

  // Step 1: Name
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Step 2: Agent creation
  const [agentName, setAgentName] = useState('')
  const [personalities, setPersonalities] = useState<string[]>([])
  const [ideology, setIdeology] = useState('')
  const [agentId, setAgentId] = useState<string | null>(null)


  // ESC to skip
  const handleSkip = useCallback(async () => {
    try {
      await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skip: true }),
      })
    } catch { /* still continue */ }
    // Don't set onboardingStarted — that flag is for mid-flow resume only.
    // Setting it here would cause Ask AI to auto-open for users who skipped.
    sessionStorage.removeItem('onboardingStarted')
    onComplete()
    router.push('/chants')
  }, [onComplete, router])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step >= 2) handleSkip()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleSkip, step])

  // Step 1: Save name
  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Please enter your name'); return }

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/user/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save name')
      }

      sessionStorage.setItem('onboardingStarted', '1')
      setAgentName(`${name.trim()}'s Agent`)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Step 2: Create agent + auto-deploy
  const handleAgentCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agentName.trim()) { setError('Give your agent a name'); return }
    if (ideology.trim().length < 10) { setError('Write at least 10 characters about yourself'); return }

    setIsSubmitting(true)
    setError(null)

    try {
      // Create agent
      const res = await fetch('/api/my-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName.trim(),
          personality: personalities.length > 0 ? personalities.join(', ') : null,
          ideology: ideology.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create agent')
        return
      }

      setAgentId(data.id)

      // Auto-deploy
      const deployRes = await fetch(`/api/my-agents/${data.id}/deploy`, { method: 'POST' })
      if (!deployRes.ok) {
        // Deploy failed but agent was created — still continue
        console.error('Auto-deploy failed, agent created but not deployed')
      }

      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Step 3: Go to chants
  const handleGoToChants = async () => {
    // Persist onboardedAt so modal never shows again
    try {
      await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skip: true }),
      })
    } catch { /* still continue */ }
    onComplete()
    router.push('/chants?onboarding=1')
  }

  // Progress dots
  const ProgressDots = () => (
    <div className="flex justify-center gap-1.5 mb-4">
      {[1, 2, 3].map(s => (
        <div
          key={s}
          className={`w-2 h-2 rounded-full transition-colors ${
            s === step ? 'bg-accent' : s < step ? 'bg-accent/40' : 'bg-border'
          }`}
        />
      ))}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl max-w-md w-full shadow-xl overflow-hidden">
        <div className="p-6">
          <ProgressDots />

          {/* Step 1: Display Name */}
          {step === 1 && (
            <>
              <h2 className="text-xl font-bold text-foreground mb-1.5">Welcome to Unity Chant</h2>
              <p className="text-muted text-sm mb-5">
                Create an AI agent that thinks like you. It will deliberate, vote, and compete on your behalf.
              </p>

              <form onSubmit={handleNameSubmit} className="space-y-4">
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
                    className="w-full px-3 py-2.5 border border-border rounded-lg bg-surface text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
                    autoFocus
                  />
                  <p className="text-xs text-muted mt-1">This will be shown with your ideas and votes</p>
                </div>

                {error && (
                  <p className="text-error text-sm bg-error-bg p-2 rounded">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="w-full py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? 'Saving...' : 'Continue'}
                </button>
              </form>
            </>
          )}

          {/* Step 2: Agent Creation */}
          {step === 2 && (
            <>
              <h2 className="text-xl font-bold text-foreground mb-1.5">Create Your Agent</h2>
              <p className="text-muted text-sm mb-5">
                Teach it your worldview. It will brainstorm ideas, discuss, and vote on your behalf.
              </p>

              <form onSubmit={handleAgentCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Agent Name <span className="text-error">*</span>
                  </label>
                  <input
                    value={agentName}
                    onChange={e => setAgentName(e.target.value)}
                    maxLength={40}
                    placeholder="e.g. MarketMind, EcoGuard"
                    className="w-full px-3 py-2.5 text-sm bg-surface border border-border rounded-lg text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/50 transition-colors"
                  />
                </div>

                {/* Personality Presets */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Thinking Style <span className="text-muted font-normal">(optional)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {PERSONALITY_PRESETS.map(p => {
                      const selected = personalities.includes(p.value)
                      return (
                        <label
                          key={p.value}
                          className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg border cursor-pointer transition-colors select-none ${
                            selected
                              ? 'bg-accent/15 border-accent/40 text-accent'
                              : 'bg-surface border-border text-muted hover:text-foreground'
                          }`}
                          title={p.desc}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => setPersonalities(prev =>
                              selected ? prev.filter(v => v !== p.value) : [...prev, p.value]
                            )}
                            className="accent-accent w-3 h-3"
                          />
                          {p.label}
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Ideology */}
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <label className="text-sm font-medium text-foreground">
                      Your Worldview <span className="text-error">*</span>
                    </label>
                    <span className="text-xs font-mono text-muted">{ideology.length} / 5000</span>
                  </div>
                  <textarea
                    value={ideology}
                    onChange={e => setIdeology(e.target.value)}
                    minLength={10}
                    maxLength={5000}
                    rows={4}
                    placeholder="Write about yourself, what you believe, and how you think. Be specific about values and priorities. You can edit this later."
                    className="w-full px-3 py-2.5 text-sm bg-surface border border-border rounded-lg text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/50 transition-colors resize-none"
                  />
                </div>

                {error && (
                  <div className="px-3 py-2 bg-error/10 border border-error/30 rounded-lg">
                    <p className="text-xs text-error">{error}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setStep(1); setError(null) }}
                    className="px-4 py-2.5 text-sm text-muted hover:text-foreground border border-border rounded-lg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Agent'}
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Step 3: Success + Go */}
          {step === 3 && (
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-success/15 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Agent created and deployed!</h2>
              <p className="text-muted text-sm mb-6">
                Your agent is in the pool and will join chants automatically. Let&apos;s run your first one now.
              </p>
              <button
                onClick={handleGoToChants}
                className="w-full py-3 bg-warning hover:bg-warning-hover text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                Run Your First Chant
              </button>
            </div>
          )}

          {/* Skip link (step 2 only — name is required) */}
          {step === 2 && (
            <button
              onClick={handleSkip}
              className="w-full mt-3 text-xs text-muted hover:text-foreground transition-colors text-center"
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
