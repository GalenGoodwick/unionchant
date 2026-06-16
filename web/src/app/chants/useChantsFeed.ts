'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface Chant {
  id: string
  question: string
  description?: string | null
  phase: 'SUBMISSION' | 'VOTING' | 'COMPLETED' | 'ACCUMULATING'
  tier: number
  participants: number
  ideas: number
  cells: number
  upvotes: number
  community: string
  creator: string
  createdAt: string
  createdAtRaw: string
  champion?: { text: string } | null
  userHasUpvoted: boolean
  isMember: boolean
  isCreator: boolean
  hasSubmittedIdea: boolean
  hasVoted: boolean
  viewerCount: number
  voteCount: number
  isPinned: boolean
  tags: string[]
  continuousFlow: boolean
}

const POLL_INTERVAL = 30_000

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d`
}

export function useChantsFeed() {
  const [chants, setChants] = useState<Chant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchFeed = useCallback(async (isInitial = false) => {
    try {
      const res = await fetch('/api/deliberations')
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status}`)
      }
      const data = await res.json()
      if (!mountedRef.current) return

      const mapped: Chant[] = data.map((d: any) => ({
        id: d.id,
        question: d.question,
        description: d.description || null,
        phase: d.phase,
        tier: d.currentTier ?? 0,
        participants: d._count?.members ?? 0,
        ideas: d._count?.ideas ?? 0,
        cells: d._count?.cells ?? 0,
        upvotes: d.upvoteCount ?? 0,
        community: d.community?.name || 'Public',
        creator: d.creator?.name || 'Anonymous',
        createdAt: relativeTime(d.createdAt),
        createdAtRaw: d.createdAt,
        champion: d.champion ? { text: d.champion.text } : null,
        userHasUpvoted: d.userHasUpvoted ?? false,
        isMember: d.userStatus?.isMember ?? false,
        isCreator: d.userStatus?.isCreator ?? false,
        hasSubmittedIdea: d.userStatus?.hasSubmittedIdea ?? false,
        hasVoted: d.userStatus?.hasVotedInCurrentTier ?? false,
        viewerCount: d.viewerCount ?? 0,
        voteCount: d.voteCount ?? 0,
        isPinned: d.isPinned ?? false,
        tags: d.tags || [],
        continuousFlow: d.continuousFlow ?? false,
      }))

      setChants(mapped)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : 'Network error'
      setError(msg)
    } finally {
      if (mountedRef.current && isInitial) setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true
    fetchFeed(true)
    return () => { mountedRef.current = false }
  }, [fetchFeed])

  // Polling
  useEffect(() => {
    const timer = setInterval(() => fetchFeed(false), POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [fetchFeed])

  const refresh = useCallback(() => {
    fetchFeed(false)
  }, [fetchFeed])

  const upvote = useCallback(async (id: string) => {
    // Optimistic update
    setChants(prev => prev.map(c => {
      if (c.id !== id) return c
      const wasUpvoted = c.userHasUpvoted
      return {
        ...c,
        upvotes: wasUpvoted ? c.upvotes - 1 : c.upvotes + 1,
        userHasUpvoted: !wasUpvoted,
      }
    }))

    try {
      const res = await fetch(`/api/deliberations/${id}/upvote`, { method: 'POST' })
      if (!res.ok) {
        // Revert on error
        setChants(prev => prev.map(c => {
          if (c.id !== id) return c
          const wasUpvoted = c.userHasUpvoted
          return {
            ...c,
            upvotes: wasUpvoted ? c.upvotes - 1 : c.upvotes + 1,
            userHasUpvoted: !wasUpvoted,
          }
        }))
      } else {
        const data = await res.json()
        // Sync with server count
        setChants(prev => prev.map(c => {
          if (c.id !== id) return c
          return { ...c, upvotes: data.upvoteCount, userHasUpvoted: data.upvoted }
        }))
      }
    } catch {
      // Revert on network error
      setChants(prev => prev.map(c => {
        if (c.id !== id) return c
        const wasUpvoted = c.userHasUpvoted
        return {
          ...c,
          upvotes: wasUpvoted ? c.upvotes - 1 : c.upvotes + 1,
          userHasUpvoted: !wasUpvoted,
        }
      }))
    }
  }, [])

  const prepend = useCallback((chant: Chant) => {
    setChants(prev => [chant, ...prev.filter(c => c.id !== chant.id)])
  }, [])

  return { chants, loading, error, refresh, upvote, prepend }
}
