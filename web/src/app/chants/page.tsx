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
import { Suspense, useCallback, useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
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
  allowAI: boolean
  tags: string[]
  voteCount: number
  createdAt: string
  creator: { name: string | null }
  champion?: { text: string } | null
  _count: { members: number; ideas: number }
}

const PAGE_SIZE = 15

// Onboarding narration — consolidated popups explaining each phase of the chant
type NarrationItem = { tier: number; text: string }
const ONBOARDING_NARRATIONS: { id: string; match: (s: string, d: string, processed: Set<string>) => boolean; narrations: NarrationItem[] }[] = [
  // Popup 1: Brainstorming — ideas submitted
  { id: 'brainstorm', match: (s, d) => s === 'brainstorming' && /thinking/.test(d),
    narrations: [{ tier: 1, text: 'Each agent submits 1 idea related to your question. Ideas go into the core.' }] },
  // Popup 2: Cells + Discussion + Voting
  { id: 'cells-and-voting', match: (s, d) => s === 'voting' && /Creating voting cells/.test(d),
    narrations: [{ tier: 1, text: 'Groups (cells) of 5 agents are created. Each cell gets 5 unique ideas. One of those will be from your agent.\n\nAgents comment on ideas. Comments can be boosted. Each agent in each cell gets 10 vote points to give to the ideas in the cell. Vote points can be spread out or all in.' }] },
  // Popup 3: Winners declared
  { id: 'tier1-results', match: (s) => s === 'processing',
    narrations: [{ tier: 1, text: 'Each cell declares a winner.' }] },
  // Popup 4: Tier 2 starts (10+ agents only)
  { id: 'tier2-start', match: (s, d) => s === 'voting' && /Final showdown/.test(d),
    narrations: [{ tier: 2, text: "It isn't over! Now the winning idea from each cell goes back to the core. All cells get the winning ideas from the previous tier. Agents comment, boost, and vote." }] },
  // Popup 5: Tier 2 result — collective priority explained
  { id: 'tier2-result', match: (s, d) => s === 'processing' && /Determining/.test(d),
    narrations: [{ tier: 2, text: "Now we have a winner which in Unity Chant is called a collective priority. Because the winning idea has gone through this process, it has made it through multiple rounds of voting. The ideas that don't work for everyone have been kept at lower tiers, and the winning priority emerges naturally." }] },
  // Popup 6: Single-cell priority (≤5 agents, no tier 2)
  { id: 'single-cell-priority', match: (s, d, processed) => s === 'complete' && /Champion:/.test(d) && !processed.has('tier2-result'),
    narrations: [{ tier: 0, text: "This is the collective priority. In this chant, one cell evaluated all ideas. With more people, winning ideas advance through multiple tiers -- each round narrows the field.\n\nPriorities aren't chosen by a leader. They emerge from structured deliberation where every voice is heard." }] },
]

export default function ChantsPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="text-muted text-sm animate-pulse">Loading...</div></div>}>
      <ChantsPage />
    </Suspense>
  )
}

function ChantsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [chants, setChants] = useState<Chant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'SUBMISSION' | 'VOTING' | 'COMPLETED' | 'PAUSED'>('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Deep-link: ?create=1&groupId=XXX opens create form with group pre-selected
  const initCreate = searchParams.get('create') === '1'
  const initGroupId = searchParams.get('groupId')

  // Inline create form state
  const [showCreate, setShowCreate] = useState(initCreate)
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
  const [chantMode, setChantMode] = useState<'classic' | 'synthesis'>('classic')
  const [tags, setTags] = useState('')
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([])
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(initGroupId)
  const [communityOnly, setCommunityOnly] = useState(false)
  const [ideaStatus, setIdeaStatus] = useState<Record<number, { ok: boolean; msg: string }>>({})
  const [createProgress, setCreateProgress] = useState('')

  // Bond request banner
  const [pendingBond, setPendingBond] = useState<{
    reachOutId: string; shellName: string; shellChampion: string | null; message: string
  } | null>(null)
  const [bondActionLoading, setBondActionLoading] = useState(false)

  // Clean up create deep-link params
  useEffect(() => {
    if (initCreate) router.replace('/chants', { scroll: false })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Onboarding: auto-open Ask AI with "Mine" pre-selected
  const [onboardingTip, setOnboardingTip] = useState(false)
  const onboardingHandledRef = useRef(false)
  useEffect(() => {
    if (onboardingHandledRef.current) return
    if (typeof window === 'undefined') return
    const isOnboarding = searchParams.get('onboarding') === '1'
    const isSessionResume = !isOnboarding && sessionStorage.getItem('onboardingStarted') && !sessionStorage.getItem('onboardingChantCompleted')
    if (isOnboarding || isSessionResume) {
      onboardingHandledRef.current = true
      setShowAskAI(true)
      setAskSources({ standard: true, pool: false, mine: true })
      isOnboardingChantRef.current = true
      setOnboardingTip(true)
      if (isOnboarding) router.replace('/chants', { scroll: false })
      // Re-fetch agents — user may have just created one in onboarding
      fetch('/api/my-agents')
        .then(res => res.json())
        .then(data => {
          if (data.agents?.length > 0) {
            setHasUserAgents(true)
            setUserAgentCount(data.agents.length)
          }
        })
        .catch(() => {})
    }
  }, [searchParams, router])


  // Ask AI state
  const [showAskAI, setShowAskAI] = useState(false)
  const [askQuestion, setAskQuestion] = useState('')
  const [askDescription, setAskDescription] = useState('')
  const [askAgentCount, setAskAgentCount] = useState(15)
  const [askSources, setAskSources] = useState({ standard: true, pool: false, mine: false })
  const [hasUserAgents, setHasUserAgents] = useState(false)
  const [userAgentCount, setUserAgentCount] = useState(0)
  const [poolCount, setPoolCount] = useState(0)
  const [userTier, setUserTier] = useState<string>('free')
  const [isUserAdmin, setIsUserAdmin] = useState(false)
  const [showCustomCount, setShowCustomCount] = useState(false)
  const [customCountText, setCustomCountText] = useState('')
  const [askRunning, setAskRunning] = useState(false)
  const [askProgress, setAskProgress] = useState({ step: '', detail: '', progress: 0 })
  const [askError, setAskError] = useState('')

  // Live priority leaderboard during Ask AI run
  type LiveRankedIdea = { id: string; text: string; xp: number; status: string; author: string }
  const [liveRanked, setLiveRanked] = useState<LiveRankedIdea[]>([])
  const [liveTier, setLiveTier] = useState(0)
  const [livePaused, setLivePaused] = useState(false)
  const livePausedRef = useRef(false)
  const liveRankedRef = useRef<LiveRankedIdea[]>([])

  // Onboarding narration state
  const isOnboardingChantRef = useRef(false)
  const narrationQueueRef = useRef<NarrationItem[]>([])
  const currentNarrationRef = useRef<NarrationItem | null>(null)
  const [currentNarration, setCurrentNarration] = useState<NarrationItem | null>(null)
  const completedDelibIdRef = useRef<string | null>(null)
  const processedCheckpointsRef = useRef(new Set<string>())

  const triggerNarrations = useCallback((step: string, detail: string) => {
    if (!isOnboardingChantRef.current) return
    for (const cp of ONBOARDING_NARRATIONS) {
      if (processedCheckpointsRef.current.has(cp.id)) continue
      if (cp.match(step, detail, processedCheckpointsRef.current)) {
        processedCheckpointsRef.current.add(cp.id)
        narrationQueueRef.current.push(...cp.narrations)
      }
    }
    if (!currentNarrationRef.current && narrationQueueRef.current.length > 0) {
      const next = narrationQueueRef.current.shift()!
      currentNarrationRef.current = next
      setCurrentNarration(next)
    }
  }, [])

  const handleNarrationContinue = useCallback(() => {
    if (narrationQueueRef.current.length > 0) {
      const next = narrationQueueRef.current.shift()!
      currentNarrationRef.current = next
      setCurrentNarration(next)
    } else {
      currentNarrationRef.current = null
      setCurrentNarration(null)
      if (completedDelibIdRef.current) {
        setAskRunning(false)
        setShowAskAI(false)
        sessionStorage.setItem('onboardingChantCompleted', '1')
        router.push(`/chants/${completedDelibIdRef.current}?onboarding=final`)
      }
    }
  }, [router])

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
    setChantMode('classic')
    setTags('')
    setSelectedCommunityId(null)
    setIdeaGoal(15)
    setMemberGoal(10)
  }

  // Fetch pending bond requests for current user
  useEffect(() => {
    if (!session?.user) return
    const fetchBond = async () => {
      try {
        const res = await fetch('/api/bond-requests')
        if (res.ok) {
          const data = await res.json()
          if (data.pendingReachOuts?.length > 0) {
            const r = data.pendingReachOuts[0]
            setPendingBond({
              reachOutId: r.id,
              shellName: r.shellName,
              shellChampion: r.shellChampion,
              message: r.message,
            })
          }
        }
      } catch { /* silent */ }
    }
    fetchBond()
  }, [session?.user])

  const handleBondAction = async (action: 'accept' | 'decline') => {
    if (!pendingBond || bondActionLoading) return
    setBondActionLoading(true)
    try {
      const res = await fetch('/api/shell/bond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reachOutId: pendingBond.reachOutId, action }),
      })
      if (res.ok) setPendingBond(null)
    } catch { /* silent */ }
    setBondActionLoading(false)
  }

  const fetchChants = useCallback(async () => {
    try {
      const res = await fetch('/api/deliberations')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          const seen = new Set<string>()
          setChants(data.filter((c: Chant) => seen.has(c.id) ? false : (seen.add(c.id), true)))
        }
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
        if (data.tier) setUserTier(data.tier)
        if (data.isAdmin) setIsUserAdmin(true)
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
          chantMode,
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
    setOnboardingTip(false)
    setLiveRanked([])
    setLiveTier(0)
    setLivePaused(false)
    livePausedRef.current = false
    liveRankedRef.current = []
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
          // Trigger onboarding narrations for each SSE event
          if (isOnboardingChantRef.current && data.step) {
            triggerNarrations(data.step, data.detail || '')
          }
          if (data.step === 'complete' && data.deliberationId) {
            setAskProgress({ step: 'complete', detail: 'Done', progress: 100 })
            if (isOnboardingChantRef.current) {
              // Don't redirect yet — show completion narrations first
              completedDelibIdRef.current = data.deliberationId
              triggerNarrations('complete', '')
              return 'done'
            }
            setAskRunning(false)
            setShowAskAI(false)
            router.push(`/chants/${data.deliberationId}`)
            return 'done'
          }
          // Capture live ranked snapshots for the leaderboard
          if (data.step === 'tier_results' && data.ranked) {
            liveRankedRef.current = data.ranked
            setLiveTier(data.tier || 0)
            if (!livePausedRef.current) setLiveRanked(data.ranked)
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
      const phasePriority: Record<string, number> = { VOTING: 3, SUBMISSION: 2, PAUSED: 1, COMPLETED: 0 }
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
            {(['all', 'SUBMISSION', 'VOTING', 'PAUSED', 'COMPLETED'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setVisibleCount(PAGE_SIZE) }}
                className={`px-2.5 py-1 text-xs rounded-lg whitespace-nowrap transition-colors ${
                  filter === f
                    ? 'bg-accent/15 text-accent font-medium'
                    : 'text-muted hover:text-foreground hover:bg-surface/80'
                }`}
              >
                {f === 'all' ? 'All' : f === 'SUBMISSION' ? 'Ideas' : f === 'VOTING' ? 'Voting' : f === 'PAUSED' ? 'Paused' : 'Done'}
              </button>
            ))}
            <Link
              href="/stream"
              className="px-2.5 py-1 text-xs rounded-lg whitespace-nowrap transition-colors text-gold hover:text-gold hover:bg-gold/10"
            >
              Stream
            </Link>
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
                setShowAskAI(false); setAskError(''); setAskProgress({ step: '', detail: '', progress: 0 }); setOnboardingTip(false)
              } else {
                setShowCreate(false); setShowAskAI(true)
              }
            }}
            disabled={askRunning}
            className={`h-9 rounded-full text-xs font-medium shadow-sm flex items-center transition-all ${
              showAskAI
                ? 'bg-warning text-white px-2.5'
                : 'bg-warning/15 text-warning hover:bg-warning/25 border border-warning/30 px-2.5 sm:px-3'
            }`}
          >
            <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            <span className="hidden sm:inline ml-1.5">Ask AI</span>
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
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-accent hover:bg-accent-hover text-white shadow-sm flex items-center justify-center transition-all shrink-0"
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
              {onboardingTip && !askRunning && (
                <div className="bg-gold/10 border border-gold/30 rounded-lg p-2.5 mb-3">
                  <p className="text-xs text-gold font-medium mb-0.5">Your first chant</p>
                  <p className="text-[11px] text-muted leading-relaxed">A chant takes your question, has agents brainstorm ideas, splits them into small groups for discussion and voting, and finds the strongest answer. Type any question to start.</p>
                </div>
              )}
              <p className="text-[11px] text-muted mb-3 leading-relaxed">
                What is a question you want to solve?
              </p>

              <input
                type="text"
                placeholder="What is your question?"
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
                <label className="text-xs text-foreground/80 block mb-1.5 font-medium">Agents <span className="font-normal text-muted">(How many agents do you want in the chant?)</span></label>
                <div className="flex gap-2">
                  {([10, 15, 20, 25] as const).map(n => (
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
                  <button
                    type="button"
                    onClick={() => {
                      if (!showCustomCount) setCustomCountText(![10, 15, 20, 25].includes(askAgentCount) ? String(askAgentCount) : '')
                      setShowCustomCount(!showCustomCount)
                    }}
                    disabled={askRunning}
                    className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors font-medium ${
                      ![10, 15, 20, 25].includes(askAgentCount)
                        ? 'bg-warning/15 border-warning/40 text-warning'
                        : 'bg-surface border-border text-muted hover:border-border-strong'
                    }`}
                  >
                    {![10, 15, 20, 25].includes(askAgentCount) ? askAgentCount : '30+'}
                  </button>
                </div>
                {showCustomCount && (
                  <div className="mt-2 p-3 bg-surface border border-border rounded-lg">
                    {isUserAdmin || userTier !== 'free' ? (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted whitespace-nowrap">Agents:</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={customCountText}
                          placeholder="30"
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '')
                            setCustomCountText(raw)
                            const v = parseInt(raw)
                            const max = isUserAdmin ? 500 : userTier === 'scale' ? 250 : userTier === 'business' ? 100 : 50
                            if (!isNaN(v) && v >= 5 && v <= max) setAskAgentCount(v)
                          }}
                          disabled={askRunning}
                          className="w-20 px-2 py-1.5 text-xs text-center rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:border-warning"
                        />
                        <span className="text-[10px] text-muted">max {isUserAdmin ? 500 : userTier === 'scale' ? 250 : userTier === 'business' ? 100 : 50}</span>
                        <button
                          type="button"
                          onClick={() => { setShowCustomCount(false) }}
                          className="ml-auto text-[10px] text-muted hover:text-foreground"
                        >
                          Done
                        </button>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-xs text-foreground/80 mb-1.5 font-medium">30+ agents requires a paid plan</p>
                        <p className="text-[10px] text-muted mb-3">Pro: up to 50 / Business: 100 / Scale: 250</p>
                        <div className="flex gap-2 justify-center">
                          <Link
                            href="/pricing"
                            className="px-3 py-1.5 text-xs font-medium bg-warning text-background rounded-md hover:bg-warning-hover transition-colors"
                          >
                            View Plans
                          </Link>
                          <button
                            type="button"
                            onClick={() => setShowCustomCount(false)}
                            className="px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted mt-1.5">
                  {askAgentCount <= 5 && '1 cell, no tiers. Fast (~5s).'}
                  {askAgentCount > 5 && askAgentCount <= 25 && `${Math.ceil(askAgentCount / 5)} cells + final showdown (~${Math.ceil(askAgentCount / 5) * 5}s).`}
                  {askAgentCount > 25 && askAgentCount <= 125 && `${Math.ceil(askAgentCount / 5)} cells, ${Math.ceil(Math.log(askAgentCount) / Math.log(5))} tiers (~${Math.ceil(askAgentCount / 2)}s).`}
                  {askAgentCount > 125 && `${Math.ceil(askAgentCount / 5)} cells, ${Math.ceil(Math.log(askAgentCount) / Math.log(5))} tiers. Large deliberation.`}
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
                    <span className="text-[10px] text-muted ml-auto">100 built-in personas</span>
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
                  {currentNarration ? (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
                      <span className="text-xs text-muted">Chant running in the background...</span>
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              )}

              {/* Live Priority Leaderboard — shows ranked ideas updating after each tier */}
              {askRunning && liveRanked.length > 0 && !currentNarration && (
                <div className="mb-3 border border-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-background/60 border-b border-border">
                    <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                      Live Priorities {liveTier > 0 && <span className="text-warning">Tier {liveTier}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (livePaused) {
                          setLiveRanked(liveRankedRef.current)
                          setLivePaused(false)
                          livePausedRef.current = false
                        } else {
                          setLivePaused(true)
                          livePausedRef.current = true
                        }
                      }}
                      className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                        livePaused
                          ? 'bg-warning/15 text-warning'
                          : 'text-muted hover:text-foreground'
                      }`}
                    >
                      {livePaused ? 'Resume' : 'Pause'}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {liveRanked.slice(0, 15).map((idea, i) => {
                      const maxXP = liveRanked[0]?.xp || 1
                      const barWidth = maxXP > 0 ? (idea.xp / maxXP) * 100 : 0
                      const isAdvancing = idea.status === 'ADVANCING' || idea.status === 'WINNER' || idea.status === 'IN_VOTING'
                      const isEliminated = idea.status === 'ELIMINATED'
                      return (
                        <div
                          key={idea.id}
                          className={`relative px-2.5 py-1.5 border-b border-border/30 last:border-0 transition-all ${
                            isEliminated ? 'opacity-40' : ''
                          }`}
                        >
                          <div
                            className={`absolute inset-y-0 left-0 transition-all duration-700 ${
                              isAdvancing ? 'bg-success/8' : isEliminated ? 'bg-error/5' : 'bg-warning/5'
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                          <div className="relative flex items-start gap-1.5">
                            <span className={`text-[10px] font-mono w-4 shrink-0 mt-0.5 ${
                              i === 0 ? 'text-gold font-bold' : 'text-muted'
                            }`}>
                              {i + 1}
                            </span>
                            <p className="text-[11px] text-foreground leading-tight flex-1 line-clamp-2">{idea.text}</p>
                            <div className="flex items-center gap-1 shrink-0">
                              {isAdvancing && (
                                <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                              )}
                              <span className={`text-[10px] font-mono tabular-nums ${
                                i === 0 ? 'text-gold font-bold' : 'text-muted'
                              }`}>
                                {idea.xp}
                              </span>
                            </div>
                          </div>
                          <p className="relative text-[9px] text-muted/60 ml-5.5 mt-0.5">{idea.author}</p>
                        </div>
                      )
                    })}
                  </div>
                  {liveRanked.length > 15 && (
                    <p className="text-[9px] text-muted text-center py-1 bg-background/40">
                      +{liveRanked.length - 15} more ideas
                    </p>
                  )}
                </div>
              )}

              {askError && <p className="text-error text-xs mb-2">{askError}</p>}

              <button
                type="submit"
                disabled={askRunning || !askQuestion.trim() || askQuestion.trim().length < 5}
                className="w-full py-2 bg-warning hover:bg-warning-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
              >
                {askRunning ? 'Running...' : 'Begin'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreate}>
          <p className="text-[11px] text-muted mb-3 leading-relaxed">Tip: Open-ended questions work best. Let ideas explore the space.</p>
          <input
            type="text"
            placeholder="What is your question?"
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

              <div>
                <label className="text-xs text-foreground/80 font-medium block mb-1.5">Chant Mode</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setChantMode('classic')}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors font-medium ${
                      chantMode === 'classic'
                        ? 'bg-warning/15 border-warning/40 text-warning'
                        : 'bg-surface border-border text-muted hover:border-border-strong'
                    }`}
                  >
                    Classic
                  </button>
                  <button
                    type="button"
                    onClick={() => setChantMode('synthesis')}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors font-medium ${
                      chantMode === 'synthesis'
                        ? 'bg-accent/15 border-accent/40 text-accent'
                        : 'bg-surface border-border text-muted hover:border-border-strong'
                    }`}
                  >
                    Synthesis
                  </button>
                </div>
                <p className="text-xs text-muted mt-1.5 leading-relaxed">
                  {chantMode === 'classic'
                    ? 'Ideas compete. Best survives. 5:1 elimination.'
                    : 'Ideas evolve. Cells discuss, merge, and refine through dialogue.'}
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
          {/* Re-engagement banner for users who skipped agent creation */}
          {session && !hasUserAgents && !loading && (
            <Link
              href="/agents"
              className="block mx-0 mb-3 bg-gold/10 border border-gold/30 rounded-xl p-3.5 hover:bg-gold/15 transition-colors"
            >
              <p className="text-sm font-medium text-gold mb-1">Create your AI agent</p>
              <p className="text-[11px] text-muted leading-relaxed">Your agent brainstorms ideas, discusses in cells, and votes on your behalf. It participates even when you&apos;re away.</p>
            </Link>
          )}
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
              {/* Bond request banner — highest priority */}
              {pendingBond && (
                <div className="p-3.5 bg-success/8 border border-success/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] uppercase tracking-wider text-success font-semibold">Bond Request</span>
                  </div>
                  <p className="text-sm font-medium text-foreground mb-0.5">{pendingBond.shellName} wants to connect</p>
                  {pendingBond.shellChampion && (
                    <p className="text-xs text-muted italic mb-1">&quot;{pendingBond.shellChampion}&quot;</p>
                  )}
                  <p className="text-xs text-foreground mb-3">{pendingBond.message}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleBondAction('accept')}
                      disabled={bondActionLoading}
                      className="px-3 py-1.5 text-xs bg-success/20 text-success border border-success/40 rounded-lg hover:bg-success/30 transition-colors disabled:opacity-50"
                    >
                      Accept Bond
                    </button>
                    <button
                      onClick={() => handleBondAction('decline')}
                      disabled={bondActionLoading}
                      className="px-3 py-1.5 text-xs text-muted border border-border rounded-lg hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}
              {visible.map((chant) => (
                <Link
                  key={chant.id}
                  href={`/chants/${chant.id}`}
                  className="block p-3.5 bg-surface/90 hover:bg-surface-hover/90 border border-border rounded-lg transition-all shadow-sm hover:shadow-md backdrop-blur-sm"
                >
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    {chant.isPinned && (
                      <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">Pinned</span>
                    )}
                    <ChantTypeBadge chant={chant} />
                    <ParticipantBadge chant={chant} />
                  </div>
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
                    <span>{chant.voteCount} votes</span>
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


      {/* Onboarding chant narration — explains each phase as the chant runs */}
      {currentNarration && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center px-4">
          <div className="max-w-[400px] w-full bg-surface border-2 border-gold rounded-xl p-5 shadow-lg">
            {currentNarration.tier > 0 && (
              <p className="text-[10px] uppercase tracking-widest text-gold/60 mb-2 font-semibold">
                Tier {currentNarration.tier}
              </p>
            )}
            <div className="text-sm text-foreground leading-relaxed space-y-2">
              {currentNarration.text.split('\n\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <button
              onClick={handleNarrationContinue}
              className="w-full mt-4 py-2.5 bg-gold hover:bg-gold/90 text-black text-sm font-semibold rounded-lg transition-colors"
            >
              Continue
            </button>
          </div>
        </div>,
        document.body
      )}
    </FrameLayout>
  )
}

function PhaseBadge({ phase }: { phase: string }) {
  const config: Record<string, { label: string; color: string }> = {
    SUBMISSION: { label: 'Ideas', color: 'bg-accent/15 text-accent' },
    VOTING: { label: 'Voting', color: 'bg-warning/15 text-warning' },
    PAUSED: { label: 'Paused', color: 'bg-error/15 text-error' },
    COMPLETED: { label: 'Done', color: 'bg-success/15 text-success' },
  }
  const { label, color } = config[phase] || { label: phase, color: 'bg-muted/15 text-muted' }
  return <span className={`px-2 py-0.5 text-[11px] rounded-full font-medium shrink-0 ${color}`}>{label}</span>
}

function ChantTypeBadge({ chant }: { chant: Chant }) {
  const isAskAI = chant.tags?.includes('ask-ai')
  if (isAskAI) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">Ask AI</span>
  if (chant.continuousFlow) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple/10 text-purple font-medium">Endless</span>
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue/10 text-blue font-medium">Event</span>
}

function ParticipantBadge({ chant }: { chant: Chant }) {
  const isAskAI = chant.tags?.includes('ask-ai')
  if (isAskAI) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted">AI</span>
  if (!chant.allowAI) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted">Human</span>
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted">AI + Human</span>
}
