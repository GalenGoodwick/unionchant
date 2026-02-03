'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import type { Deliberation, Cell, Idea } from '@/components/deliberation/types'

export function useDeliberation(id: string) {
  const { data: session } = useSession()
  const router = useRouter()
  const { showToast } = useToast()

  const [deliberation, setDeliberation] = useState<Deliberation | null>(null)
  const [cells, setCells] = useState<Cell[]>([])
  const [loading, setLoading] = useState(true)
  const [cellsLoaded, setCellsLoaded] = useState(false)

  // Action states
  const [newIdea, setNewIdea] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [joining, setJoining] = useState(false)
  const [startingVote, setStartingVote] = useState(false)
  const [startingChallenge, setStartingChallenge] = useState(false)
  const [voting, setVoting] = useState<string | null>(null)
  const [enteringVoting, setEnteringVoting] = useState(false)

  // Invite states
  const [inviteEmails, setInviteEmails] = useState('')
  const [sendingInvites, setSendingInvites] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ sent: number; failed: number } | null>(null)
  const [copiedInviteLink, setCopiedInviteLink] = useState(false)

  // History for JourneyTimeline
  const [history, setHistory] = useState<Record<string, unknown> | null>(null)

  // Fetch functions
  const fetchDeliberation = useCallback(async () => {
    try {
      const res = await fetch(`/api/deliberations/${id}`)
      if (!res.ok) {
        if (res.status === 404) {
          showToast('This talk no longer exists or has been removed.', 'error')
          router.push('/talks')
        }
        return
      }
      setDeliberation(await res.json())
    } catch {
      showToast('Could not load this talk. It may have moved or ended.', 'error')
      router.push('/talks')
    } finally {
      setLoading(false)
    }
  }, [id, router, showToast])

  const fetchCells = useCallback(async () => {
    if (!session) return
    try {
      const res = await fetch(`/api/deliberations/${id}/cells`)
      if (res.ok) {
        setCells(await res.json())
        setCellsLoaded(true)
      }
    } catch (err) {
      console.error('Failed to fetch cells:', err)
    }
  }, [id, session])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/deliberations/${id}/history`)
      if (res.ok) setHistory(await res.json())
    } catch (err) {
      console.error('Failed to fetch history:', err)
    }
  }, [id])

  const handleRefresh = useCallback(() => {
    fetchCells()
    fetchDeliberation()
  }, [fetchCells, fetchDeliberation])

  // Initial fetch
  useEffect(() => { fetchDeliberation() }, [fetchDeliberation])

  // Polling for all active phases (not COMPLETED)
  useEffect(() => {
    if (!deliberation || deliberation.phase === 'COMPLETED') return
    const interval = deliberation.phase === 'VOTING' ? 5000 : 15000
    const timer = setInterval(() => {
      fetchDeliberation()
      fetchCells()
    }, interval)
    return () => clearInterval(timer)
  }, [deliberation?.phase, fetchDeliberation, fetchCells])

  // Fetch cells when phase changes
  useEffect(() => {
    if (deliberation?.phase === 'VOTING' || deliberation?.phase === 'COMPLETED') {
      fetchCells()
    }
  }, [deliberation?.phase, session, fetchCells])

  // Fetch history on mount + phase changes
  useEffect(() => {
    if (deliberation) fetchHistory()
  }, [deliberation?.phase, fetchHistory])

  // Action handlers
  const handleJoin = async () => {
    if (!session) { router.push('/auth/signin'); return }
    setJoining(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/join`, { method: 'POST' })
      if (res.ok) fetchDeliberation()
    } finally {
      setJoining(false)
    }
  }

  const handleSubmitIdea = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newIdea.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newIdea }),
      })
      if (res.ok) { setNewIdea(''); fetchDeliberation() }
    } finally {
      setSubmitting(false)
    }
  }

  const handleStartVoting = async () => {
    setStartingVote(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/start-voting`, { method: 'POST' })
      if (res.ok) { fetchDeliberation(); fetchCells() }
      else { const d = await res.json(); showToast(d.error || 'Failed', 'error') }
    } finally {
      setStartingVote(false)
    }
  }

  const handleStartChallenge = async () => {
    setStartingChallenge(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/start-challenge`, { method: 'POST' })
      if (res.ok) { fetchDeliberation(); fetchCells() }
      else { const d = await res.json(); showToast(d.error || 'Failed', 'error') }
    } finally {
      setStartingChallenge(false)
    }
  }

  const handleEnterVoting = async () => {
    if (!session) { router.push('/auth/signin'); return }
    setEnteringVoting(true)
    try {
      await fetch(`/api/deliberations/${id}/join`, { method: 'POST' })
      const res = await fetch(`/api/deliberations/${id}/enter`, { method: 'POST' })
      if (res.ok) {
        fetchCells()
        fetchDeliberation()
      } else {
        const data = await res.json()
        showToast(data.error || 'No spots available', 'error')
      }
    } catch (err) {
      console.error('Enter voting error:', err)
      showToast('Failed to join voting', 'error')
    } finally {
      setEnteringVoting(false)
    }
  }

  const handleVote = async (cellId: string, ideaId: string) => {
    setVoting(ideaId)
    try {
      const res = await fetch(`/api/cells/${cellId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId }),
      })
      if (res.ok) { showToast('Vote recorded', 'success'); fetchCells(); fetchDeliberation() }
      else { const d = await res.json(); showToast(d.error || 'Failed', 'error') }
    } finally {
      setVoting(null)
    }
  }

  const handleSendInvites = async (e: React.FormEvent) => {
    e.preventDefault()
    const emails = inviteEmails.split(/[,\n]/).map(e => e.trim()).filter(Boolean)
    if (emails.length === 0) return
    setSendingInvites(true)
    setInviteResult(null)
    try {
      const res = await fetch(`/api/deliberations/${id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      })
      if (res.ok) {
        const data = await res.json()
        setInviteResult({ sent: data.sent, failed: data.failed })
        setInviteEmails('')
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to send invites', 'error')
      }
    } finally {
      setSendingInvites(false)
    }
  }

  const handleCopyInviteLink = () => {
    if (deliberation?.inviteCode) {
      const baseUrl = window.location.origin
      navigator.clipboard.writeText(`${baseUrl}/invite/${deliberation.inviteCode}`)
      setCopiedInviteLink(true)
      setTimeout(() => setCopiedInviteLink(false), 2000)
    }
  }

  // Derived state
  const winner: Idea | undefined = deliberation
    ? deliberation.ideas.find(i => i.status === 'WINNER')
      || (deliberation.championId ? deliberation.ideas.find(i => i.id === deliberation.championId) : undefined)
    : undefined

  const defender = deliberation?.ideas.find(i => i.status === 'DEFENDING')

  const activeCells = cells.filter(
    c => c.status === 'VOTING' && c.votes.length === 0 && deliberation && c.tier === deliberation.currentTier
  )

  const votedCells = cells.filter(c => c.status !== 'VOTING' || c.votes.length > 0)

  const currentTierCells = deliberation
    ? cells.filter(c => c.tier === deliberation.currentTier)
    : []

  const hasVotedInCurrentTier = currentTierCells.some(c => c.votes.length > 0)
  const isInCurrentTier = currentTierCells.length > 0
  const isCreator = deliberation?.isCreator || false

  const effectivePhase = deliberation
    ? (deliberation.phase === 'ACCUMULATING' && !winner) ? 'VOTING' : deliberation.phase
    : 'SUBMISSION'

  const phaseColor = {
    SUBMISSION: 'text-accent',
    VOTING: 'text-warning',
    COMPLETED: 'text-success',
    ACCUMULATING: 'text-purple',
  }[effectivePhase] || 'text-muted'

  return {
    // Core data
    deliberation,
    cells,
    loading,
    cellsLoaded,
    session,

    // Derived state
    winner,
    defender,
    activeCells,
    votedCells,
    currentTierCells,
    hasVotedInCurrentTier,
    isInCurrentTier,
    isCreator,
    effectivePhase,
    phaseColor,

    // Idea submission
    newIdea,
    setNewIdea,
    submitting,
    handleSubmitIdea,

    // Actions
    joining,
    handleJoin,
    startingVote,
    handleStartVoting,
    startingChallenge,
    handleStartChallenge,
    enteringVoting,
    handleEnterVoting,
    voting,
    handleVote,
    handleRefresh,

    // History
    history,

    // Invites
    inviteEmails,
    setInviteEmails,
    sendingInvites,
    inviteResult,
    copiedInviteLink,
    handleSendInvites,
    handleCopyInviteLink,
  }
}
