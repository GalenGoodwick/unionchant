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
  const [filter, setFilter] = useState<'all' | 'SUBMISSION' | 'VOTING' | 'COMPLETED'>('all')
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
  const [mode, setMode] = useState<'event' | 'idea_goal' | 'endless'>('event')
  const [ideaGoal, setIdeaGoal] = useState(15)
  const [memberGoal, setMemberGoal] = useState(10)
  const [ideas, setIdeas] = useState<string[]>(['', '', '', '', ''])
  const [allowAI, setAllowAI] = useState(true)
  const [tags, setTags] = useState('')
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([])
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null)
  const [communityOnly, setCommunityOnly] = useState(false)
  const [ideaStatus, setIdeaStatus] = useState<Record<number, { ok: boolean; msg: string }>>({})
  const [createProgress, setCreateProgress] = useState('')

  // Ask AI state
  const [showAskAI, setShowAskAI] = useState(false)
  const [askQuestion, setAskQuestion] = useState('')
  const [askDescription, setAskDescription] = useState('')
  const [askAgentCount, setAskAgentCount] = useState(15)
  const [askSources, setAskSources] = useState({ standard: true, pool: false, mine: false })
  const [hasUserAgents, setHasUserAgents] = useState(false)
  const [userAgentCount, setUserAgentCount] = useState(0)
  const [poolCount, setPoolCount] = useState(0)
  const [askRunning, setAskRunning] = useState(false)
  const [askProgress, setAskProgress] = useState({ step: '', detail: '', progress: 0 })
  const [askError, setAskError] = useState('')

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
    setMode('event')
    setAllowAI(true)
    setTags('')
    setSelectedCommunityId(null)
    setIdeaGoal(15)
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

  // Check if user has AI agents + pool count (for Ask AI source options)
  useEffect(() => {
    if (!session) return
    fetch('/api/my-agents')
      .then(res => res.json())
      .then(data => {
        if (data.agents?.length > 0) {
          setHasUserAgents(true)
          setUserAgentCount(data.agents.length)
        }
      })
      .catch(() => {})
    fetch('/api/agent-pool/count')
      .then(res => res.json())
      .then(data => { if (data.count > 0) setPoolCount(data.count) })
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
          allocationMode: mode === 'endless' ? 'fcfs' : 'balanced',
          continuousFlow: mode === 'endless',
          allowAI,
          ideaGoal: (mode === 'idea_goal' || mode === 'endless') ? ideaGoal : null,
          memberGoal: mode === 'event' ? memberGoal : null,
          votingTimeoutMs: 0,
          tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
          communityId: selectedCommunityId || undefined,
          communityOnly: selectedCommunityId ? communityOnly : undefined,
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

  const handleAskAI = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!askQuestion.trim() || askQuestion.trim().length < 5) {
      setAskError('Question must be at least 5 characters')
      return
    }
    setAskRunning(true)
    setAskError('')
    setAskProgress({ step: 'starting', detail: 'Connecting...', progress: 0 })

    try {
      const response = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: askQuestion.trim(),
          description: askDescription.trim() || undefined,
          agentCount: askAgentCount,
          sources: askSources,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(data.error || `Failed (${response.status})`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return
        try {
          const data = JSON.parse(line.slice(6))
          if (data.step === 'error') {
            throw new Error(data.detail || 'Ask AI failed')
          }
          if (data.step === 'complete' && data.deliberationId) {
            setAskProgress({ step: 'complete', detail: 'Done', progress: 100 })
            setAskRunning(false)
            setShowAskAI(false)
            router.push(`/chants/${data.deliberationId}`)
            return 'done'
          }
          if (data.step && data.detail) {
            setAskProgress({ step: data.step, detail: data.detail, progress: data.progress || 0 })
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== 'Ask AI failed') return
          throw parseErr
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (processLine(line) === 'done') return
        }
      }

      // Process any remaining buffer after stream ends
      if (buffer.trim()) {
        for (const line of buffer.split('\n')) {
          if (processLine(line) === 'done') return
        }
      }
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Unknown error')
      setAskRunning(false)
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
      const phasePriority: Record<string, number> = { VOTING: 3, SUBMISSION: 2, COMPLETED: 0 }
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
      scrollRef={!showCreate && !showAskAI ? scrollRef : undefined}
      contentClassName=""
      header={!showCreate && !showAskAI ? (
        <div className="space-y-2 pb-3">
          <div className="flex gap-1.5 overflow-x-auto">
            {(['all', 'SUBMISSION', 'VOTING', 'COMPLETED'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setVisibleCount(PAGE_SIZE) }}
                className={`px-2.5 py-1 text-xs rounded-lg whitespace-nowrap transition-colors ${
                  filter === f
                    ? 'bg-accent/15 text-accent font-medium'
                    : 'text-muted hover:text-foreground hover:bg-surface/80'
                }`}
              >
                {f === 'all' ? 'All' : f === 'SUBMISSION' ? 'Ideas' : f === 'VOTING' ? 'Voting' : 'Done'}
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
        <>
          <button
            onClick={() => {
              if (showAskAI) {
                setShowAskAI(false); setAskError(''); setAskProgress({ step: '', detail: '', progress: 0 })
              } else {
                setShowCreate(false); setShowAskAI(true)
              }
            }}
            disabled={askRunning}
            className={`h-9 px-3 rounded-full text-xs font-medium shadow-sm flex items-center gap-1.5 transition-all ${
              showAskAI
                ? 'bg-warning text-white'
                : 'bg-warning/15 text-warning hover:bg-warning/25 border border-warning/30'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            Ask AI
          </button>
          <button
            onClick={() => {
              if (showCreate) {
                resetCreateForm(); setShowCreate(false)
              } else {
                setShowAskAI(false); setShowCreate(true)
              }
            }}
            disabled={askRunning}
            className="w-10 h-10 rounded-full bg-accent hover:bg-accent-hover text-white shadow-sm flex items-center justify-center transition-all"
          >
            <svg className={`w-5 h-5 transition-transform ${showCreate ? 'rotate-45' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </>
      ) : undefined}
    >
      {showCreate || showAskAI ? (
        <div className="p-4 bg-surface rounded-lg border border-border shadow-md">
          {showAskAI ? (
            <form onSubmit={handleAskAI}>
              <p className="text-[11px] text-muted mb-3 leading-relaxed">
                AI agents brainstorm ideas, vote in cells, and return ranked results.
              </p>

              <input
                type="text"
                placeholder="What should we decide?"
                value={askQuestion}
                onChange={(e) => setAskQuestion(e.target.value)}
                maxLength={300}
                disabled={askRunning}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted/50 mb-2 focus:outline-none focus:border-warning transition-colors"
              />
              <textarea
                placeholder="Add context (optional)"
                value={askDescription}
                onChange={(e) => setAskDescription(e.target.value)}
                maxLength={500}
                rows={2}
                disabled={askRunning}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted/50 mb-3 focus:outline-none focus:border-warning resize-none transition-colors"
              />

              <div className="mb-3">
                <label className="text-xs text-foreground/80 block mb-1.5 font-medium">Agents</label>
                <div className="flex gap-2">
                  {([5, 10, 15, 20, 25] as const).map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAskAgentCount(n)}
                      disabled={askRunning}
                      className={`flex-1 py-1.5 text-xs rounded-md border transition-colors font-medium ${
                        askAgentCount === n
                          ? 'bg-warning/15 border-warning/40 text-warning'
                          : 'bg-surface border-border text-muted hover:border-border-strong'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted mt-1.5">
                  {askAgentCount === 5 && '1 cell, no tiers. Fast (~5s).'}
                  {askAgentCount === 10 && '2 cells + final showdown (~10s).'}
                  {askAgentCount === 15 && '3 cells + final showdown (~15s).'}
                  {askAgentCount === 20 && '4 cells + final showdown (~15s).'}
                  {askAgentCount === 25 && '5 cells + final showdown (~20s).'}
                </p>
              </div>

              <div className="mb-3">
                <label className="text-xs text-foreground/80 block mb-1.5 font-medium">Agent Sources</label>
                <div className="space-y-1.5">
                  <label className={`flex items-center gap-2 px-2.5 py-2 rounded-md border cursor-pointer transition-colors ${
                    askSources.standard ? 'bg-warning/10 border-warning/30' : 'bg-surface border-border hover:border-border-strong'
                  } ${askRunning ? 'opacity-50 pointer-events-none' : ''}`}>
                    <input
                      type="checkbox"
                      checked={askSources.standard}
                      onChange={() => setAskSources(s => ({ ...s, standard: !s.standard }))}
                      disabled={askRunning}
                      className="accent-warning w-3.5 h-3.5"
                    />
                    <span className={`text-[11px] font-medium ${askSources.standard ? 'text-warning' : 'text-muted'}`}>
                      Standard
                    </span>
                    <span className="text-[10px] text-muted ml-auto">25 built-in personas</span>
                  </label>
                  {poolCount > 0 && (
                    <label className={`flex items-center gap-2 px-2.5 py-2 rounded-md border cursor-pointer transition-colors ${
                      askSources.pool ? 'bg-accent/10 border-accent/30' : 'bg-surface border-border hover:border-border-strong'
                    } ${askRunning ? 'opacity-50 pointer-events-none' : ''}`}>
                      <input
                        type="checkbox"
                        checked={askSources.pool}
                        onChange={() => setAskSources(s => ({ ...s, pool: !s.pool }))}
                        disabled={askRunning}
                        className="accent-accent w-3.5 h-3.5"
                      />
                      <span className={`text-[11px] font-medium ${askSources.pool ? 'text-accent' : 'text-muted'}`}>
                        Pool
                      </span>
                      <span className="text-[10px] text-muted ml-auto">{poolCount} community agents</span>
                    </label>
                  )}
                  {hasUserAgents ? (
                    <label className={`flex items-center gap-2 px-2.5 py-2 rounded-md border cursor-pointer transition-colors ${
                      askSources.mine ? 'bg-success/10 border-success/30' : 'bg-surface border-border hover:border-border-strong'
                    } ${askRunning ? 'opacity-50 pointer-events-none' : ''}`}>
                      <input
                        type="checkbox"
                        checked={askSources.mine}
                        onChange={() => setAskSources(s => ({ ...s, mine: !s.mine }))}
                        disabled={askRunning}
                        className="accent-success w-3.5 h-3.5"
                      />
                      <span className={`text-[11px] font-medium ${askSources.mine ? 'text-success' : 'text-muted'}`}>
                        Mine
                      </span>
                      <span className="text-[10px] text-muted ml-auto">{userAgentCount} agent{userAgentCount !== 1 ? 's' : ''}</span>
                    </label>
                  ) : (
                    <div className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-border bg-surface opacity-50">
                      <input type="checkbox" disabled checked={false} className="w-3.5 h-3.5" />
                      <span className="text-[11px] text-muted">Mine</span>
                      <Link href="/agents/new" className="text-[10px] text-accent hover:text-accent-hover ml-auto">Create an agent</Link>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted mt-1">
                  {!askSources.standard && !askSources.pool && !askSources.mine
                    ? 'Check at least one source. Standard will be used by default.'
                    : 'Checked sources are blended. Standard fills remaining slots.'}
                </p>
              </div>

              {askRunning && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2 h-2 bg-warning rounded-full animate-pulse" />
                    <span className="text-xs text-warning font-medium">{askProgress.detail || 'Starting...'}</span>
                  </div>
                  <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
                    <div
                      className="h-full bg-warning rounded-full transition-all duration-500"
                      style={{ width: `${askProgress.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {askError && <p className="text-error text-xs mb-2">{askError}</p>}

              <button
                type="submit"
                disabled={askRunning || !askQuestion.trim() || askQuestion.trim().length < 5}
                className="w-full py-2 bg-warning hover:bg-warning-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
              >
                {askRunning ? 'Running...' : 'Run'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreate}>
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
            <div className="mb-2">
              <select
                value={selectedCommunityId || ''}
                onChange={(e) => {
                  const id = e.target.value || null
                  setSelectedCommunityId(id)
                  if (!id) setCommunityOnly(false)
                }}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
              >
                <option value="">No group</option>
                {communities.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {selectedCommunityId && (
                <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={communityOnly}
                    onChange={(e) => setCommunityOnly(e.target.checked)}
                    className="accent-accent"
                  />
                  <span className="text-xs text-muted">Private post (only appears in group feed)</span>
                </label>
              )}
            </div>
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
                <label className="text-xs text-foreground/80 block mb-1.5 font-medium">Mode</label>
                <div className="flex gap-2">
                  {([
                    { value: 'event' as const, label: 'Event' },
                    { value: 'idea_goal' as const, label: 'Idea Goal' },
                    { value: 'endless' as const, label: 'Endless' },
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMode(opt.value)}
                      className={`flex-1 py-1.5 text-xs rounded-md border transition-colors font-medium ${
                        mode === opt.value
                          ? 'bg-accent/15 border-accent/40 text-accent'
                          : 'bg-surface border-border text-muted hover:border-border-strong'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted mt-1.5 leading-relaxed">
                  {mode === 'event' && 'Facilitator controls phases. Collect ideas first, then start voting.'}
                  {mode === 'idea_goal' && 'Voting auto-starts when the idea goal is reached. Submissions capped.'}
                  {mode === 'endless' && 'Cells form as ideas arrive. Runs forever.'}
                </p>
              </div>

              {mode === 'event' && (
                <p className="text-xs text-muted leading-relaxed">
                  Start voting from the facilitator panel when your group is ready.
                </p>
              )}

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

              {mode === 'idea_goal' && (
                <div>
                  <label className="text-xs text-foreground/80 block mb-1.5 font-medium">
                    {mode === 'idea_goal' ? 'Idea Goal (hard cap)' : 'Ideas per batch'}
                  </label>
                  <div className="flex gap-2">
                    {[
                      { value: 5, label: '5' },
                      { value: 10, label: '10' },
                      { value: 15, label: '15' },
                      { value: 25, label: '25' },
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
                    {mode === 'idea_goal'
                      ? `Voting starts at ${ideaGoal} ideas. No more submissions after that.`
                      : `Cells form every ${ideaGoal} ideas.`}
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
          )}
        </div>
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
  }
  const { label, color } = config[phase] || { label: phase, color: 'bg-muted/15 text-muted' }
  return <span className={`px-2 py-0.5 text-[11px] rounded-full font-medium shrink-0 ${color}`}>{label}</span>
}
