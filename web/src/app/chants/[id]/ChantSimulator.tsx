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
import { ChantStatus, CommentInfo, IdeaInfo, VoteResult } from '@/types/chant-simulator'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PentagonConstellation } from '@/components/ConstellationCanvas'

type Tab = 'join' | 'vote' | 'hearts' | 'submit' | 'cells' | 'manage'

export default function ChantSimulator({ id }: { id: string }) {
  const { data: session } = useSession()
  const userId = session?.user?.email // used to detect login, actual auth is server-side
  const router = useRouter()

  const [status, setStatus] = useState<ChantStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Idea submission
  const [ideaText, setIdeaText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // Voting
  const [allocations, setAllocations] = useState<Record<string, number>>({})
  const [votingTiers, setVotingTiers] = useState<Set<number>>(new Set())
  const [voteError, setVoteError] = useState('')
  const [tierVoteResults, setTierVoteResults] = useState<Record<number, VoteResult>>({})

  // Start voting
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')

  // Facilitator controls
  const [actionLoading, setActionLoading] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [confirmForce, setConfirmForce] = useState(false)
  const [confirmAIResolve, setConfirmAIResolve] = useState(false)
  const [confirmChallenge, setConfirmChallenge] = useState(false)
  const [copiedInvite, setCopiedInvite] = useState(false)

  // Tabs
  const [activeTab, setActiveTab] = useState<Tab>('join')
  const [tabInitialized, setTabInitialized] = useState(false)

  // Cells
  const [selectedCell, setSelectedCell] = useState<string | null>(null)

  // Per-tier vote allocations + cell ideas (stored after voting)
  const [tierLastAllocations, setTierLastAllocations] = useState<Record<number, Record<string, number>>>({})
  const [tierLastCellIdeas, setTierLastCellIdeas] = useState<Record<number, { id: string; text: string }[]>>({})
  const [showOtherCellIdeas, setShowOtherCellIdeas] = useState(false)
  const [showRunnerUp, setShowRunnerUp] = useState(false)

  // Quantum routing: which tier the user is voting in
  const [selectedTier, setSelectedTier] = useState<number | null>(null)
  const tierAllocationsRef = useRef<Record<number, Record<string, number>>>({})
  // Local voted tracker — survives the gap between tierVoteResults clearing and status refresh
  const [localVotedTiers, setLocalVotedTiers] = useState<Set<number>>(new Set())

  // Discussion
  const [comments, setComments] = useState<CommentInfo[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [expandedIdea, setExpandedIdea] = useState<string | null>(null)
  const [commentText, setCommentText] = useState<Record<string, string>>({})
  const [postingComment, setPostingComment] = useState<string | null>(null)
  const [commentError, setCommentError] = useState('')
  const [upvoting, setUpvoting] = useState<string | null>(null)

  // Explicit join — no auto-join, user clicks Join tab button
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const participated = useRef(false)

  const handleJoin = async () => {
    if (!userId) {
      router.push('/auth/signin')
      return
    }
    setJoining(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/join`, { method: 'POST' })
      if (res.ok) {
        setJoined(true)
        participated.current = true
        fetchStatus()
        // Switch to appropriate tab
        if (status?.phase === 'SUBMISSION') setActiveTab('submit')
        else if (status?.phase === 'VOTING') setActiveTab('vote')
        else setActiveTab('hearts')
      }
    } catch { /* silent */ }
    finally { setJoining(false) }
  }

  useEffect(() => {
    if (!joined) return
    const handleUnload = () => {
      if (!participated.current) {
        navigator.sendBeacon(`/api/deliberations/${id}/leave`)
      }
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      handleUnload() // also fire on SPA navigation (component unmount)
    }
  }, [id, joined])

  const fetchingStatus = useRef(false)
  const fetchStatus = useCallback(async () => {
    if (fetchingStatus.current) return // prevent stacking
    fetchingStatus.current = true
    try {
      const res = await fetch(`/api/deliberations/${id}/status`)
      if (!res.ok) {
        // Don't kill the page on transient errors — only on first load
        if (!status) throw new Error('Failed to fetch')
        return
      }
      const data = await res.json()
      setStatus(data)

      // Detect existing membership from API
      if (data.isMember && !joined) {
        setJoined(true)
        participated.current = true
      }

      // Allocations initialized via useEffect watching status + selectedTier

      if (!tabInitialized) {
        if (data.isMember) {
          // Already a member — go to phase tab
          if (data.phase === 'VOTING' && !data.hasVoted) setActiveTab('vote')
          else if (data.phase === 'SUBMISSION') setActiveTab('submit')
          else if (data.phase === 'COMPLETED') setActiveTab('hearts')
        }
        // else stay on 'join' tab (default)
        setTabInitialized(true)
      }
    } catch (err) {
      if (!status) setError((err as Error).message)
    } finally {
      setLoading(false)
      fetchingStatus.current = false
    }
  }, [id, tabInitialized, status])

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/deliberations/${id}/flat-comments`)
      if (!res.ok) return
      const data = await res.json()
      setComments(data.comments || [])
    } catch {
      // silent fail
    }
  }, [id])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 20000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  useEffect(() => {
    if (activeTab === 'hearts' || activeTab === 'submit') {
      setCommentsLoading(true)
      fetchComments().finally(() => setCommentsLoading(false))
      const interval = setInterval(fetchComments, 15000)
      return () => clearInterval(interval)
    }
  }, [activeTab, fetchComments])

  // Quantum routing: initialize allocations when tier/ideas change
  useEffect(() => {
    if (!status || status.phase !== 'VOTING') return
    const votable = [...new Set(status.cells.filter(c => c.status === 'VOTING').map(c => c.tier))].sort((a, b) => a - b)
    const unvoted = votable.filter(t => !status.votedTiers?.includes(t))
    const tier = selectedTier ?? unvoted[0] ?? votable[0] ?? status.currentTier

    let ideaIds: string[] = []
    if (tier === status.currentTier && status.fcfsProgress?.currentCellIdeas) {
      ideaIds = status.fcfsProgress.currentCellIdeas.map(i => i.id)
    } else {
      const cell = status.cells.find(c => c.tier === tier && c.status === 'VOTING' && c.ideas?.length)
      if (cell?.ideas) ideaIds = cell.ideas.map(i => i.id)
    }

    if (ideaIds.length > 0) {
      setAllocations(prev => {
        const prevIds = Object.keys(prev).sort().join(',')
        const newIds = [...ideaIds].sort().join(',')
        if (prevIds === newIds) return prev
        // Restore saved allocations for this tier if they match
        const saved = tierAllocationsRef.current[tier]
        if (saved && Object.keys(saved).sort().join(',') === newIds) return saved
        const init: Record<string, number> = {}
        ideaIds.forEach(id => { init[id] = 0 })
        return init
      })
    }
  }, [status, selectedTier])

  const handleSubmitIdea = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !ideaText.trim()) return

    setSubmitting(true)
    setSubmitError('')
    setSubmitSuccess(false)

    try {
      const res = await fetch(`/api/deliberations/${id}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ideaText.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit')
      }

      participated.current = true
      setIdeaText('')
      setSubmitSuccess(true)
      fetchStatus()
      setTimeout(() => setSubmitSuccess(false), 3000)
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleVote = async () => {
    if (!userId) return

    // Snapshot at call time — these won't change during the await
    const voteTier = effectiveTier
    const voteAllocations = { ...allocations }
    const voteIdeas = votingIdeas.map(i => ({ id: i.id, text: i.text }))

    const total = Object.values(voteAllocations).reduce((sum, v) => sum + v, 0)
    if (total !== 10) {
      setVoteError(`Allocate exactly 10 XP (currently ${total})`)
      return
    }

    // Mark this tier as voting (non-blocking for other tiers)
    setVotingTiers(prev => new Set([...prev, voteTier]))
    setVoteError('')
    // Clear saved allocations for this tier (vote is in flight)
    delete tierAllocationsRef.current[voteTier]

    try {
      const res = await fetch(`/api/deliberations/${id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: Object.entries(voteAllocations)
            .filter(([, points]) => points > 0)
            .map(([ideaId, points]) => ({ ideaId, points })),
          tier: voteTier,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to vote')

      participated.current = true
      setLocalVotedTiers(prev => new Set([...prev, voteTier]))
      setTierLastAllocations(prev => ({ ...prev, [voteTier]: voteAllocations }))
      setTierLastCellIdeas(prev => ({ ...prev, [voteTier]: voteIdeas }))
      setShowOtherCellIdeas(false)
      setTierVoteResults(prev => ({ ...prev, [voteTier]: data }))
      // Auto-route to next unvoted tier
      setSelectedTier(null)
      fetchStatus()

      // Auto-clear this tier's result after 5s (enough time to review allocations)
      setTimeout(() => {
        setTierVoteResults(prev => {
          const next = { ...prev }
          delete next[voteTier]
          return next
        })
        fetchStatus()
      }, 5000)
    } catch (err) {
      setVoteError((err as Error).message)
    } finally {
      setVotingTiers(prev => {
        const next = new Set(prev)
        next.delete(voteTier)
        return next
      })
    }
  }

  const handleStartVoting = async () => {
    if (!userId) return
    setStarting(true)
    setStartError('')

    try {
      const res = await fetch(`/api/deliberations/${id}/start-voting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start')
      }

      fetchStatus()
    } catch (err) {
      setStartError((err as Error).message)
    } finally {
      setStarting(false)
    }
  }

  const handleFacilitatorAction = async (action: string, label: string) => {
    if (!userId) return
    setActionLoading(action)
    setActionError('')
    setActionSuccess('')

    try {
      if (action === 'delete') {
        const res = await fetch(`/api/deliberations/${id}`, {
          method: 'DELETE',
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Failed to ${label}`)
      } else {
        const res = await fetch(`/api/deliberations/${id}/facilitate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Failed to ${label}`)
      }

      setActionSuccess(`${label} successful`)
      fetchStatus()
      setTimeout(() => setActionSuccess(''), 3000)
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setActionLoading('')
    }
  }

  const handlePostComment = async (ideaId: string) => {
    if (!userId) return
    const text = commentText[ideaId]?.trim()
    if (!text) return

    setPostingComment(ideaId)
    setCommentError('')

    try {
      const res = await fetch(`/api/deliberations/${id}/flat-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, ideaId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to post comment')

      participated.current = true
      setComments(prev => [...prev, data])
      setCommentText(prev => ({ ...prev, [ideaId]: '' }))
    } catch (err) {
      setCommentError((err as Error).message)
    } finally {
      setPostingComment(null)
    }
  }

  const handleUpvote = async (commentId: string) => {
    if (!userId || upvoting) return
    setUpvoting(commentId)

    try {
      const res = await fetch(`/api/deliberations/${id}/upvote-comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to upvote')

      setComments(prev => prev.map(c =>
        c.id === commentId
          ? { ...c, upvoteCount: data.upvoteCount, userHasUpvoted: data.upvoted, spreadCount: data.spreadCount }
          : c
      ))
    } catch {
      // silent fail
    } finally {
      setUpvoting(null)
    }
  }

  const updateAllocation = (ideaId: string, value: number) => {
    setAllocations(prev => ({ ...prev, [ideaId]: value }))
    setVoteError('')
  }

  const totalAllocated = Object.values(allocations).reduce((sum, v) => sum + v, 0)

  // Top bar toggle (persisted)
  const [topBarOpen, setTopBarOpen] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('topBarOpen') === 'true'
    return false
  })
  const toggleTopBar = () => {
    setTopBarOpen(prev => {
      const next = !prev
      localStorage.setItem('topBarOpen', String(next))
      return next
    })
  }

  const frameNav = (
    <div className="shrink-0 px-4 pt-4 relative z-10">
      {/* Top bar: SDK / API / AI / Beta / Humanity / Embed / Method */}
      {topBarOpen && (
        <div className="flex justify-center items-center gap-1 mb-2 pb-2 border-b border-border/50 flex-wrap">
          {[
            { href: '/sdk', label: 'SDK' },
            { href: '/api-docs', label: 'API' },
            { href: '/ai', label: 'AI' },
          ].map(link => (
            <Link key={link.href} href={link.href} className="px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors text-muted hover:text-foreground hover:bg-surface/80">{link.label}</Link>
          ))}
          <Link href="/chants" className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-500 hover:text-red-400 transition-colors">Beta</Link>
          {[
            { href: '/humanity', label: 'Humanity' },
            { href: '/embed', label: 'Embed' },
            { href: '/methodology', label: 'Method' },
          ].map(link => (
            <Link key={link.href} href={link.href} className="px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors text-muted hover:text-foreground hover:bg-surface/80">{link.label}</Link>
          ))}
        </div>
      )}
      {/* Section nav: Back / Chants / Podiums / Groups / Toggle */}
      <div className="flex items-center mb-3 border-b-2 border-accent/30 pb-3">
        <button onClick={() => router.push('/chants')} className="w-7 h-7 rounded-full bg-surface/80 hover:bg-surface border border-border text-muted hover:text-foreground flex items-center justify-center transition-colors shrink-0" aria-label="Go back">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div className="flex-1 flex justify-center items-center gap-2">
          {[
            { href: '/chants', label: 'Chants' },
            { href: '/podiums', label: 'Podiums' },
            { href: '/groups', label: 'Groups' },
          ].map(s => (
            <Link key={s.href} href={s.href} className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${s.href === '/chants' ? 'bg-accent/15 text-accent font-semibold' : 'text-muted hover:text-foreground hover:bg-surface/80'}`}>{s.label}</Link>
          ))}
        </div>
        <button
          onClick={toggleTopBar}
          className="w-7 h-7 rounded-full bg-accent/20 hover:bg-accent/30 border border-accent/40 text-accent flex items-center justify-center transition-colors shrink-0"
          aria-label={topBarOpen ? 'Hide top bar' : 'Show top bar'}
          title={topBarOpen ? 'Hide top bar' : 'Show top bar'}
        >
          <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${topBarOpen ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col bg-background overflow-hidden p-2 sm:p-4">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden max-w-[480px] w-full mx-auto relative border-4 border-white/50 rounded-xl">
          <PentagonConstellation />
          {frameNav}
          <div className="flex-1 flex items-center justify-center relative z-10">
            <div className="text-muted animate-pulse text-sm">Loading chant...</div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !status) {
    return (
      <div className="fixed inset-0 flex flex-col bg-background overflow-hidden p-2 sm:p-4">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden max-w-[480px] w-full mx-auto relative border-4 border-white/50 rounded-xl">
          <PentagonConstellation />
          {frameNav}
          <div className="flex-1 flex items-center justify-center relative z-10 px-4">
            <div className="text-center">
              <p className="text-error mb-2">{error || 'Chant not found'}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Quantum routing: compute effective tier and voting ideas
  const votableTiers = [...new Set(status.cells.filter(c => c.status === 'VOTING').map(c => c.tier))].sort((a, b) => a - b)
  const unvotedTiers = votableTiers.filter(t => !status.votedTiers?.includes(t) && !localVotedTiers.has(t))
  const effectiveTier = selectedTier ?? unvotedTiers[0] ?? votableTiers[0] ?? status.currentTier

  const cellIdeas = effectiveTier === status.currentTier ? status.fcfsProgress?.currentCellIdeas : null
  const tierCell = !cellIdeas ? status.cells.find(c => c.tier === effectiveTier && c.status === 'VOTING' && c.ideas?.length) : null
  const votingIdeas = cellIdeas
    ? cellIdeas.map(ci => ({ ...ci, status: 'IN_VOTING', tier: effectiveTier, totalXP: 0, totalVotes: 0, isChampion: false, author: { ...ci.author } }))
    : tierCell?.ideas
    ? tierCell.ideas.map(i => ({ id: i.id, text: i.text, status: 'IN_VOTING', tier: effectiveTier, totalXP: i.totalXP, totalVotes: 0, isChampion: false, author: { id: '', name: i.author.name } }))
    : status.ideas.filter(i => i.status === 'IN_VOTING')
  const isCreator = userId && status.creator.id === session?.user?.id

  // Group comments by ideaId
  const commentsByIdea: Record<string, CommentInfo[]> = {}
  for (const c of comments) {
    if (c.ideaId) {
      if (!commentsByIdea[c.ideaId]) commentsByIdea[c.ideaId] = []
      commentsByIdea[c.ideaId].push(c)
    }
  }

  const userIdeas = userId ? status.ideas.filter(i => i.author.id === session?.user?.id) : []

  const submissionsOpen = !status.submissionsClosed && (
    status.phase === 'SUBMISSION' || status.phase === 'ACCUMULATING' || (status.phase === 'VOTING' && status.continuousFlow)
  )

  const tabs: { key: Tab; label: string; badge?: number; show: boolean }[] = [
    { key: 'join', label: joined ? 'Overview' : 'Join', show: true },
    { key: 'submit', label: 'Submit', show: true },
    { key: 'vote', label: 'Vote', show: true },
    { key: 'hearts', label: status.phase === 'COMPLETED' ? 'Results' : 'Ideas', badge: status.ideas.length, show: true },
    { key: 'cells', label: 'Cells', badge: status.cells.length || undefined, show: true },
    { key: 'manage', label: 'Manage', show: !!isCreator },
  ]

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden p-2 sm:p-4">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden max-w-[480px] w-full mx-auto relative border-4 border-white/50 rounded-xl">
        <PentagonConstellation />

        {frameNav}

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 relative z-10">

        {/* Header */}
        <div className="mb-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h1 className="text-base font-semibold text-foreground leading-tight tracking-tight">{status.question}</h1>
            <PhaseBadge phase={status.phase} />
          </div>
          {status.description && (
            <p className="text-xs text-muted mb-1 leading-relaxed">{status.description}</p>
          )}
          <p className="text-xs text-muted">by {status.creator.name}</p>
        </div>

        {/* Join CTA — above stats for visibility */}
        {!joined && (
          <div className="mb-3">
            {!userId ? (
              <Link
                href="/auth/signin"
                className="block text-center bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Sign in to join
              </Link>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full bg-success hover:bg-success-hover text-white px-4 py-3 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {joining ? 'Joining...' : 'Join This Chant'}
              </button>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <Stat value={status.ideaCount} label="Ideas" />
          <Stat value={status.memberCount} label="Members" />
          <Stat value={status.cells.reduce((sum, c) => sum + c._count.votes, 0)} label="Votes" />
          {(() => {
            const openTiers = [...new Set(status.cells.filter(c => c.status === 'VOTING').map(c => c.tier))].sort((a, b) => a - b)
            const tierLabel = openTiers.length > 0 ? openTiers.map(t => `T${t}`).join('-') : `T${status.currentTier}`
            return (
              <div className="p-2 bg-surface/90 backdrop-blur-sm rounded-lg border border-border text-center">
                <p className="text-base font-mono font-bold text-foreground">{tierLabel}</p>
                <p className="text-[11px] text-muted">{openTiers.length > 1 ? 'Open Tiers' : 'Tier'}</p>
              </div>
            )
          })()}
        </div>

        {/* Champion Banner */}
        {status.champion && (() => {
          const runnersUp = status.ideas
            .filter(i => i.id !== status.champion!.id && i.totalXP > 0)
            .sort((a, b) => b.totalXP - a.totalXP || (Math.random() - 0.5))
            .slice(0, 4)
          return (
            <div className="mb-3 p-3 bg-success/8 border border-success/20 rounded-lg">
              <p className="text-[11px] text-success font-bold mb-0.5 uppercase tracking-wide">Priority Declared</p>
              <p className="text-foreground font-medium text-sm">{status.champion.text}</p>
              <p className="text-xs text-muted mt-0.5">by {status.champion.author.name} &middot; {status.champion.totalXP} XP</p>
              {runnersUp.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowRunnerUp(!showRunnerUp)}
                    className="text-[11px] text-muted hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <span className="text-[9px]">{showRunnerUp ? '\u25BC' : '\u25B6'}</span>
                    Next {runnersUp.length}
                  </button>
                  {showRunnerUp && (
                    <div className="mt-1.5 space-y-1.5 pl-1 border-l border-success/20 ml-0.5">
                      {runnersUp.map((idea, i) => (
                        <div key={idea.id} className="text-xs">
                          <span className="font-mono text-muted mr-1.5">#{i + 2}</span>
                          <span className="text-foreground/80">{idea.text}</span>
                          <span className="text-muted ml-1">{idea.totalXP} XP</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* Tab Bar */}
        <div className="flex border-b border-border mb-4 overflow-x-auto gap-0.5">
          {tabs.filter(t => t.show).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-xs font-medium text-center whitespace-nowrap transition-colors rounded-t-md ${
                activeTab === tab.key
                  ? 'text-foreground border-b-2 border-accent bg-surface/50'
                  : 'text-muted hover:text-foreground hover:bg-surface/30'
              }`}
            >
              {tab.label}
              {tab.badge ? <span className="ml-1 text-muted/50 text-[10px]">{tab.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* ─── JOIN TAB ─── */}
        {activeTab === 'join' && (
          <div className="space-y-4">
            {/* Phase status */}
            <div className="p-3 bg-surface/90 rounded-lg border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted uppercase tracking-wide">Status</span>
                <PhaseBadge phase={status.phase} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="text-lg font-bold font-mono text-foreground">{status.memberCount}</div>
                  <div className="text-[10px] text-muted">Members</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold font-mono text-foreground">{status.ideaCount}</div>
                  <div className="text-[10px] text-muted">Ideas</div>
                </div>
                {(() => {
                  const openTiers = [...new Set(status.cells.filter(c => c.status === 'VOTING').map(c => c.tier))].sort((a, b) => a - b)
                  const tierLabel = openTiers.length > 0 ? openTiers.map(t => `T${t}`).join('-') : `T${status.currentTier}`
                  return (
                    <div className="text-center">
                      <div className="text-lg font-bold font-mono text-accent">{tierLabel}</div>
                      <div className="text-[10px] text-muted">{openTiers.length > 1 ? 'Open Tiers' : 'Tier'}</div>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Event mode member/idea tally */}
            {status.phase === 'SUBMISSION' && status.memberGoal && status.memberGoal > 0 && (
              <div className="p-3 bg-surface/90 rounded-lg border border-border">
                <div className="flex justify-between text-xs text-muted mb-1">
                  <span className="font-medium">Member Goal</span>
                  <span>{status.memberCount}/{status.memberGoal}</span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${Math.min(100, (status.memberCount / status.memberGoal) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>{status.ideaCount} ideas submitted</span>
                  <span>{status.memberCount >= status.memberGoal ? 'Goal reached!' : `${status.memberGoal - status.memberCount} more needed`}</span>
                </div>
              </div>
            )}

            {status.phase === 'SUBMISSION' && status.ideaGoal && status.ideaGoal > 0 && (
              <div className="p-3 bg-surface/90 rounded-lg border border-border">
                <div className="flex justify-between text-xs text-muted mb-1">
                  <span className="font-medium">Idea Goal</span>
                  <span>{status.ideaCount}/{status.ideaGoal}</span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${Math.min(100, (status.ideaCount / status.ideaGoal) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Top ideas preview */}
            {status.ideas.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                  Top Ideas ({status.ideas.length})
                </h3>
                <div className="space-y-1.5">
                  {status.ideas
                    .sort((a, b) => b.totalXP - a.totalXP)
                    .slice(0, 5)
                    .map((idea, i) => (
                    <div key={idea.id} className="p-2.5 bg-surface/60 rounded-lg border border-border/50">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-mono text-muted shrink-0">#{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm text-foreground leading-snug">{idea.text}</p>
                          <p className="text-[10px] text-muted mt-0.5">
                            by {idea.author.name}
                            {idea.totalXP > 0 && <span className="ml-1">&middot; {idea.totalXP} XP</span>}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {status.ideas.length > 5 && (
                    <p className="text-[10px] text-muted text-center">+{status.ideas.length - 5} more</p>
                  )}
                </div>
              </div>
            )}

            {/* Join action */}
            {!userId ? (
              <Link
                href="/auth/signin"
                className="block text-center bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Sign in to join
              </Link>
            ) : !joined ? (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full bg-success hover:bg-success-hover text-white px-4 py-3 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {joining ? 'Joining...' : 'Join This Chant'}
              </button>
            ) : (
              <div className="p-3 bg-success/8 border border-success/20 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-success text-sm font-medium">You&apos;re a member</span>
                </div>
                <button
                  onClick={() => {
                    if (status.phase === 'SUBMISSION') setActiveTab('submit')
                    else if (status.phase === 'VOTING') setActiveTab('vote')
                    else setActiveTab('hearts')
                  }}
                  className="text-success text-xs font-semibold hover:underline"
                >
                  {status.phase === 'SUBMISSION' ? 'Submit' : status.phase === 'VOTING' ? 'Vote' : 'View'} &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── VOTE TAB ─── */}
        {activeTab === 'vote' && (
          <div>
            {status.phase === 'VOTING' && status.cells.length > 0 && (() => {
              const openTiers = [...new Set(status.cells.filter(c => c.status === 'VOTING' || c.status === 'COMPLETED').map(c => c.tier))].sort((a, b) => a - b)
              return openTiers.length > 0 && (
                <div className="mb-4 p-3 bg-surface/90 backdrop-blur-sm rounded-lg border border-border shadow-sm space-y-3">
                  {openTiers.map(tier => {
                    const tierCells = status.cells.filter(c => c.tier === tier)
                    const completed = tierCells.filter(c => c.status === 'COMPLETED').length
                    const votingCell = tierCells.find(c => c.status === 'VOTING')
                    const voters = votingCell?._count.participants || 0
                    return (
                      <div key={tier}>
                        <div className="flex justify-between text-xs text-muted mb-1">
                          <span className="font-medium">Tier {tier}</span>
                          <span>{completed}/{tierCells.length} cells done</span>
                        </div>
                        <div className="w-full bg-background rounded-full h-1.5 mb-1.5">
                          <div
                            className="bg-success h-1.5 rounded-full transition-all"
                            style={{ width: `${tierCells.length > 0 ? (completed / tierCells.length) * 100 : 0}%` }}
                          />
                        </div>
                        {votingCell && (
                          <div className="flex justify-between text-[11px] text-muted">
                            <span>Current cell</span>
                            <span>{voters}/5 voters</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {status.phase === 'VOTING' && status.currentTier >= 1 && (
              <div className="mb-4 p-3 bg-surface/90 backdrop-blur-sm rounded-lg border border-border shadow-sm">
                <p className="text-xs font-medium text-muted mb-2">Your Votes</p>
                <div className="space-y-1">
                  {[...new Set(status.cells.map(c => c.tier))].sort((a, b) => a - b).map(tier => {
                    const voted = status.votedTiers?.includes(tier) || localVotedTiers.has(tier)
                    const hasOpenCells = status.cells.some(c => c.tier === tier && c.status === 'VOTING')
                    const available = hasOpenCells && !voted && !tierVoteResults[tier] && !votingTiers.has(tier)
                    const justVoted = !!tierVoteResults[tier]
                    return (
                      <button
                        key={tier}
                        onClick={() => {
                          tierAllocationsRef.current[effectiveTier] = { ...allocations }
                          setSelectedTier(tier)
                          setTimeout(() => {
                            document.getElementById('voting-area')?.scrollIntoView({ behavior: 'smooth' })
                          }, 50)
                        }}
                        className="flex items-center gap-2 text-xs w-full text-left cursor-pointer hover:bg-surface/50 rounded px-1 -mx-1 transition-colors"
                      >
                        <span className={`inline-flex items-center justify-center w-6 h-5 rounded-full text-[10px] font-mono font-bold shrink-0 ${
                          voted || justVoted
                            ? 'bg-success/15 text-success'
                            : tier === effectiveTier
                            ? 'bg-accent/20 text-accent ring-1 ring-accent/40'
                            : available
                            ? 'bg-warning/15 text-warning animate-pulse'
                            : votingTiers.has(tier)
                            ? 'bg-accent/15 text-accent animate-pulse'
                            : 'bg-surface text-muted'
                        }`}>
                          T{tier}
                        </span>
                        <span className={`${
                          voted || justVoted ? 'text-muted' : available ? 'text-warning' : votingTiers.has(tier) ? 'text-accent' : 'text-muted'
                        }`}>
                          {voted || justVoted
                            ? 'Voted'
                            : available
                            ? 'Vote now'
                            : votingTiers.has(tier)
                            ? 'Submitting...'
                            : hasOpenCells
                            ? 'Open — enter to vote'
                            : 'Closed'}
                        </span>
                        {available && (
                          <span className="ml-auto text-warning text-[10px]">&darr;</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {/* Allocations shown in the main voted card below, not here */}
              </div>
            )}

            {status.phase === 'SUBMISSION' && (
              <EmptyState icon={'\u2696'} title="Voting hasn't started yet" subtitle={<>Ideas are gathering. Switch to <button onClick={() => setActiveTab('submit')} className="text-accent hover:underline font-medium">Submit</button> to add yours.</>} />
            )}

            {status.phase === 'COMPLETED' && !status.champion && (
              <EmptyState icon={'\u2713'} title="Voting is complete" />
            )}

            {status.phase === 'COMPLETED' && status.champion && (
              <EmptyState icon={'\u2605'} title="Priority Declared" bold subtitle={<>Check <button onClick={() => setActiveTab('hearts')} className="text-accent hover:underline font-medium">Results</button> for full rankings.</>} />
            )}

            {status.phase === 'VOTING' && (status.votedTiers?.includes(effectiveTier) || localVotedTiers.has(effectiveTier)) && !status.multipleIdeasAllowed && !tierVoteResults[effectiveTier] && (() => {
              const allocs = tierLastAllocations[effectiveTier] || {}
              const cellIdeas = tierLastCellIdeas[effectiveTier] || []
              const hasAllocs = Object.keys(allocs).length > 0
              return (
                <div className="p-4 bg-success/8 border border-success/20 rounded-lg">
                  <p className="text-success font-semibold text-sm mb-1 text-center">T{effectiveTier} voted</p>
                  {hasAllocs && (
                    <div className="space-y-1 my-2">
                      {Object.entries(allocs)
                        .sort(([, a], [, b]) => b - a)
                        .map(([ideaId, pts]) => {
                          const idea = cellIdeas.find(i => i.id === ideaId) || status.ideas.find(i => i.id === ideaId)
                          return (
                            <div key={ideaId} className="flex items-center gap-2 text-xs">
                              <span className={`font-mono font-bold min-w-[2ch] text-right ${pts > 0 ? 'text-accent' : 'text-muted'}`}>{pts}</span>
                              <span className={pts > 0 ? 'text-foreground/80' : 'text-muted'}>{idea?.text || 'Unknown'}</span>
                            </div>
                          )
                        })}
                    </div>
                  )}
                  <p className="text-xs text-muted text-center">Waiting for other voters to complete their cells.</p>
                  {unvotedTiers.length > 0 && (
                    <button
                      onClick={() => {
                        tierAllocationsRef.current[effectiveTier] = { ...allocations }
                        setSelectedTier(unvotedTiers[0])
                        setTimeout(() => document.getElementById('voting-area')?.scrollIntoView({ behavior: 'smooth' }), 50)
                      }}
                      className="mt-2 text-xs text-accent font-medium hover:underline block mx-auto"
                    >
                      Vote T{unvotedTiers[0]} next &rarr;
                    </button>
                  )}
                </div>
              )
            })()}

            {votingTiers.has(effectiveTier) && (
              <div className="p-4 bg-accent/8 border border-accent/20 rounded-lg text-center">
                <p className="text-accent font-semibold text-sm animate-pulse">Submitting T{effectiveTier} vote...</p>
              </div>
            )}

            {tierVoteResults[effectiveTier] && (() => {
              const allocs = tierLastAllocations[effectiveTier] || {}
              const cellIdeas = tierLastCellIdeas[effectiveTier] || []
              return (
                <div className="p-4 bg-success/8 border border-success/20 rounded-lg">
                  <p className="text-success font-semibold text-sm mb-2 text-center">Vote Cast!</p>
                  <div className="space-y-1 mb-3">
                    {Object.entries(allocs)
                      .sort(([, a], [, b]) => b - a)
                      .map(([ideaId, pts]) => {
                        const idea = cellIdeas.find(i => i.id === ideaId) || status.ideas.find(i => i.id === ideaId)
                        return (
                          <div key={ideaId} className="flex items-center gap-2 text-xs">
                            <span className={`font-mono font-bold min-w-[2ch] text-right ${pts > 0 ? 'text-accent' : 'text-muted'}`}>{pts}</span>
                            <span className={pts > 0 ? 'text-foreground/80' : 'text-muted'}>{idea?.text || 'Unknown'}</span>
                          </div>
                        )
                      })}
                  </div>
                  <p className="text-xs text-muted text-center">
                    {tierVoteResults[effectiveTier].voterCount}/{tierVoteResults[effectiveTier].votersNeeded} voters in cell
                    {tierVoteResults[effectiveTier].cellCompleted && ' — Cell complete!'}
                  </p>
                  <p className="text-xs text-muted mt-1 text-center">
                    {tierVoteResults[effectiveTier].progress.completedCells}/{tierVoteResults[effectiveTier].progress.totalCells} cells done
                  </p>
                </div>
              )
            })()}

            {status.phase === 'VOTING' && !tierVoteResults[effectiveTier] && !votingTiers.has(effectiveTier) && ((!status.votedTiers?.includes(effectiveTier) && !localVotedTiers.has(effectiveTier)) || status.multipleIdeasAllowed) && votingIdeas.length > 0 && (
              <div id="voting-area" className="p-4 bg-surface/90 backdrop-blur-sm rounded-lg border border-border shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-sm font-semibold text-foreground">Allocate 10 XP <span className="text-muted font-normal text-xs">(T{effectiveTier})</span></h2>
                  <span className={`text-sm font-mono font-bold ${totalAllocated === 10 ? 'text-success' : totalAllocated > 10 ? 'text-error' : 'text-muted'}`}>
                    {totalAllocated}/10
                  </span>
                </div>

                <div className="space-y-4">
                  {votingIdeas.map((idea) => (
                    <div key={idea.id}>
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm text-foreground flex-1 mr-2">{idea.text}</p>
                        <span className="text-sm font-mono font-bold text-accent min-w-[2ch] text-right">
                          {allocations[idea.id] || 0}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        value={allocations[idea.id] || 0}
                        onChange={(e) => updateAllocation(idea.id, parseInt(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-xs text-muted">by {idea.author.name}</p>
                    </div>
                  ))}
                </div>

                {voteError && <p className="text-error text-xs mt-2">{voteError}</p>}

                <button
                  onClick={handleVote}
                  disabled={votingTiers.has(effectiveTier) || totalAllocated !== 10}
                  className="w-full mt-4 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                >
                  {votingTiers.has(effectiveTier) ? 'Submitting...' : totalAllocated !== 10 ? `Allocate ${10 - totalAllocated} more XP` : 'Cast Vote'}
                </button>
              </div>
            )}

            {status.phase === 'VOTING' && !status.votedTiers?.includes(effectiveTier) && !localVotedTiers.has(effectiveTier) && !tierVoteResults[effectiveTier] && votingIdeas.length === 0 && (
              <EmptyState icon={'\u23F3'} title="Waiting for a cell" subtitle="Cells form as voters arrive. You'll be assigned shortly." />
            )}
          </div>
        )}

        {/* ─── SUBMIT TAB ─── */}
        {activeTab === 'submit' && (
          <div className="space-y-3">
            <div className={`p-3 rounded-lg border text-xs ${
              status.submissionsClosed
                ? 'bg-surface/90 backdrop-blur-sm border-border text-muted'
                : status.multipleIdeasAllowed
                ? 'bg-accent/8 border-accent/20 text-accent'
                : 'bg-surface/90 backdrop-blur-sm border-border text-muted'
            }`}>
              {status.submissionsClosed
                ? 'Submissions are closed. Voting is in progress.'
                : status.multipleIdeasAllowed
                ? 'Multiple ideas allowed — submit as many as you like.'
                : userIdeas.length > 0
                ? 'You\'ve submitted your idea. One per person.'
                : 'One idea per person. Make it count.'}
            </div>

            {!status.submissionsClosed && (status.multipleIdeasAllowed || userIdeas.length === 0) && (
              <form onSubmit={handleSubmitIdea} className="p-4 bg-surface/90 backdrop-blur-sm rounded-lg border border-border shadow-sm">
                <h2 className="text-sm font-semibold mb-1 text-foreground">Submit Your Idea</h2>
                <p className="text-xs text-muted mb-3 leading-relaxed">
                  Answer the question with your best idea.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Your idea..."
                    value={ideaText}
                    onChange={(e) => setIdeaText(e.target.value)}
                    disabled={submitting}
                    maxLength={500}
                    className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted/50 focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !ideaText.trim()}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shadow-sm"
                  >
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
                {submitError && <p className="text-error text-xs mt-2">{submitError}</p>}
                {submitSuccess && <p className="text-success text-xs mt-2">Idea submitted!</p>}
              </form>
            )}

            {userIdeas.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted mb-2">Your idea{userIdeas.length > 1 ? 's' : ''}</h3>
                <div className="space-y-1.5">
                  {userIdeas.map(idea => {
                    const ideaComments = commentsByIdea[idea.id] || []
                    const isExpanded = expandedIdea === idea.id
                    return (
                      <div key={idea.id} className="bg-surface/90 backdrop-blur-sm rounded-lg border border-border overflow-hidden">
                        <button
                          onClick={() => setExpandedIdea(isExpanded ? null : idea.id)}
                          className="w-full p-2.5 text-left flex items-start justify-between gap-2 hover:bg-surface/80 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground">{idea.text}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {idea.totalXP > 0 && (
                              <span className="text-[11px] font-mono font-bold text-warning">{idea.totalXP}</span>
                            )}
                            <IdeaStatusBadge status={idea.status} isChampion={idea.isChampion} tier={idea.tier} />
                            {ideaComments.length > 0 && (
                              <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded-full">{ideaComments.length}</span>
                            )}
                            <span className="text-muted text-[10px]">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                          </div>
                        </button>
                        {isExpanded && <CommentThread comments={ideaComments} />}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <p className="text-xs text-muted text-center">{status.ideaCount} idea{status.ideaCount !== 1 ? 's' : ''} submitted so far</p>
          </div>
        )}

        {/* ─── IDEAS/RESULTS TAB ─── */}
        {activeTab === 'hearts' && (
          <div>
            {commentsLoading && comments.length === 0 && status.ideas.length > 0 && (
              <p className="text-muted text-xs text-center py-2 animate-pulse">Loading comments...</p>
            )}

            {status.ideas.length === 0 ? (
              <EmptyState icon={'💡'} title="No ideas yet" subtitle="Be the first to submit one!" />
            ) : (
              <div className="space-y-2">
                {status.ideas
                  .sort((a, b) => b.totalXP - a.totalXP)
                  .map((idea, i) => {
                    const ideaComments = commentsByIdea[idea.id] || []
                    const isExpanded = expandedIdea === idea.id
                    const userCommented = userId && ideaComments.some(c => c.user.name === session?.user?.name)
                    return (
                      <div
                        key={idea.id}
                        className={`rounded-lg border overflow-hidden shadow-sm ${
                          idea.isChampion
                            ? 'bg-success/8 border-success/20'
                            : idea.status === 'ADVANCING'
                            ? 'bg-accent/8 border-accent/20'
                            : 'bg-surface/90 backdrop-blur-sm border-border'
                        }`}
                      >
                        <button
                          onClick={() => setExpandedIdea(isExpanded ? null : idea.id)}
                          className="w-full p-3 text-left hover:bg-surface/80 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-muted font-mono">#{i + 1}</span>
                                <p className="text-sm text-foreground">{idea.text}</p>
                              </div>
                              <p className="text-xs text-muted mt-0.5">by {idea.author.name}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {idea.totalXP > 0 && (
                                <span className="text-xs font-mono font-bold text-warning">{idea.totalXP}</span>
                              )}
                              <IdeaStatusBadge status={idea.status} isChampion={idea.isChampion} tier={idea.tier} />
                              {userCommented && (
                                <span className="text-[10px] text-accent" title="You commented">{'\u2713'}</span>
                              )}
                              {ideaComments.length > 0 && (
                                <span className="text-[11px] text-muted bg-surface px-1.5 py-0.5 rounded-full">{ideaComments.length}</span>
                              )}
                              <span className="text-muted text-xs">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-border">
                            <CommentThread
                              comments={ideaComments}
                              onUpvote={handleUpvote}
                              upvoting={upvoting}
                            />

                            {userId && (
                              <div className="p-2 border-t border-border bg-background/50">
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="Add a comment..."
                                    value={commentText[idea.id] || ''}
                                    onChange={(e) => setCommentText(prev => ({ ...prev, [idea.id]: e.target.value }))}
                                    maxLength={2000}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handlePostComment(idea.id)
                                      }
                                    }}
                                    className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded-md text-xs text-foreground placeholder-muted/50 focus:outline-none focus:border-accent transition-colors"
                                  />
                                  <button
                                    onClick={() => handlePostComment(idea.id)}
                                    disabled={postingComment === idea.id || !commentText[idea.id]?.trim()}
                                    className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-xs rounded-md transition-colors font-medium"
                                  >
                                    {postingComment === idea.id ? '...' : 'Send'}
                                  </button>
                                </div>
                                {commentError && postingComment === null && (
                                  <p className="text-error text-[10px] mt-1">{commentError}</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        {/* ─── CELLS TAB ─── */}
        {activeTab === 'cells' && (
          <div>
            {status.cells.length === 0 ? (
              <EmptyState icon={'\u2B21'} title="No cells yet" subtitle="Cells form when voting begins." />
            ) : (
              <div className="space-y-4">
                {Array.from(new Set(status.cells.map(c => c.tier)))
                  .sort((a, b) => a - b)
                  .map(tier => {
                    const tierCells = status.cells.filter(c => c.tier === tier)
                    return (
                      <div key={tier}>
                        <p className="text-xs font-medium text-muted mb-2">Tier {tier}</p>
                        <div className="grid grid-cols-5 gap-2">
                          {tierCells.map((cell, i) => {
                            const isSelected = selectedCell === cell.id
                            const isComplete = cell.status === 'COMPLETED'
                            const isVoting = cell.status === 'VOTING'
                            return (
                              <button
                                key={cell.id}
                                onClick={() => setSelectedCell(isSelected ? null : cell.id)}
                                className={`aspect-square rounded-lg border text-sm font-mono font-bold transition-all ${
                                  isSelected
                                    ? 'bg-accent/20 border-accent/50 text-accent'
                                    : isComplete
                                    ? 'bg-success/8 border-success/25 text-success'
                                    : isVoting
                                    ? 'bg-warning/8 border-warning/25 text-warning animate-pulse'
                                    : 'bg-surface/90 backdrop-blur-sm border-border text-muted'
                                }`}
                              >
                                {i + 1}
                              </button>
                            )
                          })}
                        </div>

                        {tierCells.map(cell => {
                          if (selectedCell !== cell.id) return null
                          const ideas = cell.ideas || []
                          return (
                            <div key={`detail-${cell.id}`} className="mt-2 p-3 bg-surface/90 backdrop-blur-sm rounded-lg border border-accent/20 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-foreground">Cell {tierCells.indexOf(cell) + 1}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted">{cell._count.participants} voters &middot; {cell._count.votes} votes</span>
                                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                    cell.status === 'COMPLETED' ? 'bg-success/12 text-success'
                                      : cell.status === 'VOTING' ? 'bg-warning/12 text-warning'
                                      : 'bg-surface text-muted'
                                  }`}>
                                    {cell.status === 'COMPLETED' ? 'Done' : cell.status === 'VOTING' ? 'Voting' : cell.status}
                                  </span>
                                </div>
                              </div>
                              {ideas.length > 0 ? (
                                <div className="space-y-1.5">
                                  {ideas.map(idea => (
                                    <div key={idea.id} className="flex items-start justify-between gap-2 p-2 bg-background rounded-md">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs text-foreground truncate">{idea.text}</p>
                                        <p className="text-[10px] text-muted">by {idea.author.name}</p>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {idea.totalXP > 0 && (
                                          <span className="text-[11px] font-mono font-bold text-warning">{idea.totalXP}</span>
                                        )}
                                        <IdeaStatusBadge status={idea.status} isChampion={false} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted text-center py-2">No ideas loaded</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        {/* ─── MANAGE TAB ─── */}
        {activeTab === 'manage' && isCreator && (
          <div className="space-y-3">
            {actionError && <p className="text-error text-xs p-2.5 bg-error/8 rounded-lg border border-error/15">{actionError}</p>}
            {actionSuccess && <p className="text-success text-xs p-2.5 bg-success/8 rounded-lg border border-success/15">{actionSuccess}</p>}
            {startError && <p className="text-error text-xs p-2.5 bg-error/8 rounded-lg border border-error/15">{startError}</p>}

            {/* Progress stepper */}
            <div className="flex items-center gap-0 text-xs overflow-x-auto">
              {[
                { key: 'SUBMISSION', label: 'Ideas', color: 'accent' },
                { key: 'VOTING', label: 'Voting', color: 'warning' },
                { key: 'COMPLETED', label: 'Priority', color: 'success' },
                ...(status.accumulationEnabled ? [{ key: 'ACCUMULATING', label: 'Rolling', color: 'purple' }] : []),
              ].map((step, i, arr) => {
                const phases = arr.map(s => s.key)
                const currentIndex = phases.indexOf(status.phase)
                const stepIndex = i
                const isDone = stepIndex < currentIndex
                const isCurrent = step.key === status.phase
                return (
                  <div key={step.key} className="flex items-center">
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                      isCurrent ? `bg-${step.color} text-white` :
                      isDone ? `bg-${step.color}-bg text-${step.color} border border-${step.color}` :
                      'bg-surface text-muted border border-border'
                    }`}>
                      {isDone && <span>&#10003;</span>}
                      <span className="font-medium text-xs">{step.label}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className={`w-3 h-px mx-0.5 ${isDone ? 'bg-muted' : 'bg-border'}`} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Stats bar */}
            <div className="flex gap-2 text-xs text-muted flex-wrap">
              <span>{status.ideaCount} ideas</span>
              <span>{status.memberCount} members</span>
              {status.phase === 'VOTING' && (
                <>
                  <span>Tier {status.currentTier}</span>
                  <span>{status.cells.filter(c => c.status === 'VOTING').length} cells voting</span>
                  <span>{status.cells.filter(c => c.status === 'COMPLETED').length} done</span>
                </>
              )}
            </div>

            {/* ── SUBMISSION PHASE ── */}
            {status.phase === 'SUBMISSION' && (
              <>
                {status.memberGoal && status.memberGoal > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-muted mb-0.5">
                      <span>Member goal</span>
                      <span>{status.memberCount}/{status.memberGoal}</span>
                    </div>
                    <div className="h-1 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${Math.min(100, (status.memberCount / status.memberGoal) * 100)}%` }}
                      />
                    </div>
                    {status.memberCount >= status.memberGoal && (
                      <p className="text-xs text-success mt-0.5">Goal reached — voting will auto-start.</p>
                    )}
                  </div>
                )}
                {status.ideaGoal && (
                  <div>
                    <div className="flex justify-between text-xs text-muted mb-0.5">
                      <span>Idea goal</span>
                      <span>{status.ideaCount}/{status.ideaGoal}</span>
                    </div>
                    <div className="h-1 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${Math.min(100, (status.ideaCount / status.ideaGoal) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                <ManageAction
                  label={`Start Voting (${status.ideaCount} ideas)`}
                  description="Group ideas into cells of 5. Participants vote by allocating XP."
                  color="bg-warning hover:bg-warning-hover"
                  disabled={starting || status.ideaCount < 2}
                  loading={starting}
                  onClick={handleStartVoting}
                />
                {status.ideaCount < 2 && (
                  <p className="text-xs text-warning px-1">Need at least 2 ideas to start voting.</p>
                )}
              </>
            )}

            {/* ── VOTING PHASE ── */}
            {status.phase === 'VOTING' && (
              <>
                {/* Continuous flow: Close & Advance / Force Complete */}
                {status.continuousFlow && (
                  <ManageAction
                    label={status.submissionsClosed ? 'Force Complete Cells' : 'Close & Advance'}
                    description={status.submissionsClosed
                      ? 'Force-complete any open cells and advance the tier.'
                      : 'Stop accepting new submissions and force-complete open cells.'}
                    color="bg-accent hover:bg-accent-hover"
                    disabled={actionLoading === 'close'}
                    loading={actionLoading === 'close'}
                    onClick={() => handleFacilitatorAction('close', status.submissionsClosed ? 'Force complete' : 'Close & advance')}
                  />
                )}

                {/* Continuous flow: Declare Priority */}
                {status.continuousFlow && (
                  <ManageAction
                    label="Declare Priority"
                    description="Announce the current top idea as priority. Ends the chant."
                    color="bg-success hover:bg-success-hover"
                    disabled={actionLoading === 'declare'}
                    loading={actionLoading === 'declare'}
                    onClick={() => handleFacilitatorAction('declare', 'Declare priority')}
                  />
                )}

                {/* Advance Discussion → Open Voting */}
                {status.cells.some(c => c.status === 'DELIBERATING') && (
                  <ManageAction
                    label={`Open Voting (${status.cells.filter(c => c.status === 'DELIBERATING').length} cells discussing)`}
                    description="End discussion and open voting for all discussing cells."
                    color="bg-blue hover:bg-blue-hover"
                    disabled={actionLoading === 'advance-discussion'}
                    loading={actionLoading === 'advance-discussion'}
                    onClick={() => {
                      setActionLoading('advance-discussion')
                      setActionError('')
                      setActionSuccess('')
                      fetch(`/api/deliberations/${id}/advance-discussion`, { method: 'POST' })
                        .then(res => res.json().then(data => {
                          if (!res.ok) throw new Error(data.error || 'Failed')
                          setActionSuccess(`Voting opened for ${data.cellsAdvanced || 0} cells`)
                          fetchStatus()
                          setTimeout(() => setActionSuccess(''), 3000)
                        }))
                        .catch(err => setActionError(err.message))
                        .finally(() => setActionLoading(''))
                    }}
                  />
                )}

                {/* AI Resolve */}
                {!confirmAIResolve ? (
                  <ManageAction
                    label="AI Resolve"
                    description="AI agents fill empty seats in stuck cells and cast real votes."
                    color="bg-purple hover:bg-purple-hover"
                    disabled={actionLoading === 'ai-resolve'}
                    loading={actionLoading === 'ai-resolve'}
                    onClick={() => setConfirmAIResolve(true)}
                  />
                ) : (
                  <div className="border border-purple rounded-lg p-2.5 space-y-1.5">
                    <p className="text-xs text-purple font-medium">Let AI fill empty seats?</p>
                    <p className="text-xs text-foreground/80">AI voters will join cells that don&apos;t have enough participants, read all ideas, and cast votes.</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          setConfirmAIResolve(false)
                          handleFacilitatorAction('ai-resolve', 'AI resolve')
                        }}
                        disabled={actionLoading === 'ai-resolve'}
                        className="flex-1 bg-purple hover:bg-purple-hover disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded-lg text-xs transition-colors"
                      >
                        {actionLoading === 'ai-resolve' ? 'AI voting...' : 'Confirm'}
                      </button>
                      <button onClick={() => setConfirmAIResolve(false)} className="flex-1 border border-border text-foreground hover:bg-surface font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Force Complete Round */}
                {!confirmForce ? (
                  <ManageAction
                    label="Force Complete Round"
                    description="Ends all open cells immediately. Votes cast so far are tallied, non-voters skipped."
                    color="bg-orange hover:bg-orange-hover"
                    disabled={actionLoading === 'force-next-tier'}
                    loading={actionLoading === 'force-next-tier'}
                    onClick={() => setConfirmForce(true)}
                  />
                ) : (
                  <div className="border border-orange rounded-lg p-2.5 space-y-1.5">
                    <p className="text-xs text-orange font-medium">End voting now?</p>
                    <p className="text-xs text-foreground/80">Tallies votes cast so far. Non-voters are skipped. Top ideas advance.</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          setConfirmForce(false)
                          setActionLoading('force-next-tier')
                          setActionError('')
                          setActionSuccess('')
                          fetch(`/api/deliberations/${id}/force-next-tier`, { method: 'POST' })
                            .then(res => res.json().then(data => {
                              if (!res.ok) throw new Error(data.error || 'Failed')
                              setActionSuccess(`Processed ${data.cellsProcessed || 0} cells`)
                              fetchStatus()
                              setTimeout(() => setActionSuccess(''), 3000)
                            }))
                            .catch(err => setActionError(err.message))
                            .finally(() => setActionLoading(''))
                        }}
                        disabled={actionLoading === 'force-next-tier'}
                        className="flex-1 bg-orange hover:bg-orange-hover disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded-lg text-xs transition-colors"
                      >
                        {actionLoading === 'force-next-tier' ? 'Processing...' : 'Confirm'}
                      </button>
                      <button onClick={() => setConfirmForce(false)} className="flex-1 border border-border text-foreground hover:bg-surface font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Extend Timer */}
                <ManageAction
                  label="Extend +15min"
                  description="Add 15 minutes to the voting timer for all active cells."
                  color="bg-accent hover:bg-accent-hover"
                  disabled={actionLoading === 'extend'}
                  loading={actionLoading === 'extend'}
                  onClick={() => handleFacilitatorAction('extend', 'Extend timer')}
                />

                {/* Reopen Submissions */}
                {status.continuousFlow && status.submissionsClosed && (
                  <ManageAction
                    label="Reopen Submissions"
                    description="Accept new ideas again. Voting continues."
                    color="bg-accent hover:bg-accent-hover"
                    disabled={actionLoading === 'reopen'}
                    loading={actionLoading === 'reopen'}
                    onClick={() => handleFacilitatorAction('reopen', 'Reopen submissions')}
                  />
                )}
                {!status.continuousFlow && (
                  <ManageAction
                    label="Reopen for Ideas"
                    description="Pause voting and reopen idea submissions."
                    color="bg-accent hover:bg-accent-hover"
                    disabled={actionLoading === 'reopen'}
                    loading={actionLoading === 'reopen'}
                    onClick={() => handleFacilitatorAction('reopen', 'Reopen')}
                  />
                )}
              </>
            )}

            {/* ── ACCUMULATING PHASE ── */}
            {status.phase === 'ACCUMULATING' && (
              <>
                <p className="text-xs text-purple">Accepting challenger ideas. Start Round 2 when enough challengers are in.</p>
                {!confirmChallenge ? (
                  <ManageAction
                    label="Start Round 2"
                    description="Challenger ideas compete against the current priority through tiered voting."
                    color="bg-purple hover:bg-purple-hover"
                    disabled={actionLoading === 'start-challenge'}
                    loading={actionLoading === 'start-challenge'}
                    onClick={() => setConfirmChallenge(true)}
                  />
                ) : (
                  <div className="border border-purple rounded-lg p-2.5 space-y-1.5">
                    <p className="text-xs text-purple font-medium">Start challenge round?</p>
                    <p className="text-xs text-foreground/80">Challenger ideas compete against the current priority through tiered voting.</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          setConfirmChallenge(false)
                          setActionLoading('start-challenge')
                          setActionError('')
                          setActionSuccess('')
                          fetch(`/api/deliberations/${id}/start-challenge`, { method: 'POST' })
                            .then(res => res.json().then(data => {
                              if (!res.ok) throw new Error(data.error || 'Failed')
                              setActionSuccess('Challenge round started!')
                              fetchStatus()
                              setTimeout(() => setActionSuccess(''), 3000)
                            }))
                            .catch(err => setActionError(err.message))
                            .finally(() => setActionLoading(''))
                        }}
                        disabled={actionLoading === 'start-challenge'}
                        className="flex-1 bg-purple hover:bg-purple-hover disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded-lg text-xs transition-colors"
                      >
                        {actionLoading === 'start-challenge' ? 'Starting...' : 'Confirm'}
                      </button>
                      <button onClick={() => setConfirmChallenge(false)} className="flex-1 border border-border text-foreground hover:bg-surface font-medium px-3 py-1.5 rounded-lg text-xs transition-colors">Cancel</button>
                    </div>
                  </div>
                )}
                <ManageAction
                  label="Close Chant"
                  description="Declare the current priority as final and close this chant."
                  color="border border-success text-success hover:bg-success-bg"
                  disabled={actionLoading === 'close-chant'}
                  loading={actionLoading === 'close-chant'}
                  onClick={() => handleFacilitatorAction('declare', 'Close chant')}
                />
                <ManageAction
                  label="Reopen for Ideas"
                  description="Reopen idea submissions."
                  color="bg-accent hover:bg-accent-hover"
                  disabled={actionLoading === 'reopen'}
                  loading={actionLoading === 'reopen'}
                  onClick={() => handleFacilitatorAction('reopen', 'Reopen')}
                />
              </>
            )}

            {/* ── COMPLETED PHASE ── */}
            {status.phase === 'COMPLETED' && (
              <>
                <div className="p-3 bg-success/8 border border-success/20 rounded-lg">
                  <p className="text-xs text-success font-medium">Chant Complete</p>
                  <p className="text-xs text-foreground/80 mt-0.5">The priority has been declared.</p>
                </div>
                {status.accumulationEnabled && (
                  <ManageAction
                    label="Reopen for Challengers"
                    description="Accept new challenger ideas and allow Round 2."
                    color="bg-purple hover:bg-purple-hover"
                    disabled={actionLoading === 'reopen'}
                    loading={actionLoading === 'reopen'}
                    onClick={() => handleFacilitatorAction('reopen', 'Reopen for challengers')}
                  />
                )}
              </>
            )}

            {/* ── Invite Link ── */}
            {status.inviteCode && (
              <div className="p-3 bg-surface/90 backdrop-blur-sm rounded-lg border border-border">
                <p className="text-xs text-muted mb-1.5 font-medium">Invite Link</p>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${status.inviteCode}`}
                    className="flex-1 bg-background border border-border text-foreground rounded px-2 py-1.5 text-xs font-mono truncate"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/invite/${status.inviteCode}`)
                      setCopiedInvite(true)
                      setTimeout(() => setCopiedInvite(false), 2000)
                    }}
                    className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded text-xs transition-colors shrink-0"
                  >
                    {copiedInvite ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Dashboard Link ── */}
            <div className="pt-2 flex gap-2">
              <Link
                href={`/dashboard/${id}`}
                className="flex-1 text-center text-xs text-accent border border-accent/30 hover:bg-accent/8 rounded-lg py-2 transition-colors"
              >
                Full Dashboard &rarr;
              </Link>
              <Link
                href={`/dashboard/${id}/analytics`}
                className="flex-1 text-center text-xs text-muted border border-border hover:bg-surface rounded-lg py-2 transition-colors"
              >
                Analytics &rarr;
              </Link>
            </div>
          </div>
        )}

        </div>

      </div>
    </div>
  )
}

// ─── Helper Components ───

function CommentThread({ comments, onUpvote, upvoting }: {
  comments: CommentInfo[]
  onUpvote?: (id: string) => void
  upvoting?: string | null
}) {
  if (comments.length === 0) {
    return <p className="px-3 py-2 text-[11px] text-muted text-center">No comments yet.</p>
  }
  return (
    <div className="max-h-64 overflow-y-auto">
      {comments.map(comment => (
        <div key={comment.id} className="px-3 py-2 border-b border-border/40 last:border-0">
          <div className="flex items-start gap-2">
            {comment.user.image ? (
              <img src={comment.user.image} alt="" className="w-5 h-5 rounded-full shrink-0 mt-0.5" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-accent/15 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-medium text-foreground">{comment.user.name}</span>
                <span className="text-[10px] text-muted">{formatTimeAgo(comment.createdAt)}</span>
                {(comment.spreadCount ?? 0) > 0 && (
                  <span className="text-[10px] text-accent">{'\u2191'} spreading</span>
                )}
              </div>
              <p className="text-xs text-foreground/80 mt-0.5 break-words leading-relaxed">{comment.text}</p>
              {onUpvote && (
                <button
                  onClick={(e) => { e.stopPropagation(); onUpvote(comment.id) }}
                  disabled={upvoting === comment.id}
                  className={`mt-1 flex items-center gap-1 text-[10px] transition-colors ${
                    comment.userHasUpvoted
                      ? 'text-accent'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  <span>{comment.userHasUpvoted ? '\u25B2' : '\u25B3'}</span>
                  <span>{comment.upvoteCount > 0 ? comment.upvoteCount : 'Upvote'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ icon, title, bold, subtitle }: { icon: string; title: string; bold?: boolean; subtitle?: React.ReactNode }) {
  return (
    <div className="p-8 text-center">
      <div className="text-2xl mb-3 opacity-40">{icon}</div>
      <p className={`text-sm text-muted ${bold ? 'font-bold' : 'font-medium'} mb-1`}>{title}</p>
      {subtitle && <p className="text-xs text-muted leading-relaxed">{subtitle}</p>}
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="p-2 bg-surface/90 backdrop-blur-sm rounded-lg border border-border text-center">
      <p className="text-base font-mono font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  )
}

function ManageAction({ label, description, color, disabled, loading, onClick }: {
  label: string
  description: string
  color: string
  disabled: boolean
  loading: boolean
  onClick: () => void
}) {
  const isOutline = color.startsWith('border')
  return (
    <div>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full py-2.5 ${color} disabled:opacity-50 ${isOutline ? '' : 'text-white'} text-xs font-medium rounded-lg transition-colors shadow-sm`}
      >
        {loading ? '...' : label}
      </button>
      <p className="text-xs text-muted mt-1.5 leading-relaxed">{description}</p>
    </div>
  )
}

function PhaseBadge({ phase }: { phase: string }) {
  const config: Record<string, { label: string; color: string }> = {
    SUBMISSION: { label: 'Accepting Ideas', color: 'bg-accent/15 text-accent' },
    VOTING: { label: 'Voting', color: 'bg-warning/15 text-warning' },
    COMPLETED: { label: 'Complete', color: 'bg-success/15 text-success' },
    ACCUMULATING: { label: 'Rolling', color: 'bg-purple/15 text-purple' },
  }
  const { label, color } = config[phase] || { label: phase, color: 'bg-muted/15 text-muted' }
  return <span className={`px-2 py-0.5 text-[11px] rounded-full font-medium shrink-0 ${color}`}>{label}</span>
}

function IdeaStatusBadge({ status, isChampion, tier }: { status: string; isChampion: boolean; tier?: number }) {
  if (isChampion) return <span className="text-[11px] text-success font-bold">Priority{tier ? ` (Tier ${tier})` : ''}</span>
  const map: Record<string, { label: string; color: string; showTier?: boolean }> = {
    ADVANCING: { label: 'Advancing', color: 'text-accent' },
    IN_VOTING: { label: 'In Cell', color: 'text-success' },
    ELIMINATED: { label: 'Kept', color: 'text-muted', showTier: true },
    RETIRED: { label: 'Kept', color: 'text-muted', showTier: true },
    SUBMITTED: { label: 'Submitted', color: 'text-accent' },
    PENDING: { label: 'Waiting', color: 'text-muted' },
  }
  const badge = map[status]
  if (!badge || !badge.label) return null
  return <span className={`text-[11px] ${badge.color}`}>{badge.label}{badge.showTier && tier ? ` (Tier ${tier})` : ''}</span>
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}
