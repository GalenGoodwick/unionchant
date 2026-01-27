'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import Header from '@/components/Header'

export default function NewDeliberationPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    question: '',
    description: '',
    isPublic: true,
    tagsInput: '',
    // Timer settings
    submissionHours: 24,
    votingMinutes: 60,
    accumulationEnabled: true,
    accumulationDays: 1,
    // Goal settings
    startMode: 'timer' as 'timer' | 'ideas' | 'participants',
    ideaGoal: 10,
    participantGoal: 10,
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
          isPublic: formData.isPublic,
          tags,
          // Timer settings (only for timer mode)
          submissionDurationMs: formData.startMode === 'timer' ? formData.submissionHours * 60 * 60 * 1000 : null,
          votingTimeoutMs: formData.votingMinutes * 60 * 1000,
          accumulationEnabled: formData.accumulationEnabled,
          accumulationTimeoutMs: formData.accumulationDays * 24 * 60 * 60 * 1000,
          // Goal settings
          ideaGoal: formData.startMode === 'ideas' ? formData.ideaGoal : null,
          participantGoal: formData.startMode === 'participants' ? formData.participantGoal : null,
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
            <div>
              <label htmlFor="question" className="block text-foreground font-medium mb-2">
                Question *
              </label>
              <input
                type="text"
                id="question"
                required
                placeholder="What should we decide on?"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-foreground font-medium mb-2">
                Description (optional)
              </label>
              <textarea
                id="description"
                rows={4}
                placeholder="Provide more context about this deliberation..."
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
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
                          value={formData.submissionHours}
                          onChange={(e) => setFormData({ ...formData, submissionHours: parseInt(e.target.value) || 24 })}
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
                          value={formData.ideaGoal}
                          onChange={(e) => setFormData({ ...formData, ideaGoal: parseInt(e.target.value) || 10 })}
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
                    value="participants"
                    checked={formData.startMode === 'participants'}
                    onChange={() => setFormData({ ...formData, startMode: 'participants' })}
                    className="mt-1 w-4 h-4 text-accent"
                  />
                  <div className="flex-1">
                    <div className="text-foreground font-medium">After enough participants</div>
                    <div className="text-muted text-sm">Voting starts automatically when the participant goal is reached</div>
                    {formData.startMode === 'participants' && (
                      <div className="mt-3">
                        <label className="block text-muted text-sm mb-1">Number of participants</label>
                        <input
                          type="number"
                          min={2}
                          max={10000}
                          value={formData.participantGoal}
                          onChange={(e) => setFormData({ ...formData, participantGoal: parseInt(e.target.value) || 10 })}
                          className="w-32 bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent font-mono"
                        />
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* Voting Settings */}
            <div className="border-t border-border pt-6 mt-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Voting Settings</h2>

              <div>
                <label htmlFor="votingMinutes" className="block text-muted text-sm mb-2">
                  Voting Timeout per Cell (minutes)
                </label>
                <input
                  type="number"
                  id="votingMinutes"
                  min={5}
                  max={1440}
                  value={formData.votingMinutes}
                  onChange={(e) => setFormData({ ...formData, votingMinutes: parseInt(e.target.value) || 60 })}
                  className="w-32 bg-surface border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-accent font-mono"
                />
                <p className="text-muted-light text-xs mt-1">Time limit for each cell to complete voting</p>
              </div>
            </div>

            {/* Rolling Mode Settings */}
            <div className="border-t border-border pt-6 mt-2">
              <div className="flex items-center gap-3 mb-4">
                <input
                  type="checkbox"
                  id="accumulationEnabled"
                  checked={formData.accumulationEnabled}
                  onChange={(e) => setFormData({ ...formData, accumulationEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-border-strong bg-background text-purple focus:ring-purple"
                />
                <label htmlFor="accumulationEnabled" className="text-muted">
                  Enable Rolling Mode (continuous challenge rounds)
                </label>
              </div>

              {formData.accumulationEnabled && (
                <div className="ml-7">
                  <label htmlFor="accumulationDays" className="block text-muted text-sm mb-2">
                    Accumulation Period (days)
                  </label>
                  <input
                    type="number"
                    id="accumulationDays"
                    min={1}
                    max={30}
                    value={formData.accumulationDays}
                    onChange={(e) => setFormData({ ...formData, accumulationDays: parseInt(e.target.value) || 1 })}
                    className="w-32 bg-surface border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-purple font-mono"
                  />
                  <p className="text-muted-light text-xs mt-1">
                    Time to collect challengers before each challenge round
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-error-bg border border-error-border text-error px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
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
