'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useState, useCallback, useEffect, Suspense } from 'react'
import Header from '@/components/Header'
import { FullPageSpinner } from '@/components/Spinner'
import Turnstile from '@/components/Turnstile'

type CommunityOption = { id: string; name: string; slug: string; isPublic: boolean }

export default function NewDeliberationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface"><FullPageSpinner /></div>}>
      <NewDeliberationForm />
    </Suspense>
  )
}

function NewDeliberationForm() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const communitySlug = searchParams.get('community')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [communities, setCommunities] = useState<CommunityOption[]>([])
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null)
  const [communityOnly, setCommunityOnly] = useState(false)
  const [communityLocked, setCommunityLocked] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [podiums, setPodiums] = useState<{ id: string; title: string }[]>([])
  const [selectedPodiumId, setSelectedPodiumId] = useState<string | null>(null)

  const handleCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token)
  }, [])

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken(null)
  }, [])

  const [formData, setFormData] = useState({
    question: '',
    description: '',
    tagsInput: '',
    // Timer settings
    submissionHours: 24,
    votingMinutes: 60,
    accumulationDays: 1,
    accumulationMode: 'manual' as 'timer' | 'manual',
    // Goal settings
    startMode: 'manual' as 'timer' | 'ideas' | 'manual',
    ideaGoal: 10,
    // Winner mode: 'ends' | 'rolling'
    winnerMode: 'ends' as 'ends' | 'rolling',
    // Tier advance mode
    tierAdvanceMode: 'natural' as 'timer' | 'natural',
    // Discussion mode
    discussionMode: 'manual' as 'timer' | 'none' | 'manual',
    discussionMinutes: 120,
    // Continuous flow
    continuousFlow: false,
    // Supermajority auto-advance (no-timer mode)
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

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-surface">
        <FullPageSpinner />
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
    if (formData.tierAdvanceMode === 'timer' && (!formData.votingMinutes || formData.votingMinutes < 5)) {
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
    if (formData.winnerMode === 'rolling' && formData.accumulationMode === 'timer' && (!formData.accumulationDays || formData.accumulationDays < 1)) {
      setError('Accumulation period must be at least 1 day')
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
          submissionDurationMs: formData.startMode === 'timer' ? formData.submissionHours * 60 * 60 * 1000 : null,
          votingTimeoutMs: formData.tierAdvanceMode === 'natural' ? 0 : formData.votingMinutes * 60 * 1000,
          discussionDurationMs: formData.discussionMode === 'timer'
            ? formData.discussionMinutes * 60 * 1000
            : formData.discussionMode === 'manual' ? -1 : null,
          accumulationEnabled: formData.winnerMode === 'rolling',
          accumulationTimeoutMs: formData.winnerMode === 'rolling' && formData.accumulationMode === 'timer'
            ? formData.accumulationDays * 24 * 60 * 60 * 1000
            : null,
          ideaGoal: formData.startMode === 'ideas' ? formData.ideaGoal : null,
          continuousFlow: formData.continuousFlow,
          supermajorityEnabled: formData.tierAdvanceMode === 'natural' ? formData.supermajorityEnabled : false,
          communityId: selectedCommunityId || undefined,
          communityOnly: selectedCommunityId ? communityOnly : undefined,
          captchaToken,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        if (data.error === 'PRO_REQUIRED') {
          throw new Error('Private talks require a Pro subscription. Upgrade at /pricing')
        }
        throw new Error(data.error || 'Failed to create deliberation')
      }

      const deliberation = await res.json()

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

      router.push(`/talks/${deliberation.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  // Summary of current settings for the simple view
  const settingsSummary: string[] = []
  if (formData.startMode === 'manual') settingsSummary.push('You start voting manually')
  else if (formData.startMode === 'timer') settingsSummary.push(`Voting starts after ${formData.submissionHours}h`)
  else if (formData.startMode === 'ideas') settingsSummary.push(`Voting starts at ${formData.ideaGoal} ideas`)

  if (formData.tierAdvanceMode === 'natural') settingsSummary.push('No vote timer')
  else settingsSummary.push(`${formData.votingMinutes}min per round`)

  if (formData.discussionMode === 'manual') settingsSummary.push('You open voting after discussion')
  else if (formData.discussionMode === 'none') settingsSummary.push('No discussion phase')
  else settingsSummary.push(`${formData.discussionMinutes}min discussion`)

  if (formData.winnerMode === 'rolling') settingsSummary.push('Rolling mode')
  else settingsSummary.push('Ends when winner chosen')

  if (formData.continuousFlow) settingsSummary.push('Continuous flow')
  if (formData.tierAdvanceMode === 'natural' && formData.supermajorityEnabled) settingsSummary.push('Supermajority auto-advance')

  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link href="/feed" className="text-muted hover:text-foreground text-sm mb-4 inline-block">
          &larr; Back to feed
        </Link>

        <div className="bg-background rounded-lg border border-border p-6">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-6">Start a New Talk</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Question */}
            <div>
              <label htmlFor="question" className="block text-foreground font-medium mb-2">
                Question *
              </label>
              <input
                type="text"
                id="question"
                required
                maxLength={200}
                placeholder="What should our top priority be this quarter?"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              />
              <p className="text-muted-light text-xs mt-1 text-right">{formData.question.length}/200</p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-foreground font-medium mb-2">
                Description (optional)
              </label>
              <textarea
                id="description"
                rows={3}
                maxLength={500}
                placeholder="Provide more context about this talk..."
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
              <p className="text-muted-light text-xs mt-1 text-right">{formData.description.length}/500</p>
            </div>

            {/* Tags */}
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
              <p className="text-muted-light text-sm mt-1">Help others find your talk</p>
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
                          Talks in private groups are always community only.
                        </p>
                      )}
                      {communityOnly && !isPrivateGroup && (
                        <p className="text-xs text-muted mt-1">
                          Private talks require a <a href="/pricing" className="text-accent hover:text-accent-hover">paid plan</a>.
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
                <p className="text-muted-light text-sm mt-1">Attach a post that explains the context for this talk</p>
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
                <p className="text-sm text-muted mb-4">Most talks work great with the defaults. Only customize if you need specific timing or behavior.</p>

                {/* When to Start Voting */}
                <div>
                  <label className="block text-foreground font-medium text-sm mb-1">
                    When to start voting
                    <span className="ml-2 text-xs text-muted font-normal">(Recommended: When I trigger it)</span>
                  </label>
                  <p className="text-xs text-muted mb-2">Choose when the voting phase begins after idea submission</p>
                  <select
                    value={formData.startMode}
                    onChange={(e) => setFormData({ ...formData, startMode: e.target.value as 'timer' | 'ideas' | 'manual' })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="manual">When I trigger it (recommended)</option>
                    <option value="timer">After a set time</option>
                    <option value="ideas">After enough ideas submitted</option>
                  </select>
                  {formData.startMode === 'timer' && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={168}
                        value={formData.submissionHours || ''}
                        onChange={(e) => setFormData({ ...formData, submissionHours: parseInt(e.target.value) || 0 })}
                        className="w-24 bg-background border border-border rounded px-3 py-1.5 text-foreground font-mono text-sm focus:outline-none focus:border-accent"
                      />
                      <span className="text-muted text-sm">hours for submissions</span>
                    </div>
                  )}
                  {formData.startMode === 'ideas' && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={2}
                        max={1000}
                        value={formData.ideaGoal || ''}
                        onChange={(e) => setFormData({ ...formData, ideaGoal: parseInt(e.target.value) || 0 })}
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
                    <span className="ml-2 text-xs text-muted font-normal">(Recommended: I open voting when ready)</span>
                  </label>
                  <p className="text-xs text-muted mb-2">Give participants time to read and discuss ideas before voting begins</p>
                  <select
                    value={formData.discussionMode}
                    onChange={(e) => setFormData({ ...formData, discussionMode: e.target.value as 'timer' | 'none' | 'manual' })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="manual">I open voting when ready (recommended)</option>
                    <option value="timer">Automatic after set time</option>
                    <option value="none">No discussion — vote immediately</option>
                  </select>
                  {formData.discussionMode === 'timer' && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={5}
                        max={1440}
                        value={formData.discussionMinutes || ''}
                        onChange={(e) => setFormData({ ...formData, discussionMinutes: parseInt(e.target.value) || 0 })}
                        className="w-24 bg-background border border-border rounded px-3 py-1.5 text-foreground font-mono text-sm focus:outline-none focus:border-accent"
                      />
                      <span className="text-muted text-sm">minutes to discuss</span>
                    </div>
                  )}
                </div>

                {/* Tier Advancement */}
                <div>
                  <label className="block text-foreground font-medium text-sm mb-1">
                    Voting rounds
                    <span className="ml-2 text-xs text-muted font-normal">(Recommended: No time limit)</span>
                  </label>
                  <p className="text-xs text-muted mb-2">Set a deadline for each round, or let people vote at their own pace</p>
                  <select
                    value={formData.tierAdvanceMode}
                    onChange={(e) => setFormData({ ...formData, tierAdvanceMode: e.target.value as 'timer' | 'natural' })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="natural">No time limit (recommended)</option>
                    <option value="timer">Set a deadline per round</option>
                  </select>
                  {formData.tierAdvanceMode === 'timer' && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={5}
                        max={1440}
                        value={formData.votingMinutes || ''}
                        onChange={(e) => setFormData({ ...formData, votingMinutes: parseInt(e.target.value) || 0 })}
                        className="w-24 bg-background border border-border rounded px-3 py-1.5 text-foreground font-mono text-sm focus:outline-none focus:border-accent"
                      />
                      <span className="text-muted text-sm">minutes per round</span>
                    </div>
                  )}
                </div>

                {/* Supermajority Auto-Advance (no-timer mode only) */}
                {formData.tierAdvanceMode === 'natural' && (
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
                )}

                {/* Winner Mode */}
                <div>
                  <label className="block text-foreground font-medium text-sm mb-1">
                    After consensus is reached
                    <span className="ml-2 text-xs text-muted font-normal">(Recommended: Talk ends)</span>
                  </label>
                  <p className="text-xs text-muted mb-2">Decide what happens when a priority idea is chosen</p>
                  <select
                    value={formData.winnerMode}
                    onChange={(e) => setFormData({ ...formData, winnerMode: e.target.value as 'ends' | 'rolling' })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="ends">Talk ends (recommended)</option>
                    <option value="rolling">Keep open — allow new ideas to challenge the winner</option>
                  </select>
                  {formData.winnerMode === 'rolling' && (
                    <div className="mt-2">
                      <label className="block text-muted text-xs mb-1">Challenge rounds start</label>
                      <select
                        value={formData.accumulationMode}
                        onChange={(e) => setFormData({ ...formData, accumulationMode: e.target.value as 'timer' | 'manual' })}
                        className="w-full bg-background border border-border rounded px-3 py-1.5 text-foreground text-sm focus:outline-none focus:border-accent"
                      >
                        <option value="manual">When I trigger it</option>
                        <option value="timer">After a set period</option>
                      </select>
                      {formData.accumulationMode === 'timer' && (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={formData.accumulationDays || ''}
                            onChange={(e) => setFormData({ ...formData, accumulationDays: parseInt(e.target.value) || 0 })}
                            className="w-20 bg-background border border-border rounded px-3 py-1.5 text-foreground font-mono text-sm focus:outline-none focus:border-accent"
                          />
                          <span className="text-muted text-sm">days to collect challengers</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Continuous Flow */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.continuousFlow}
                      onChange={(e) => setFormData({ ...formData, continuousFlow: e.target.checked })}
                      className="rounded border-border text-accent focus:ring-accent"
                    />
                    <span className="text-foreground font-medium text-sm">Continuous flow</span>
                  </label>
                  <p className="text-muted text-xs mt-1 ml-6">Ideas can be submitted during Tier 1 voting. New ideas create additional cells. After Tier 1, new ideas pool for the next round.</p>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-error-bg border border-error-border text-error px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {!captchaToken && (
              <Turnstile
                onVerify={handleCaptchaVerify}
                onExpire={handleCaptchaExpire}
                className="flex justify-center"
              />
            )}

            <button
              type="submit"
              disabled={loading || !captchaToken}
              className="w-full bg-accent hover:bg-accent-hover disabled:bg-muted-light disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {loading ? 'Creating...' : 'Create Talk'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
