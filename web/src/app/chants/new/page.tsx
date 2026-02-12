'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { FullPageSpinner } from '@/components/Spinner'
import { usePasskeyPrompt } from '@/app/providers'
import FrameLayout from '@/components/FrameLayout'


type CommunityOption = { id: string; name: string; slug: string; isPublic: boolean }

export default function NewDeliberationPage() {
  return (
    <Suspense fallback={<FrameLayout active="chants" showBack><FullPageSpinner /></FrameLayout>}>
      <NewDeliberationForm />
    </Suspense>
  )
}

function NewDeliberationForm() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { triggerPasskeyPrompt } = usePasskeyPrompt()
  const communitySlug = searchParams.get('community')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [communities, setCommunities] = useState<CommunityOption[]>([])
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null)
  const [communityOnly, setCommunityOnly] = useState(false)
  const [communityLocked, setCommunityLocked] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [podiums, setPodiums] = useState<{ id: string; title: string }[]>([])
  const [selectedPodiumId, setSelectedPodiumId] = useState<string | null>(null)
  const [generatingIdeas, setGeneratingIdeas] = useState(false)

  const [formData, setFormData] = useState({
    question: '',
    description: '',
    tagsInput: '',
    // Goal settings
    startMode: 'manual' as 'ideas' | 'manual',
    ideaGoal: 10,
    // Winner mode: 'ends' | 'rolling'
    winnerMode: 'ends' as 'ends' | 'rolling',
    // Discussion mode
    discussionMode: 'manual' as 'none' | 'manual',
    // Continuous flow
    continuousFlow: false,
    // Allow AI agents
    allowAI: true,
    // Seed ideas (for continuous flow)
    seedIdeas: Array(10).fill('') as string[],
    // Supermajority auto-advance
    supermajorityEnabled: true,
  })

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/communities/mine')
        .then(res => res.json())
        .then((data: CommunityOption[]) => {
          if (Array.isArray(data)) {
            setCommunities(data)
            if (communitySlug) {
              const match = data.find((c: CommunityOption) => c.slug === communitySlug)
              if (match) {
                setSelectedCommunityId(match.id)
                if (!match.isPublic) {
                  setCommunityOnly(true)
                  setCommunityLocked(true)
                }
              }
            }
          }
        })
        .catch(() => {})
      // Fetch user's own unlinked podiums
      fetch(`/api/podiums?authorId=${session?.user?.id || ''}&limit=50`)
        .then(res => res.ok ? res.json() : { items: [] })
        .then(data => {
          const unlinked = (data.items || []).filter((p: any) => !p.deliberationId && !p.deliberation)
          setPodiums(unlinked.map((p: any) => ({ id: p.id, title: p.title })))
        })
        .catch(() => {})
    }
  }, [status, communitySlug, session?.user?.id])

  const generateSeedIdeas = useCallback(async (useChat = false) => {
    if (generatingIdeas) return
    if (!formData.question.trim()) {
      setError('Enter a question first so AI knows what to generate')
      return
    }
    setGeneratingIdeas(true)
    setError('')
    try {
      const res = await fetch('/api/deliberations/generate-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: formData.question,
          description: formData.description,
          count: formData.ideaGoal || 10,
          useChat,
        }),
      })
      if (!res.ok) throw new Error('Failed to generate ideas')
      const { ideas } = await res.json()
      const updated = Array(formData.ideaGoal || 10).fill('')
      ideas.forEach((idea: string, i: number) => {
        if (i < updated.length) updated[i] = idea
      })
      setFormData(prev => ({ ...prev, seedIdeas: updated }))
    } catch {
      setError('AI generation failed. Fill ideas manually or try again.')
    } finally {
      setGeneratingIdeas(false)
    }
  }, [formData.question, formData.description, formData.ideaGoal])

  if (status === 'loading') {
    return (
      <FrameLayout active="chants" showBack>
        <FullPageSpinner />
      </FrameLayout>
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
    if (formData.startMode === 'ideas' && (!formData.ideaGoal || formData.ideaGoal < 2)) {
      setError('Idea goal must be at least 2')
      setLoading(false)
      return
    }
    // Validate seed ideas
    const seedIdeas = (formData.continuousFlow || formData.startMode === 'ideas')
      ? formData.seedIdeas.map(s => s.trim()).filter(s => s.length > 0)
      : []
    if (formData.continuousFlow && seedIdeas.length < (formData.ideaGoal || 10)) {
      setError(`Continuous flow needs at least ${formData.ideaGoal || 10} seed ideas to start voting immediately`)
      setLoading(false)
      return
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
          isPublic: true,
          tags,
          submissionDurationMs: null,
          votingTimeoutMs: 0,
          discussionDurationMs: formData.discussionMode === 'manual' ? -1 : null,
          accumulationEnabled: formData.winnerMode === 'rolling',
          accumulationTimeoutMs: null,
          ideaGoal: formData.startMode === 'ideas' ? formData.ideaGoal : null,
          continuousFlow: formData.continuousFlow,
          allowAI: formData.allowAI,
          supermajorityEnabled: formData.supermajorityEnabled,
          communityId: selectedCommunityId || undefined,
          communityOnly: selectedCommunityId ? communityOnly : undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        if (data.error === 'PRO_REQUIRED') {
          throw new Error('Private chants require a Pro subscription. Upgrade at /pricing')
        }
        throw new Error(data.error || 'Failed to create deliberation')
      }

      const deliberation = await res.json()

      // Submit seed ideas (for continuous flow)
      if (seedIdeas.length > 0) {
        await Promise.all(seedIdeas.map(text =>
          fetch(`/api/deliberations/${deliberation.id}/ideas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          })
        ))
      }

      // Link podium if selected
      if (selectedPodiumId) {
        const linkRes = await fetch(`/api/podiums/${selectedPodiumId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deliberationId: deliberation.id }),
        })
        if (!linkRes.ok) {
          console.error('Failed to link podium:', await linkRes.text())
        }
      }

      // Trigger passkey prompt for anonymous users (cancel → /chants, register → stays on chant)
      triggerPasskeyPrompt('created a chant', () => router.push('/chants'))
      router.push(`/chants/${deliberation.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  // Summary of current settings for the simple view
  const settingsSummary: string[] = []
  if (formData.startMode === 'manual') settingsSummary.push('Facilitator starts voting')
  else if (formData.startMode === 'ideas') settingsSummary.push(`Voting starts at ${formData.ideaGoal} ideas`)

  if (formData.discussionMode === 'manual') settingsSummary.push('Facilitator opens voting after discussion')
  else if (formData.discussionMode === 'none') settingsSummary.push('No discussion phase')

  if (formData.winnerMode === 'rolling') settingsSummary.push('Rolling mode')
  else settingsSummary.push('Ends when winner chosen')

  if (formData.continuousFlow) settingsSummary.push('Continuous flow')
  if (formData.supermajorityEnabled) settingsSummary.push('Supermajority auto-advance')

  return (
    <FrameLayout active="chants" showBack>
      <div className="py-4">
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-4">
          <h1 className="text-sm font-bold text-foreground mb-4">Start a New Chant</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Question */}
            <div>
              <label htmlFor="question" className="block text-xs text-foreground font-medium mb-1">
                Question *
              </label>
              <input
                type="text"
                id="question"
                required
                maxLength={200}
                placeholder="What should our top priority be this quarter?"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              />
              <p className="text-muted-light text-xs mt-1 text-right">{formData.question.length}/200</p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-xs text-foreground font-medium mb-1">
                Description (optional)
              </label>
              <textarea
                id="description"
                rows={3}
                maxLength={500}
                placeholder="Provide more context about this chant..."
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
              <p className="text-muted-light text-xs mt-1 text-right">{formData.description.length}/500</p>
            </div>

            {/* Tags */}
            <div>
              <label htmlFor="tags" className="block text-xs text-foreground font-medium mb-1">
                Tags (optional)
              </label>
              <input
                type="text"
                id="tags"
                placeholder="climate, policy, local (comma separated, max 5)"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                value={formData.tagsInput}
                onChange={(e) => setFormData({ ...formData, tagsInput: e.target.value })}
              />
              <p className="text-muted-light text-xs mt-1">Help others find your chant</p>
            </div>

            {/* Community Selector */}
            {communities.length > 0 && (
              <div>
                <label className="block text-foreground font-medium mb-2">
                  Group {communityLocked ? '' : '(optional)'}
                </label>
                <select
                  value={selectedCommunityId || ''}
                  disabled={communityLocked}
                  onChange={e => {
                    const id = e.target.value || null
                    setSelectedCommunityId(id)
                    if (!id) {
                      setCommunityOnly(false)
                    } else {
                      const selected = communities.find(c => c.id === id)
                      if (selected && !selected.isPublic) setCommunityOnly(true)
                    }
                  }}
                  className={`w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:border-accent ${communityLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <option value="">No community</option>
                  {communities.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {selectedCommunityId && (() => {
                  const selectedComm = communities.find(c => c.id === selectedCommunityId)
                  const isPrivateGroup = selectedComm && !selectedComm.isPublic
                  return (
                    <>
                      <label className={`flex items-center gap-2 mt-3 ${isPrivateGroup ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={communityOnly}
                          disabled={!!isPrivateGroup}
                          onChange={e => setCommunityOnly(e.target.checked)}
                          className="w-4 h-4 text-accent"
                        />
                        <span className="text-foreground text-sm">Community only (not visible in public feed)</span>
                      </label>
                      {isPrivateGroup && (
                        <p className="text-xs text-muted mt-1">
                          Chants in private groups are always community only.
                        </p>
                      )}
                      {communityOnly && !isPrivateGroup && (
                        <p className="text-xs text-muted mt-1">
                          Private chants require a <a href="/pricing" className="text-accent hover:text-accent-hover">paid plan</a>.
                        </p>
                      )}
                    </>
                  )
                })()}
              </div>
            )}

            {/* Link Podium */}
            {podiums.length > 0 && (
              <div>
                <label className="block text-foreground font-medium mb-2">Link a Podium post (optional)</label>
                <select
                  value={selectedPodiumId || ''}
                  onChange={e => setSelectedPodiumId(e.target.value || null)}
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:border-accent"
                >
                  <option value="">None</option>
                  {podiums.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
                <p className="text-muted-light text-sm mt-1">Attach a post that explains the context for this chant</p>
              </div>
            )}

            {/* Default settings summary */}
            <div className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-foreground">Settings</h2>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-accent text-sm hover:underline"
                >
                  {showAdvanced ? 'Hide options' : 'Customize'}
                </button>
              </div>
              {!showAdvanced && (
                <div className="flex flex-wrap gap-2">
                  {settingsSummary.map((s, i) => (
                    <span key={i} className="text-xs bg-background text-muted px-2 py-1 rounded border border-border">{s}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Advanced Settings (collapsible) */}
            {showAdvanced && (
              <div className="space-y-5 border border-border rounded-lg p-4 bg-surface">
                <p className="text-sm text-muted mb-4">All chants are facilitator-controlled. Customize behavior below.</p>

                {/* When to Start Voting */}
                <div>
                  <label className="block text-foreground font-medium text-sm mb-1">
                    When to start voting
                  </label>
                  <p className="text-xs text-muted mb-2">Choose when the voting phase begins after idea submission</p>
                  <select
                    value={formData.startMode}
                    onChange={(e) => setFormData({ ...formData, startMode: e.target.value as 'ideas' | 'manual' })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="manual">Facilitator triggers it (recommended)</option>
                    <option value="ideas">After enough ideas submitted</option>
                  </select>
                  {formData.startMode === 'ideas' && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={2}
                        max={1000}
                        value={formData.ideaGoal || ''}
                        onChange={(e) => {
                          const newGoal = parseInt(e.target.value) || 0
                          const newSeedIdeas = Array(newGoal).fill('').map((_, i) => formData.seedIdeas[i] || '')
                          setFormData({ ...formData, ideaGoal: newGoal, seedIdeas: newSeedIdeas })
                        }}
                        className="w-24 bg-background border border-border rounded px-3 py-1.5 text-foreground font-mono text-sm focus:outline-none focus:border-accent"
                      />
                      <span className="text-muted text-sm">ideas to start</span>
                    </div>
                  )}
                </div>

                {/* Discussion Mode */}
                <div>
                  <label className="block text-foreground font-medium text-sm mb-1">
                    Discussion before voting
                  </label>
                  <p className="text-xs text-muted mb-2">Give participants time to read and discuss ideas before voting begins</p>
                  <select
                    value={formData.discussionMode}
                    onChange={(e) => setFormData({ ...formData, discussionMode: e.target.value as 'none' | 'manual' })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="manual">Facilitator opens voting when ready (recommended)</option>
                    <option value="none">No discussion — vote immediately</option>
                  </select>
                </div>

                {/* Supermajority Auto-Advance */}
                <div className="flex items-start gap-3 p-3 rounded-lg bg-background border border-border">
                  <input
                    type="checkbox"
                    id="supermajority"
                    checked={formData.supermajorityEnabled}
                    onChange={(e) => setFormData({ ...formData, supermajorityEnabled: e.target.checked })}
                    className="mt-0.5 accent-accent"
                  />
                  <label htmlFor="supermajority" className="text-sm cursor-pointer">
                    <span className="text-foreground font-medium">Supermajority auto-advance</span>
                    <p className="text-xs text-muted mt-0.5">
                      When 80%+ of cells finish voting, the remaining cells are auto-completed after a 10-minute grace period. Prevents one stalled cell from blocking the entire round.
                    </p>
                  </label>
                </div>

                {/* Winner Mode */}
                <div>
                  <label className="block text-foreground font-medium text-sm mb-1">
                    After consensus is reached
                  </label>
                  <p className="text-xs text-muted mb-2">Decide what happens when a priority idea is chosen</p>
                  <select
                    value={formData.winnerMode}
                    onChange={(e) => setFormData({ ...formData, winnerMode: e.target.value as 'ends' | 'rolling' })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="ends">Chant ends (recommended)</option>
                    <option value="rolling">Keep open — allow new ideas to challenge the winner</option>
                  </select>
                  {formData.winnerMode === 'rolling' && (
                    <p className="text-xs text-muted mt-2">Facilitator triggers challenge rounds manually.</p>
                  )}
                </div>

                {/* Allow AI Agents */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.allowAI}
                      onChange={(e) => setFormData({ ...formData, allowAI: e.target.checked })}
                      className="rounded border-border text-accent focus:ring-accent"
                    />
                    <span className="text-foreground font-medium text-sm">Allow AI agents</span>
                  </label>
                  <p className="text-muted text-xs mt-1 ml-6">{formData.allowAI ? 'AI agents can join and vote via the API.' : 'Humans only — AI agents will be blocked from joining.'}</p>
                </div>
              </div>
            )}

            {/* Continuous Flow (top-level, always visible) */}
            <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.continuousFlow}
                  onChange={(e) => setFormData({
                    ...formData,
                    continuousFlow: e.target.checked,
                    ...(e.target.checked ? { startMode: 'ideas' as const } : {}),
                  })}
                  className="rounded border-border text-accent focus:ring-accent"
                />
                <span className="text-foreground font-medium text-sm">Continuous flow</span>
              </label>
              <p className="text-muted text-xs ml-6 -mt-2">Voting starts immediately with seed ideas. New ideas create additional cells as they arrive.</p>

              {(formData.continuousFlow || formData.startMode === 'ideas') && (
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div>
                    <h4 className="text-foreground font-medium text-sm">Seed Ideas</h4>
                    <p className="text-muted text-xs mt-1">{formData.continuousFlow ? `Need ${formData.ideaGoal || 10} ideas to start voting.` : 'Pre-fill ideas so participants can start voting sooner.'}</p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => generateSeedIdeas(false)}
                      disabled={generatingIdeas}
                      className="flex-1 bg-purple hover:bg-purple-hover disabled:opacity-50 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
                    >
                      {generatingIdeas ? 'Generating...' : 'AI Fill'}
                    </button>
                  </div>

                  {formData.seedIdeas.map((idea, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-muted text-xs font-mono mt-2.5 w-5 text-right shrink-0">{i + 1}.</span>
                      <input
                        type="text"
                        maxLength={300}
                        placeholder={`Idea ${i + 1}`}
                        value={idea}
                        onChange={(e) => {
                          const updated = [...formData.seedIdeas]
                          updated[i] = e.target.value
                          setFormData({ ...formData, seedIdeas: updated })
                        }}
                        className="flex-1 bg-surface border border-border rounded px-3 py-2 text-foreground text-sm placeholder-muted-light focus:outline-none focus:border-accent"
                      />
                    </div>
                  ))}
                  <p className="text-muted text-xs">{formData.seedIdeas.filter(s => s.trim()).length}/{formData.ideaGoal || 10} filled</p>
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
              className="w-full bg-accent hover:bg-accent-hover disabled:bg-muted-light disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-xs"
            >
              {loading ? 'Creating...' : 'Create Chant'}
            </button>
          </form>
        </div>
      </div>
    </FrameLayout>
  )
}
