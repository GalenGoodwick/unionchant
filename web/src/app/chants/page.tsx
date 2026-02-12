/**
 * Originally developed as part of the Common Ground plugin for Unity Chant.
 * Thank you to Common Ground (https://common.ground) for being open source
 * and inspiring the embeddable widget architecture.
 *
 * Adapted for the Unity Chant web application.
 * Original source: https://github.com/GalenGoodwick/unity-chant-cg-plugin
 */
'use client'

import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

type Chant = {
  id: string
  question: string
  description: string | null
  phase: string
  isPublic: boolean
  isPinned: boolean
  upvoteCount: number
  userHasUpvoted: boolean
  continuousFlow: boolean
  createdAt: string
  creator: { name: string | null }
  champion?: { text: string } | null
  _count: { members: number; ideas: number }
}

const PAGE_SIZE = 15

export default function ChantsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [chants, setChants] = useState<Chant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'SUBMISSION' | 'VOTING' | 'COMPLETED' | 'ACCUMULATING'>('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Inline create form state
  const [showCreate, setShowCreate] = useState(false)
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [showSettings, setShowSettings] = useState(true)
  const [mode, setMode] = useState<'fcfs' | 'event'>('fcfs')
  const [continuous, setContinuous] = useState(true)
  const [multipleIdeas, setMultipleIdeas] = useState(false)
  const [ideaGoal, setIdeaGoal] = useState(5)
  const [memberGoal, setMemberGoal] = useState(10)
  const [ideas, setIdeas] = useState<string[]>(['', '', '', '', ''])
  const [allowAI, setAllowAI] = useState(true)
  const [tags, setTags] = useState('')
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([])
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null)
  const [ideaStatus, setIdeaStatus] = useState<Record<number, { ok: boolean; msg: string }>>({})
  const [createProgress, setCreateProgress] = useState('')

  const updateIdeaGoal = (goal: number) => {
    setIdeaGoal(goal)
    const count = goal === 0 ? 5 : goal
    setIdeas(prev => {
      if (prev.length === count) return prev
      if (prev.length < count) return [...prev, ...Array(count - prev.length).fill('')]
      return prev.slice(0, count)
    })
  }

  const resetCreateForm = () => {
    setQuestion('')
    setDescription('')
    setCreateError('')
    setCreateProgress('')
    setIdeaStatus({})
    setIdeas(['', '', '', '', ''])
    setMode('fcfs')
    setContinuous(true)
    setMultipleIdeas(false)
    setAllowAI(true)
    setTags('')
    setSelectedCommunityId(null)
    setIdeaGoal(5)
    setMemberGoal(10)
  }

  const fetchChants = useCallback(async () => {
    try {
      const res = await fetch('/api/deliberations')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) setChants(data)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchChants()
    const interval = setInterval(fetchChants, 15000)
    return () => clearInterval(interval)
  }, [fetchChants])

  // Fetch user's communities for create form
  useEffect(() => {
    if (!session) return
    fetch('/api/communities/mine')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setCommunities(data) })
      .catch(() => {})
  }, [session])

  const handleSearch = (value: string) => {
    setSearch(value)
    setVisibleCount(PAGE_SIZE)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  const handleUpvote = async (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const res = await fetch(`/api/deliberations/${id}/upvote`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setChants(prev => prev.map(c =>
          c.id === id ? { ...c, userHasUpvoted: data.upvoted, upvoteCount: c.upvoteCount + (data.upvoted ? 1 : -1) } : c
        ))
      }
    } catch { /* ignore */ }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim() || question.trim().length < 2) {
      setCreateError('Question must be at least 2 characters')
      return
    }

    setCreating(true)
    setCreateError('')

    try {
      setCreateProgress('Creating chant...')
      const res = await fetch('/api/deliberations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          description: description.trim() || undefined,
          isPublic: true,
          allocationMode: mode === 'event' ? 'balanced' : mode,
          continuousFlow: continuous,
          multipleIdeasAllowed: multipleIdeas,
          allowAI,
          ideaGoal: continuous ? ideaGoal : null,
          memberGoal: mode === 'event' ? memberGoal : null,
          votingTimeoutMs: 0,
          tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
          communityId: selectedCommunityId || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Failed to create (${res.status})`)
      }

      // Submit seed ideas
      setIdeaStatus({})
      let ideaSuccesses = 0
      let ideaFailures = 0
      const filledIndices = ideas.map((t, i) => t.trim() ? i : -1).filter(i => i >= 0)

      for (let fi = 0; fi < filledIndices.length; fi++) {
        const idx = filledIndices[fi]
        setCreateProgress(`Submitting idea ${fi + 1}/${filledIndices.length}...`)
        try {
          const ideaRes = await fetch(`/api/deliberations/${data.id}/ideas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: ideas[idx].trim() }),
          })
          const ideaData = await ideaRes.json()
          if (!ideaRes.ok) {
            setIdeaStatus(prev => ({ ...prev, [idx]: { ok: false, msg: ideaData.error || `HTTP ${ideaRes.status}` } }))
            ideaFailures++
          } else {
            setIdeaStatus(prev => ({ ...prev, [idx]: { ok: true, msg: 'Submitted' } }))
            ideaSuccesses++
          }
        } catch (ideaErr) {
          const reason = ideaErr instanceof Error ? ideaErr.message : String(ideaErr)
          setIdeaStatus(prev => ({ ...prev, [idx]: { ok: false, msg: reason } }))
          ideaFailures++
        }
      }

      setCreateProgress('')

      if (ideaFailures > 0 && ideaSuccesses === 0 && filledIndices.length > 0) {
        setCreateError('Chant created but all ideas failed. See errors below.')
        fetchChants()
        return
      }

      resetCreateForm()
      setShowCreate(false)
      router.push(`/chants/${data.id}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unknown error')
      setCreateProgress('')
    } finally {
      setCreating(false)
    }
  }

  const filtered = chants
    .filter(c => {
      if (filter !== 'all' && c.phase !== filter) return false
      if (debouncedSearch && !c.question.toLowerCase().includes(debouncedSearch.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      const phasePriority: Record<string, number> = { VOTING: 3, SUBMISSION: 2, ACCUMULATING: 1, COMPLETED: 0 }
      const ap = phasePriority[a.phase] ?? 0
      const bp = phasePriority[b.phase] ?? 0
      if (bp !== ap) return bp - ap
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount(prev => prev + PAGE_SIZE)
        }
      },
      { root: scrollRef.current, rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [filtered.length])

  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  return (
    <FrameLayout
      active="chants"
      scrollRef={!showCreate ? scrollRef : undefined}
      contentClassName={!showCreate ? "border-t-2 border-b-2 border-accent/30" : ""}
      header={!showCreate ? (
        <div className="space-y-2 pb-3">
          <div className="flex gap-1.5 overflow-x-auto">
            {(['all', 'SUBMISSION', 'VOTING', 'COMPLETED', 'ACCUMULATING'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setVisibleCount(PAGE_SIZE) }}
                className={`px-2.5 py-1 text-xs rounded-lg whitespace-nowrap transition-colors ${
                  filter === f
                    ? 'bg-accent/15 text-accent font-medium'
                    : 'text-muted hover:text-foreground hover:bg-surface/80'
                }`}
              >
                {f === 'all' ? 'All' : f === 'SUBMISSION' ? 'Ideas' : f === 'VOTING' ? 'Voting' : f === 'COMPLETED' ? 'Done' : 'Rolling'}
              </button>
            ))}
          </div>
          {filter === 'all' && (
            <input
              type="text"
              placeholder="Search chants..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full px-3 py-2 bg-background/80 backdrop-blur-sm border border-border rounded-lg text-sm text-foreground placeholder-muted/50 focus:outline-none focus:border-accent transition-colors"
            />
          )}
        </div>
      ) : undefined}
      footerRight={session ? (
        <button
          onClick={() => {
            if (showCreate) resetCreateForm()
            setShowCreate(!showCreate)
          }}
          className="h-10 px-4 rounded-full bg-accent hover:bg-accent-hover text-white text-sm font-medium shadow-sm flex items-center gap-2 transition-colors"
        >
          <svg className={`w-4 h-4 transition-transform ${showCreate ? 'rotate-45' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          <span>{showCreate ? 'Cancel' : 'New'}</span>
        </button>
      ) : undefined}
    >
      {showCreate ? (
        <form onSubmit={handleCreate} className="p-4 bg-surface rounded-lg border border-border shadow-md">
          <h2 className="text-sm font-semibold mb-1 text-foreground">Start a New Chant</h2>
          <p className="text-[11px] text-muted mb-3 leading-relaxed">Tip: Open-ended questions work best. Let ideas explore the space.</p>
          <input
            type="text"
            placeholder="What should we decide?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={200}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted/50 mb-2 focus:outline-none focus:border-accent transition-colors"
          />
          <textarea
            placeholder="Add context (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted/50 mb-2 focus:outline-none focus:border-accent resize-none transition-colors"
          />
          <input
            type="text"
            placeholder="Tags (optional, comma separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted/50 mb-2 focus:outline-none focus:border-accent transition-colors"
          />
          {communities.length > 0 && (
            <select
              value={selectedCommunityId || ''}
              onChange={(e) => setSelectedCommunityId(e.target.value || null)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground mb-2 focus:outline-none focus:border-accent transition-colors"
            >
              <option value="">No community</option>
              {communities.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="text-xs text-muted hover:text-foreground mb-2 flex items-center gap-1 transition-colors"
          >
            <span className="text-[10px]">{showSettings ? '\u25BE' : '\u25B8'}</span>
            Settings
          </button>

          {showSettings && (
            <div className="mb-3 p-3 bg-background rounded-lg border border-border space-y-3">
              <div>
                <label className="text-xs text-foreground/80 block mb-1.5 font-medium">Voting Mode</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('fcfs')}
                    className={`flex-1 py-1.5 text-xs rounded-md border transition-colors font-medium ${
                      mode === 'fcfs'
                        ? 'bg-accent/15 border-accent/40 text-accent'
                        : 'bg-surface border-border text-muted hover:border-border-strong'
                    }`}
                  >
                    First Come First Serve
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('event'); setContinuous(false) }}
                    className={`flex-1 py-1.5 text-xs rounded-md border transition-colors font-medium ${
                      mode === 'event'
                        ? 'bg-accent/15 border-accent/40 text-accent'
                        : 'bg-surface border-border text-muted hover:border-border-strong'
                    }`}
                  >
                    Event Mode
                  </button>
                </div>
                <p className="text-xs text-muted mt-1.5 leading-relaxed">
                  {mode === 'fcfs'
                    ? 'Anyone can vote as soon as they arrive. Cells fill one at a time.'
                    : 'For live events. Collect participants and ideas first, then launch voting for everyone at once.'}
                </p>
              </div>

              {mode === 'event' && (
                <div>
                  <label className="text-xs text-foreground/80 block mb-1.5 font-medium">Member Goal</label>
                  <div className="flex gap-2">
                    {[
                      { value: 0, label: 'Manual' },
                      { value: 10, label: '10' },
                      { value: 25, label: '25' },
                      { value: 50, label: '50' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMemberGoal(opt.value)}
                        className={`flex-1 py-1.5 text-xs rounded-md border transition-colors font-medium ${
                          memberGoal === opt.value
                            ? 'bg-accent/15 border-accent/40 text-accent'
                            : 'bg-surface border-border text-muted hover:border-border-strong'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">
                    {memberGoal === 0
                      ? 'You start voting manually when the room is full.'
                      : `Voting starts automatically when ${memberGoal} members have joined.`}
                  </p>
                </div>
              )}

              {mode === 'fcfs' && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-foreground/80 font-medium">Continuous Flow</label>
                    <button
                      type="button"
                      onClick={() => setContinuous(!continuous)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${
                        continuous ? 'bg-accent' : 'bg-border'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                        continuous ? 'left-5' : 'left-0.5'
                      }`} />
                    </button>
                  </div>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">
                    {continuous
                      ? 'Voting begins automatically once enough ideas are submitted.'
                      : 'All ideas are collected first. Start voting manually.'}
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-foreground/80 font-medium">Unlimited Mode <span className="text-warning text-[10px]">experimental</span></label>
                  <button
                    type="button"
                    onClick={() => setMultipleIdeas(!multipleIdeas)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      multipleIdeas ? 'bg-warning' : 'bg-border'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                      multipleIdeas ? 'left-5' : 'left-0.5'
                    }`} />
                  </button>
                </div>
                <p className="text-xs text-muted mt-1.5 leading-relaxed">
                  {multipleIdeas
                    ? 'Multiple ideas and votes per person.'
                    : 'One idea and one vote per person per tier (default).'}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-foreground/80 font-medium">Allow AI Agents</label>
                  <button
                    type="button"
                    onClick={() => setAllowAI(!allowAI)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      allowAI ? 'bg-accent' : 'bg-border'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                      allowAI ? 'left-5' : 'left-0.5'
                    }`} />
                  </button>
                </div>
                <p className="text-xs text-muted mt-1.5 leading-relaxed">
                  {allowAI
                    ? 'AI agents can join and vote via the API.'
                    : 'Humans only — AI agents will be blocked.'}
                </p>
              </div>

              {continuous && mode === 'fcfs' && (
                <div>
                  <label className="text-xs text-foreground/80 block mb-1.5 font-medium">Ideas to start voting</label>
                  <div className="flex gap-2">
                    {[
                      { value: 0, label: 'Manual' },
                      { value: 5, label: '5 Ideas' },
                      { value: 10, label: '10 Ideas' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateIdeaGoal(opt.value)}
                        className={`flex-1 py-1.5 text-xs rounded-md border transition-colors font-medium ${
                          ideaGoal === opt.value
                            ? 'bg-accent/15 border-accent/40 text-accent'
                            : 'bg-surface border-border text-muted hover:border-border-strong'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">
                    {ideaGoal === 0
                      ? 'You start voting manually from the facilitator panel.'
                      : `Voting starts automatically after ${ideaGoal} ideas.`}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mb-3">
            <label className="text-xs text-foreground/80 block mb-2 font-medium">
              Seed Ideas {ideaGoal === 0 && <span className="text-muted font-normal">(optional)</span>}
            </label>
            <div className="space-y-2">
              {ideas.map((idea, i) => (
                <div key={i}>
                  <input
                    type="text"
                    placeholder={ideaGoal === 0 ? `Idea ${i + 1} (optional)` : `Idea ${i + 1}`}
                    value={idea}
                    onChange={(e) => {
                      const next = [...ideas]
                      next[i] = e.target.value
                      setIdeas(next)
                      setIdeaStatus(prev => {
                        const copy = { ...prev }
                        delete copy[i]
                        return copy
                      })
                    }}
                    maxLength={500}
                    className={`w-full px-3 py-1.5 bg-background border rounded-md text-sm text-foreground placeholder-muted/50 focus:outline-none focus:border-accent transition-colors ${
                      ideaStatus[i]?.ok === false ? 'border-error' : ideaStatus[i]?.ok ? 'border-success' : 'border-border'
                    }`}
                  />
                  {ideaStatus[i] && !ideaStatus[i].ok && (
                    <p className="text-error text-xs mt-0.5">{ideaStatus[i].msg}</p>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted mt-1.5">
              Pre-fill ideas to kick things off. Others can add more after creation.
            </p>
          </div>

          {createError && <p className="text-error text-xs mb-2">{createError}</p>}
          {createProgress && <p className="text-accent text-xs mb-2 animate-pulse">{createProgress}</p>}
          <button
            type="submit"
            disabled={creating || !question.trim()}
            className="w-full py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            {creating ? 'Creating...' : 'Create Chant'}
          </button>
        </form>
      ) : (
        <>
          {loading && chants.length === 0 ? (
            <div className="text-center text-muted py-12 animate-pulse text-sm">Loading chants...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted mb-2 text-sm">
                {debouncedSearch || filter !== 'all' ? 'No chants match your filters.' : 'No chants yet.'}
              </p>
              {session && !debouncedSearch && filter === 'all' && (
                <button onClick={() => setShowCreate(true)} className="text-accent text-sm hover:underline">
                  Start one to get the conversation going
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {visible.map((chant) => (
                <Link
                  key={chant.id}
                  href={`/chants/${chant.id}`}
                  className="block p-3.5 bg-surface/90 hover:bg-surface-hover/90 border border-border rounded-lg transition-all shadow-sm hover:shadow-md backdrop-blur-sm"
                >
                  {chant.isPinned && (
                    <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1.5">Pinned</div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-foreground leading-tight flex-1">{chant.question}</h3>
                    <PhaseBadge phase={chant.phase} />
                  </div>
                  {chant.description && (
                    <p className="text-xs text-muted mt-1.5 line-clamp-2 leading-relaxed">{chant.description}</p>
                  )}
                  {chant.champion && chant.phase === 'COMPLETED' && (
                    <div className="mt-2 p-2 bg-success/8 border border-success/15 rounded-md">
                      <p className="text-xs text-foreground/80 truncate">&ldquo;{chant.champion.text}&rdquo;</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                    <button
                      onClick={(e) => handleUpvote(e, chant.id)}
                      className={`flex items-center gap-1 transition-colors ${
                        chant.userHasUpvoted ? 'text-accent' : 'hover:text-accent'
                      }`}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill={chant.userHasUpvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                      <span className="font-mono">{chant.upvoteCount || 0}</span>
                    </button>
                    <span>{chant._count.ideas} ideas</span>
                    <span className="text-border-strong">&middot;</span>
                    <span>{chant._count.members} members</span>
                    <span className="text-border-strong">&middot;</span>
                    <span>by {chant.creator.name || 'Anonymous'}</span>
                  </div>
                </Link>
              ))}

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-1" />
              {hasMore && (
                <p className="text-center text-xs text-muted py-2 animate-pulse">Loading more...</p>
              )}
            </div>
          )}
        </>
      )}
    </FrameLayout>
  )
}

function PhaseBadge({ phase }: { phase: string }) {
  const config: Record<string, { label: string; color: string }> = {
    SUBMISSION: { label: 'Ideas', color: 'bg-accent/15 text-accent' },
    VOTING: { label: 'Voting', color: 'bg-warning/15 text-warning' },
    COMPLETED: { label: 'Done', color: 'bg-success/15 text-success' },
    ACCUMULATING: { label: 'Rolling', color: 'bg-purple/15 text-purple' },
  }
  const { label, color } = config[phase] || { label: phase, color: 'bg-muted/15 text-muted' }
  return <span className={`px-2 py-0.5 text-[11px] rounded-full font-medium shrink-0 ${color}`}>{label}</span>
}
