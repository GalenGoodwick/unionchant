'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useCallback } from 'react'
import Header from '@/components/Header'
import Turnstile from '@/components/Turnstile'

export default function NewDeliberationPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token)
  }, [])

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken(null)
  }, [])

  const [formData, setFormData] = useState({
    question: '',
    description: '',
    organization: '',
    isPublic: true,
    tagsInput: '',
    // Timer settings
    submissionHours: 24,
    votingMinutes: 60,
    accumulationDays: 1,
    // Goal settings
    startMode: 'timer' as 'timer' | 'ideas' | 'manual',
    ideaGoal: 10,
    // Winner mode: 'ends' | 'spawns' | 'rolling'
    winnerMode: 'ends' as 'ends' | 'spawns' | 'rolling',
    // Spawn settings
    spawnedStartMode: 'timer' as 'timer' | 'ideas' | 'manual',
    spawnedSubmissionHours: 24,
    spawnedIdeaGoal: 10,
  })

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    )
  }

  if (!session) {
    router.push('/auth/signin')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Validate required number fields
    if (!formData.votingMinutes || formData.votingMinutes < 5) {
      setError('Voting time must be at least 5 minutes')
      setLoading(false)
      return
    }
    if (formData.startMode === 'timer' && (!formData.submissionHours || formData.submissionHours < 1)) {
      setError('Submission period must be at least 1 hour')
      setLoading(false)
      return
    }
    if (formData.startMode === 'ideas' && (!formData.ideaGoal || formData.ideaGoal < 2)) {
      setError('Idea goal must be at least 2')
      setLoading(false)
      return
    }
    if (formData.winnerMode === 'rolling' && (!formData.accumulationDays || formData.accumulationDays < 1)) {
      setError('Accumulation period must be at least 1 day')
      setLoading(false)
      return
    }
    if (formData.winnerMode === 'spawns') {
      if (formData.spawnedStartMode === 'timer' && (!formData.spawnedSubmissionHours || formData.spawnedSubmissionHours < 1)) {
        setError('Spawned deliberation submission period must be at least 1 hour')
        setLoading(false)
        return
      }
      if (formData.spawnedStartMode === 'ideas' && (!formData.spawnedIdeaGoal || formData.spawnedIdeaGoal < 2)) {
        setError('Spawned deliberation idea goal must be at least 2')
        setLoading(false)
        return
      }
    }

    try {
      const tags = formData.tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      const res = await fetch('/api/deliberations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: formData.question,
          description: formData.description,
          organization: formData.organization || null,
          isPublic: formData.isPublic,
          tags,
          // Timer settings (only for timer mode)
          submissionDurationMs: formData.startMode === 'timer' ? formData.submissionHours * 60 * 60 * 1000 : null,
          votingTimeoutMs: formData.votingMinutes * 60 * 1000,
          accumulationEnabled: formData.winnerMode === 'rolling',
          accumulationTimeoutMs: formData.accumulationDays * 24 * 60 * 60 * 1000,
          // Goal settings
          ideaGoal: formData.startMode === 'ideas' ? formData.ideaGoal : null,
          // Manual trigger mode - no participantGoal needed, creator triggers manually
          participantGoal: null,
          // Spawn settings
          spawnsDeliberation: formData.winnerMode === 'spawns',
          spawnedStartMode: formData.winnerMode === 'spawns' ? formData.spawnedStartMode : null,
          spawnedSubmissionHours: formData.winnerMode === 'spawns' ? formData.spawnedSubmissionHours : null,
          spawnedIdeaGoal: formData.winnerMode === 'spawns' && formData.spawnedStartMode === 'ideas' ? formData.spawnedIdeaGoal : null,
          captchaToken,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create deliberation')
      }

      const deliberation = await res.json()
      router.push(`/deliberations/${deliberation.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link href="/deliberations" className="text-muted hover:text-foreground text-sm mb-4 inline-block">
          &larr; Back to deliberations
        </Link>

        <div className="bg-background rounded-lg border border-border p-6">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-6">Start a New Deliberation</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* BASIC SECTION */}
            <div className="space-y-6">
              <div>
                <label htmlFor="question" className="block text-foreground font-medium mb-2">
                  Question *
                </label>
                <input
                  type="text"
                  id="question"
                  required
                  maxLength={200}
                  placeholder="What should we decide on?"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                />
                <p className="text-muted-light text-xs mt-1 text-right">{formData.question.length}/200</p>
              </div>

              <div>
                <label htmlFor="description" className="block text-foreground font-medium mb-2">
                  Description (optional)
                </label>
                <textarea
                  id="description"
                  rows={3}
                  maxLength={500}
                  placeholder="Provide more context about this deliberation..."
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
                <p className="text-muted-light text-xs mt-1 text-right">{formData.description.length}/500</p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={formData.isPublic}
                  onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                  className="w-4 h-4 rounded border-border-strong bg-background text-accent focus:ring-accent"
                />
                <label htmlFor="isPublic" className="text-muted">
                  Make this deliberation public (anyone can join)
                </label>
              </div>

              {/* Voting Start Mode */}
              <div className="border-t border-border pt-6 mt-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">When to Start Voting</h2>

                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-accent transition-colors">
                    <input
                      type="radio"
                      name="startMode"
                      value="timer"
                      checked={formData.startMode === 'timer'}
                      onChange={() => setFormData({ ...formData, startMode: 'timer' })}
                      className="mt-1 w-4 h-4 text-accent"
                    />
                    <div className="flex-1">
                      <div className="text-foreground font-medium">After a set time</div>
                      <div className="text-muted text-sm">Voting starts after the submission period ends</div>
                      {formData.startMode === 'timer' && (
                        <div className="mt-3">
                          <label className="block text-muted text-sm mb-1">Submission period (hours)</label>
                          <input
                            type="number"
                            min={1}
                            max={168}
                            value={formData.submissionHours || ''}
                            onChange={(e) => setFormData({ ...formData, submissionHours: parseInt(e.target.value) || 0 })}
                            className="w-32 bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent font-mono"
                          />
                        </div>
                      )}
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-accent transition-colors">
                    <input
                      type="radio"
                      name="startMode"
                      value="ideas"
                      checked={formData.startMode === 'ideas'}
                      onChange={() => setFormData({ ...formData, startMode: 'ideas' })}
                      className="mt-1 w-4 h-4 text-accent"
                    />
                    <div className="flex-1">
                      <div className="text-foreground font-medium">After enough ideas</div>
                      <div className="text-muted text-sm">Voting starts automatically when the idea goal is reached</div>
                      {formData.startMode === 'ideas' && (
                        <div className="mt-3">
                          <label className="block text-muted text-sm mb-1">Number of ideas</label>
                          <input
                            type="number"
                            min={2}
                            max={1000}
                            value={formData.ideaGoal || ''}
                            onChange={(e) => setFormData({ ...formData, ideaGoal: parseInt(e.target.value) || 0 })}
                            className="w-32 bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent font-mono"
                          />
                        </div>
                      )}
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:border-accent transition-colors">
                    <input
                      type="radio"
                      name="startMode"
                      value="manual"
                      checked={formData.startMode === 'manual'}
                      onChange={() => setFormData({ ...formData, startMode: 'manual' })}
                      className="mt-1 w-4 h-4 text-accent"
                    />
                    <div className="flex-1">
                      <div className="text-foreground font-medium">When I trigger voting</div>
                      <div className="text-muted text-sm">You control when voting starts - great for live events</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Voting Time Per Tier */}
              <div className="border-t border-border pt-6 mt-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Voting Time Per Tier</h2>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="votingMinutes" className="block text-muted text-sm mb-2">
                      Time limit for each voting tier (minutes)
                    </label>
                    <input
                      type="number"
                      id="votingMinutes"
                      min={5}
                      max={1440}
                      value={formData.votingMinutes || ''}
                      onChange={(e) => setFormData({ ...formData, votingMinutes: parseInt(e.target.value) || 0 })}
                      className="w-32 bg-surface border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-accent font-mono"
                    />
                  </div>
                  <p className="text-muted-light text-sm">
                    Each tier has its own timer. The round ends when all participants vote (immediate) or the timer expires.
                  </p>
                </div>
              </div>

              {/* What Happens When Winner is Chosen */}
              <div className="border-t border-border pt-6 mt-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">When a Winner is Chosen</h2>

                <div className="space-y-3">
                  {/* Option 1: Just ends */}
                  <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    formData.winnerMode === 'ends' ? 'border-accent bg-accent/5' : 'border-border hover:border-accent'
                  }`}>
                    <input
                      type="radio"
                      name="winnerMode"
                      value="ends"
                      checked={formData.winnerMode === 'ends'}
                      onChange={() => setFormData({ ...formData, winnerMode: 'ends' })}
                      className="mt-1 w-4 h-4 text-accent"
                    />
                    <div className="flex-1">
                      <div className="text-foreground font-medium">Just ends</div>
                      <div className="text-muted text-sm">The deliberation completes when a winner is chosen</div>
                    </div>
                  </label>

                  {/* Option 2: Winner becomes a new question */}
                  <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    formData.winnerMode === 'spawns' ? 'border-accent bg-accent/5' : 'border-border hover:border-accent'
                  }`}>
                    <input
                      type="radio"
                      name="winnerMode"
                      value="spawns"
                      checked={formData.winnerMode === 'spawns'}
                      onChange={() => setFormData({ ...formData, winnerMode: 'spawns' })}
                      className="mt-1 w-4 h-4 text-accent"
                    />
                    <div className="flex-1">
                      <div className="text-foreground font-medium">Winner becomes a new question</div>
                      <div className="text-muted text-sm">The winning idea spawns a new deliberation for people to submit ideas to</div>

                      {formData.winnerMode === 'spawns' && (
                        <div className="mt-4 pl-0 border-l-2 border-accent/30 ml-0 space-y-4">
                          <div className="pl-4">
                            <div className="text-foreground text-sm font-medium mb-2">How should the new deliberation start voting?</div>
                            <div className="space-y-2">
                              <label className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="spawnedStartMode"
                                  value="timer"
                                  checked={formData.spawnedStartMode === 'timer'}
                                  onChange={() => setFormData({ ...formData, spawnedStartMode: 'timer' })}
                                  className="w-4 h-4 text-accent"
                                />
                                <span className="text-muted text-sm">After a set time</span>
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="spawnedStartMode"
                                  value="ideas"
                                  checked={formData.spawnedStartMode === 'ideas'}
                                  onChange={() => setFormData({ ...formData, spawnedStartMode: 'ideas' })}
                                  className="w-4 h-4 text-accent"
                                />
                                <span className="text-muted text-sm">After enough ideas</span>
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="spawnedStartMode"
                                  value="manual"
                                  checked={formData.spawnedStartMode === 'manual'}
                                  onChange={() => setFormData({ ...formData, spawnedStartMode: 'manual' })}
                                  className="w-4 h-4 text-accent"
                                />
                                <span className="text-muted text-sm">Manual trigger by winner</span>
                              </label>
                            </div>
                          </div>

                          {formData.spawnedStartMode === 'timer' && (
                            <div className="pl-4">
                              <label className="block text-muted text-sm mb-1">Submission period (hours)</label>
                              <input
                                type="number"
                                min={1}
                                max={168}
                                value={formData.spawnedSubmissionHours || ''}
                                onChange={(e) => setFormData({ ...formData, spawnedSubmissionHours: parseInt(e.target.value) || 0 })}
                                className="w-32 bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent font-mono text-sm"
                              />
                            </div>
                          )}

                          {formData.spawnedStartMode === 'ideas' && (
                            <div className="pl-4">
                              <label className="block text-muted text-sm mb-1">Number of ideas</label>
                              <input
                                type="number"
                                min={2}
                                max={1000}
                                value={formData.spawnedIdeaGoal || ''}
                                onChange={(e) => setFormData({ ...formData, spawnedIdeaGoal: parseInt(e.target.value) || 0 })}
                                className="w-32 bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent font-mono text-sm"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </label>

                  {/* Option 3: Rolling Mode */}
                  <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    formData.winnerMode === 'rolling' ? 'border-purple bg-purple/5' : 'border-border hover:border-purple'
                  }`}>
                    <input
                      type="radio"
                      name="winnerMode"
                      value="rolling"
                      checked={formData.winnerMode === 'rolling'}
                      onChange={() => setFormData({ ...formData, winnerMode: 'rolling' })}
                      className="mt-1 w-4 h-4 text-purple"
                    />
                    <div className="flex-1">
                      <div className="text-foreground font-medium">Rolling Mode (continuous challenges)</div>
                      <div className="text-muted text-sm">Winner becomes champion that challengers can compete against</div>

                      {formData.winnerMode === 'rolling' && (
                        <div className="mt-3">
                          <label className="block text-muted text-sm mb-1">Accumulation period (days)</label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={formData.accumulationDays || ''}
                            onChange={(e) => setFormData({ ...formData, accumulationDays: parseInt(e.target.value) || 0 })}
                            className="w-32 bg-surface border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-purple font-mono"
                          />
                          <p className="text-muted-light text-xs mt-1">
                            Time to collect challengers before each challenge round
                          </p>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* ADVANCED SECTION */}
            <div className="border-t border-border pt-6">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-muted hover:text-foreground transition-colors"
              >
                <span className={`transform transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>
                  ▶
                </span>
                <span className="font-medium">Advanced Settings</span>
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-6 pl-6 border-l-2 border-border">
                  <div>
                    <label htmlFor="organization" className="block text-foreground font-medium mb-2">
                      Organization (optional)
                    </label>
                    <input
                      type="text"
                      id="organization"
                      placeholder="e.g., Minneapolis Teachers Union"
                      className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                      value={formData.organization}
                      onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                    />
                    <p className="text-muted-light text-sm mt-1">Help members find deliberations from their organization</p>
                  </div>

                  <div>
                    <label htmlFor="tags" className="block text-foreground font-medium mb-2">
                      Tags (optional)
                    </label>
                    <input
                      type="text"
                      id="tags"
                      placeholder="climate, policy, local (comma separated, max 5)"
                      className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                      value={formData.tagsInput}
                      onChange={(e) => setFormData({ ...formData, tagsInput: e.target.value })}
                    />
                    <p className="text-muted-light text-sm mt-1">Help others find your deliberation</p>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-error-bg border border-error-border text-error px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <Turnstile
              onVerify={handleCaptchaVerify}
              onExpire={handleCaptchaExpire}
              className="flex justify-center"
            />

            <button
              type="submit"
              disabled={loading || !captchaToken}
              className="w-full bg-accent hover:bg-accent-hover disabled:bg-muted-light disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {loading ? 'Creating...' : 'Create Deliberation'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
