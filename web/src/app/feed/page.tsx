'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import VoteNowCard from '@/components/feed/cards/VoteNowCard'
import JoinVotingCard from '@/components/feed/cards/JoinVotingCard'
import SubmitIdeasCard from '@/components/feed/cards/SubmitIdeasCard'
import ChampionCard from '@/components/feed/cards/ChampionCard'
import BottomSheet from '@/components/sheets/BottomSheet'
import DeliberationSheet from '@/components/sheets/DeliberationSheet'
import Onboarding from '@/components/Onboarding'
import { NotificationBanner } from '@/components/NotificationSettings'
import { useOnboarding } from '@/hooks/useOnboarding'
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling'
import UserGuide from '@/components/UserGuide'
import Spinner from '@/components/Spinner'
import type { FeedItem } from '@/types/feed'

export default function FeedPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { needsOnboarding, completeOnboarding } = useOnboarding()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)


  // Show guide for first-time authenticated users
  useEffect(() => {
    const hasSeenGuide = localStorage.getItem('hasSeenGuide')
    if (!hasSeenGuide && status === 'authenticated') {
      const timer = setTimeout(() => setShowGuide(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [status])

  const closeGuide = () => {
    setShowGuide(false)
    localStorage.setItem('hasSeenGuide', 'true')
  }

  // Track cards for cells user has voted in (to preserve while awaiting results)
  // Store full card data so it survives page refresh
  const [preservedVoteCards, setPreservedVoteCards] = useState<Map<string, FeedItem>>(new Map())
  const [preservedCardsLoaded, setPreservedCardsLoaded] = useState(false)

  // Load preserved cards from localStorage on mount (filter out expired)
  useEffect(() => {
    const saved = localStorage.getItem('preservedVoteCards')
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as [string, FeedItem][]
        const now = Date.now()
        const valid = parsed.filter(([, item]) => {
          // Remove expired voting cells from cache
          if (item.cell?.votingDeadline && item.cell.status !== 'COMPLETED') {
            if (new Date(item.cell.votingDeadline).getTime() < now) return false
          }
          return true
        })
        setPreservedVoteCards(new Map(valid))
        localStorage.setItem('preservedVoteCards', JSON.stringify(valid))
      } catch {
        // Ignore parse errors
      }
    }
    setPreservedCardsLoaded(true)
  }, [])

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null)

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/feed')
      if (!res.ok) throw new Error('Failed to fetch feed')
      const data = await res.json()
      const newItems = data.items as FeedItem[]

      // Deduplicate new items by cell ID (for vote_now) or deliberation ID (for others)
      const seenKeys = new Set<string>()
      const deduplicatedItems = newItems.filter(item => {
        const key = item.cell?.id || `${item.type}-${item.deliberation.id}`
        if (seenKeys.has(key)) return false
        seenKeys.add(key)
        return true
      })

      // Get cell IDs from new items to check which preserved cards are still valid
      const activeCellIds = new Set(newItems.filter(i => i.cell).map(i => i.cell!.id))

      // Clean up stale preserved cards (cells that no longer exist in the API response)
      const staleCardIds: string[] = []
      preservedVoteCards.forEach((card, cellId) => {
        if (!activeCellIds.has(cellId)) {
          staleCardIds.push(cellId)
        }
      })

      // Remove stale cards from storage
      if (staleCardIds.length > 0) {
        setPreservedVoteCards(prev => {
          const updated = new Map(prev)
          staleCardIds.forEach(id => updated.delete(id))
          localStorage.setItem('preservedVoteCards', JSON.stringify([...updated]))
          return updated
        })
      }

      // Get preserved cards from storage that should still be shown
      const cardsToPreserve = Array.from(preservedVoteCards.values()).filter(p =>
        !staleCardIds.includes(p.cell?.id || '') &&
        !deduplicatedItems.some(n => n.cell?.id === p.cell?.id)
      )

      // Filter out duplicate deliberations - if we have a preserved vote card,
      // don't also show a champion/predict card for the same deliberation
      const preservedDeliberationIds = new Set(cardsToPreserve.map(p => p.deliberation.id))
      const filteredNewItems = deduplicatedItems.filter(n =>
        n.type === 'vote_now' ||
        !preservedDeliberationIds.has(n.deliberation.id)
      )

      // Combine: preserved cards first (higher priority), then new items
      setItems([...cardsToPreserve, ...filteredNewItems])
      setError(null)
    } catch (err) {
      console.error('Feed error:', err)
      // Only show error on initial load, not during background polling
      if (loading) setError('Failed to load feed')
    } finally {
      setLoading(false)
    }
  }, [preservedVoteCards])

  // Preserve a vote card (called from VoteNowCard after voting)
  const preserveVoteCard = useCallback((item: FeedItem) => {
    if (!item.cell) return
    setPreservedVoteCards(prev => {
      const updated = new Map(prev)
      updated.set(item.cell!.id, item)
      // Persist to localStorage
      localStorage.setItem('preservedVoteCards', JSON.stringify([...updated]))
      return updated
    })
  }, [])

  // Dismiss a preserved vote card
  const dismissVoteCard = useCallback((cellId: string) => {
    setPreservedVoteCards(prev => {
      const updated = new Map(prev)
      updated.delete(cellId)
      localStorage.setItem('preservedVoteCards', JSON.stringify([...updated]))
      return updated
    })
    // Also remove from items immediately
    setItems(prev => prev.filter(item => item.cell?.id !== cellId))
  }, [])

  // Fetch immediately on mount once preserved cards are loaded
  useEffect(() => {
    if (preservedCardsLoaded) fetchFeed()
  }, [preservedCardsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Adaptive polling: fast (3s) after user activity, slow (15s) when idle, pauses on hidden tab
  const { signalActivity } = useAdaptivePolling(
    () => { if (preservedCardsLoaded && !loading) fetchFeed() },
    { slowInterval: 15000, fastInterval: 3000, fastModeDuration: 30000 }
  )

  const openSheet = (item: FeedItem) => {
    setSelectedItem(item)
    setSheetOpen(true)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    setSelectedItem(null)
  }

  const handleAction = () => {
    // Refresh feed after an action (vote, predict, submit)
    signalActivity() // Switch to fast polling
    fetchFeed()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-8">
          <div className="flex flex-col items-center gap-6 py-12">
            <Spinner size="lg" label="Loading feed" />
            <div className="animate-pulse space-y-4 w-full">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-48 bg-surface rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Onboarding modal for new users */}
      {needsOnboarding && <Onboarding onComplete={completeOnboarding} />}

      {/* User guide for first-time users */}
      {showGuide && <UserGuide onClose={closeGuide} />}

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold text-foreground">
            {status === 'authenticated' ? 'Your Feed' : 'Active Deliberations'}
          </h1>
          <Link
            href="/deliberations"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            See All →
          </Link>
        </div>

        {/* Push notification prompt */}
        <NotificationBanner />

        {/* Error state */}
        {error && (
          <div className="bg-error-bg border border-error text-error p-4 rounded-lg mb-4">
            {error}
            <button onClick={fetchFeed} className="ml-2 underline">
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && !error && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🗳️</div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Nothing in your feed yet
            </h2>
            <p className="text-muted mb-6">
              Join a deliberation or create your own to get started.
            </p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/deliberations"
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg transition-colors"
              >
                Browse Deliberations
              </Link>
              <Link
                href="/deliberations/new"
                className="border border-border hover:border-accent text-foreground px-4 py-2 rounded-lg transition-colors"
              >
                Create New
              </Link>
            </div>
          </div>
        )}

        {/* Feed items - filter out expired cards */}
        <div className="space-y-4">
          {items.map((item, index) => {
            const key = `${item.type}-${item.deliberation.id}-${item.cell?.id || 'no-cell'}-${index}`

            switch (item.type) {
              case 'vote_now':
                return (
                  <VoteNowCard
                    key={key}
                    item={item}
                    onAction={handleAction}
                    onExplore={() => openSheet(item)}
                    onVoted={() => preserveVoteCard(item)}
                    onDismiss={item.cell ? () => dismissVoteCard(item.cell!.id) : undefined}
                  />
                )
              case 'join_voting':
                return (
                  <JoinVotingCard
                    key={key}
                    item={item}
                    onAction={handleAction}
                    onExplore={() => openSheet(item)}
                  />
                )
              case 'submit_ideas':
                return (
                  <SubmitIdeasCard
                    key={key}
                    item={item}
                    onAction={handleAction}
                    onExplore={() => openSheet(item)}
                  />
                )
              case 'champion':
              case 'challenge':
                return (
                  <ChampionCard
                    key={key}
                    item={item}
                    onAction={handleAction}
                    onExplore={() => openSheet(item)}
                  />
                )
              default:
                return null
            }
          })}
        </div>

        {/* Sign in prompt for non-authenticated users */}
        {status === 'unauthenticated' && (
          <div className="mt-8 p-4 bg-surface border border-border rounded-lg text-center">
            <p className="text-muted mb-3">Sign in to vote and make predictions</p>
            <Link
              href="/auth/signin"
              className="inline-block bg-accent hover:bg-accent-hover text-white px-6 py-2 rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </div>
        )}
      </div>

      {/* Bottom Sheet */}
      <BottomSheet isOpen={sheetOpen} onClose={closeSheet}>
        {selectedItem && (
          <DeliberationSheet
            item={selectedItem}
            onAction={handleAction}
            onClose={closeSheet}
          />
        )}
      </BottomSheet>
    </div>
  )
}
