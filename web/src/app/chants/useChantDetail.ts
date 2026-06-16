'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface DetailIdea {
  id: string
  text: string
  author: { id: string; name: string }
  totalXP: number
  totalVotes: number
  status: string
  tier: number
  isChampion: boolean
}

export interface DetailCell {
  id: string
  tier: number
  status: string
  ideas: DetailIdea[]
  votedCount: number
  memberCount: number
}

export interface ChantDetail {
  id: string
  question: string
  description: string | null
  phase: 'SUBMISSION' | 'VOTING' | 'COMPLETED' | 'ACCUMULATING'
  currentTier: number
  memberCount: number
  ideaCount: number
  creator: { id: string; name: string }
  champion: DetailIdea | null
  ideas: DetailIdea[]
  cells: DetailCell[]
  hasVoted: boolean
  isMember: boolean
  myCellIds: string[]
  inviteCode: string | null
  continuousFlow: boolean
  myIdea: { id: string; text: string } | null
}

export function useChantDetail(chantId: string | null, skipAutoJoin = false) {
  const [detail, setDetail] = useState<ChantDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const prevIdRef = useRef<string | null>(null)
  const autoJoinedRef = useRef<Set<string>>(new Set())

  const fetchDetail = useCallback(async (id: string, isInitial = false) => {
    try {
      const res = await fetch(`/api/deliberations/${id}/status`)
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (!mountedRef.current) return

      const mapped: ChantDetail = {
        id: data.id,
        question: data.question,
        description: data.description,
        phase: data.phase,
        currentTier: data.currentTier ?? 0,
        memberCount: data.memberCount ?? 0,
        ideaCount: data.ideaCount ?? 0,
        creator: data.creator || { id: '', name: 'Anonymous' },
        champion: data.champion || null,
        ideas: (data.ideas || []).map((i: any) => ({
          id: i.id,
          text: i.text,
          author: i.author || { id: '', name: 'Anonymous' },
          totalXP: i.totalXP ?? 0,
          totalVotes: i.totalVotes ?? 0,
          status: i.status,
          tier: i.tier ?? 0,
          isChampion: i.isChampion ?? false,
        })),
        cells: (data.cells || []).map((c: any) => ({
          id: c.id,
          tier: c.tier,
          status: c.status,
          ideas: (c.ideas || []).map((i: any) => ({
            id: i.id,
            text: i.text,
            author: i.author || { id: '', name: 'Anonymous' },
            totalXP: i.totalXP ?? 0,
            totalVotes: i.totalVotes ?? 0,
            status: i.status || '',
            tier: i.tier ?? 0,
            isChampion: i.isChampion ?? false,
          })),
          votedCount: c.votedCount ?? 0,
          memberCount: c.memberCount ?? 0,
        })),
        hasVoted: data.hasVoted ?? false,
        isMember: data.isMember ?? false,
        myCellIds: data.myCellIds || [],
        inviteCode: data.inviteCode || null,
        continuousFlow: data.continuousFlow ?? false,
        myIdea: data.myIdea || null,
      }

      setDetail(mapped)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      if (mountedRef.current && isInitial) setLoading(false)
    }
  }, [])

  // Fetch on chantId change — eagerly join in parallel to avoid extra round trip
  useEffect(() => {
    mountedRef.current = true
    if (!chantId) {
      setDetail(null)
      setLoading(false)
      setError(null)
      prevIdRef.current = null
      return
    }
    if (chantId !== prevIdRef.current) {
      prevIdRef.current = chantId
      setLoading(true)
      setDetail(null)

      // Fire join + fetch in parallel — join is idempotent so it's safe to call eagerly
      if (!skipAutoJoin && !autoJoinedRef.current.has(chantId)) {
        autoJoinedRef.current.add(chantId)
        // Join first, then fetch (so the fetch reflects membership)
        fetch(`/api/deliberations/${chantId}/join`, { method: 'POST' })
          .then(() => { if (mountedRef.current) fetchDetail(chantId, true) })
          .catch(() => { if (mountedRef.current) fetchDetail(chantId, true) })
      } else {
        fetchDetail(chantId, true)
      }
    }
    return () => { mountedRef.current = false }
  }, [chantId, fetchDetail, skipAutoJoin])

  // Polling — 5s during VOTING, 15s otherwise
  useEffect(() => {
    if (!chantId) return
    const phase = detail?.phase
    if (phase === 'COMPLETED') return
    const interval = phase === 'VOTING' ? 5000 : 15000
    const timer = setInterval(() => fetchDetail(chantId, false), interval)
    return () => clearInterval(timer)
  }, [chantId, detail?.phase, fetchDetail])

  const refresh = useCallback(() => {
    if (chantId) fetchDetail(chantId, false)
  }, [chantId, fetchDetail])

  const submitVote = useCallback(async (allocations: { ideaId: string; points: number }[]) => {
    if (!detail || detail.myCellIds.length === 0) {
      throw new Error('Not in a cell')
    }
    const activeCell = detail.cells.find(
      c => detail.myCellIds.includes(c.id) && c.status === 'VOTING'
    )
    if (!activeCell) throw new Error('No active voting cell found')

    const res = await fetch(`/api/cells/${activeCell.id}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allocations }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        await new Promise(r => setTimeout(r, 500))
        const retry = await fetch(`/api/cells/${activeCell.id}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ allocations }),
        })
        if (!retry.ok) {
          const d = await retry.json().catch(() => ({}))
          throw new Error(d.error || 'Failed to submit vote')
        }
      } else {
        throw new Error(data.error || 'Failed to submit vote')
      }
    }
    if (chantId) fetchDetail(chantId, false)
  }, [detail, chantId, fetchDetail])

  const submitIdea = useCallback(async (text: string) => {
    if (!chantId) throw new Error('No chant selected')
    const res = await fetch(`/api/deliberations/${chantId}/ideas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to submit idea')
    }
    if (chantId) fetchDetail(chantId, false)
  }, [chantId, fetchDetail])

  const joinChant = useCallback(async () => {
    if (!chantId) throw new Error('No chant selected')
    const res = await fetch(`/api/deliberations/${chantId}/join`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to join')
    }
    if (chantId) fetchDetail(chantId, false)
  }, [chantId, fetchDetail])

  const leaveChant = useCallback(async () => {
    if (!chantId) return
    // Server only removes if user hasn't participated (no ideas, votes, comments)
    await fetch(`/api/deliberations/${chantId}/leave`, { method: 'POST' }).catch(() => {})
    // Reset auto-join tracking so re-docking will auto-join again
    autoJoinedRef.current.delete(chantId)
  }, [chantId])

  return { detail, loading, error, refresh, submitVote, submitIdea, joinChant, leaveChant }
}
