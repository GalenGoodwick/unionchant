'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import VoteNowCard from '@/components/feed/cards/VoteNowCard'
import JoinVotingCard from '@/components/feed/cards/JoinVotingCard'
import SubmitIdeasCard from '@/components/feed/cards/SubmitIdeasCard'
import ChampionCard from '@/components/feed/cards/ChampionCard'
import ActivityCard from '@/components/feed/cards/ActivityCard'
import ResultCard from '@/components/feed/cards/ResultCard'
import FollowingCard from '@/components/feed/cards/FollowingCard'
import BottomSheet from '@/components/sheets/BottomSheet'
import DeliberationSheet from '@/components/sheets/DeliberationSheet'
import Onboarding from '@/components/Onboarding'
import { useOnboarding } from '@/hooks/useOnboarding'
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling'
import UserGuide from '@/components/UserGuide'
import Spinner from '@/components/Spinner'
import type { FeedItem, FeedTab, ActivityItem, ResultItem, FollowingItem } from '@/types/feed'

// Desktop left column tabs
const DESKTOP_TABS: { id: FeedTab; label: string; authRequired: boolean }[] = [
  { id: 'for-you', label: 'Actionable', authRequired: false },
  { id: 'activity', label: 'Activity', authRequired: false },
  { id: 'following', label: 'Following', authRequired: true },
]

// Desktop right column tabs
type RightTab = 'complete' | 'resolved'
const RIGHT_TABS: { id: RightTab; label: string }[] = [
  { id: 'complete', label: 'Complete' },
  { id: 'resolved', label: 'Resolved' },
]

// Mobile: all tabs in one bar
const MOBILE_TABS: { id: FeedTab; label: string; authRequired: boolean }[] = [
  { id: 'for-you', label: 'Actionable', authRequired: false },
  { id: 'activity', label: 'Activity', authRequired: false },
  { id: 'done', label: 'Complete', authRequired: true },
  { id: 'results', label: 'Resolved', authRequired: false },
  { id: 'following', label: 'Following', authRequired: true },
]

/** Is this item "done" — user has already taken action? */
function isDoneItem(item: FeedItem): boolean {
  if (item.type === 'vote_now' && item.cell?.userHasVoted) return true
  if (item.type === 'submit_ideas' && item.userSubmittedIdea) return true
  return false
}

export default function FeedPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { needsOnboarding, completeOnboarding } = useOnboarding()
  const [activeTab, setActiveTab] = useState<FeedTab>('for-you')
  const [rightTab, setRightTab] = useState<RightTab>('complete')

  // For You state (existing)
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  // Optimistic action tracking — refs are immune to stale closures
  const votedCellIdsRef = useRef<Set<string>>(new Set())
  const submittedDelibsRef = useRef<Map<string, string>>(new Map()) // deliberationId -> text

  // Tab states
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)
  const activityLoaded = useRef(false)

  const [resolvedItems, setResolvedItems] = useState<ResultItem[]>([])
  const [resolvedLoading, setResolvedLoading] = useState(false)
  const [resolvedError, setResolvedError] = useState<string | null>(null)
  const resolvedLoaded = useRef(false)

  const [followingItems, setFollowingItems] = useState<FollowingItem[]>([])
  const [followingLoading, setFollowingLoading] = useState(false)
  const [followingError, setFollowingError] = useState<string | null>(null)
  const followingLoaded = useRef(false)

  // Split items: actionable (left) vs done (right)
  // Dedup: if a deliberation appears as done, remove it from actionable
  const { actionableItems, doneItems } = useMemo(() => {
    const actionable: FeedItem[] = []
    const done: FeedItem[] = []
    const doneDelibIds = new Set<string>()

    // First pass: classify
    for (const item of items) {
      if (isDoneItem(item)) {
        done.push(item)
        doneDelibIds.add(item.deliberation.id)
      }
    }

    // Second pass: actionable items, skip deliberations already in done
    for (const item of items) {
      if (!isDoneItem(item) && !doneDelibIds.has(item.deliberation.id)) {
        actionable.push(item)
      }
    }

    return { actionableItems: actionable, doneItems: done }
  }, [items])

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

  // Track cards for cells user has voted in
  const [preservedVoteCards, setPreservedVoteCards] = useState<Map<string, FeedItem>>(new Map())
  const [preservedCardsLoaded, setPreservedCardsLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('preservedVoteCards')
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as [string, FeedItem][]
        const now = Date.now()
        const valid = parsed.filter(([, item]) => {
          if (item.cell?.votingDeadline && item.cell.status !== 'COMPLETED') {
            if (new Date(item.cell.votingDeadline).getTime() < now) return false
          }
          return true
        })
        setPreservedVoteCards(new Map(valid))
        // Seed optimistic ref from persisted data
        valid.forEach(([cellId]) => votedCellIdsRef.current.add(cellId))
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

  // === For You fetch (existing logic, unchanged) ===
  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/feed')
      if (!res.ok) throw new Error('Failed to fetch feed')
      const data = await res.json()
      const newItems = data.items as FeedItem[]

      const seenKeys = new Set<string>()
      const deduped = newItems.filter(item => {
        const key = item.cell?.id || `${item.type}-${item.deliberation.id}`
        if (seenKeys.has(key)) return false
        seenKeys.add(key)
        return true
      })

      // Overlay optimistic action states onto server items to prevent column bounce.
      // Refs are always current — no stale closure issues.
      const deduplicatedItems = deduped.map(item => {
        if (item.type === 'vote_now' && item.cell && votedCellIdsRef.current.has(item.cell.id) && !item.cell.userHasVoted) {
          return { ...item, cell: { ...item.cell, userHasVoted: true } }
        }
        if (item.type === 'submit_ideas' && submittedDelibsRef.current.has(item.deliberation.id) && !item.userSubmittedIdea) {
          return { ...item, userSubmittedIdea: { id: 'optimistic', text: submittedDelibsRef.current.get(item.deliberation.id)! } }
        }
        return item
      })

      const activeCellIds = new Set(newItems.filter(i => i.cell).map(i => i.cell!.id))

      const staleCardIds: string[] = []
      preservedVoteCards.forEach((card, cellId) => {
        if (!activeCellIds.has(cellId)) {
          staleCardIds.push(cellId)
        }
      })

      if (staleCardIds.length > 0) {
        setPreservedVoteCards(prev => {
          const updated = new Map(prev)
          staleCardIds.forEach(id => updated.delete(id))
          localStorage.setItem('preservedVoteCards', JSON.stringify([...updated]))
          return updated
        })
      }

      const cardsToPreserve = Array.from(preservedVoteCards.values()).filter(p =>
        !staleCardIds.includes(p.cell?.id || '') &&
        !deduplicatedItems.some(n => n.cell?.id === p.cell?.id)
      )

      const preservedDeliberationIds = new Set(cardsToPreserve.map(p => p.deliberation.id))
      const filteredNewItems = deduplicatedItems.filter(n =>
        n.type === 'vote_now' ||
        !preservedDeliberationIds.has(n.deliberation.id)
      )

      setItems([...cardsToPreserve, ...filteredNewItems])
      setError(null)
    } catch (err) {
      console.error('Feed error:', err)
      if (loading) setError('Failed to load feed')
    } finally {
      setLoading(false)
    }
  }, [preservedVoteCards]) // eslint-disable-line react-hooks/exhaustive-deps

  const preserveVoteCard = useCallback((item: FeedItem) => {
    if (!item.cell) return
    votedCellIdsRef.current.add(item.cell.id)
    // Update items locally — card reclassifies as done THIS render
    setItems(prev => prev.map(i =>
      i.cell?.id === item.cell!.id
        ? { ...i, cell: { ...i.cell!, userHasVoted: true } }
        : i
    ))
    // Persist for when server stops returning this cell
    const doneItem = { ...item, cell: { ...item.cell, userHasVoted: true } }
    setPreservedVoteCards(prev => {
      const updated = new Map(prev)
      updated.set(item.cell!.id, doneItem)
      localStorage.setItem('preservedVoteCards', JSON.stringify([...updated]))
      return updated
    })
  }, [])

  const markIdeaSubmitted = useCallback((deliberationId: string, text: string) => {
    submittedDelibsRef.current.set(deliberationId, text)
    // Update items locally — card reclassifies as done THIS render
    setItems(prev => prev.map(i =>
      i.deliberation.id === deliberationId && i.type === 'submit_ideas'
        ? { ...i, userSubmittedIdea: { id: 'optimistic', text } }
        : i
    ))
  }, [])

  const dismissVoteCard = useCallback((cellId: string) => {
    setPreservedVoteCards(prev => {
      const updated = new Map(prev)
      updated.delete(cellId)
      localStorage.setItem('preservedVoteCards', JSON.stringify([...updated]))
      return updated
    })
    setItems(prev => prev.filter(item => item.cell?.id !== cellId))
  }, [])

  useEffect(() => {
    if (preservedCardsLoaded) fetchFeed()
  }, [preservedCardsLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const { signalActivity } = useAdaptivePolling(
    () => { if (preservedCardsLoaded && !loading && activeTab === 'for-you') fetchFeed() },
    { slowInterval: 15000, fastInterval: 3000, fastModeDuration: 30000 }
  )

  // === Tab fetchers ===
  const fetchActivity = useCallback(async () => {
    setActivityLoading(true)
    setActivityError(null)
    try {
      const res = await fetch('/api/feed/activity')
      if (!res.ok) throw new Error('Failed to fetch activity')
      const data = await res.json()
      setActivityItems(data.items)
      activityLoaded.current = true
    } catch {
      setActivityError('Failed to load activity')
    } finally {
      setActivityLoading(false)
    }
  }, [])

  const fetchResolved = useCallback(async () => {
    setResolvedLoading(true)
    setResolvedError(null)
    try {
      const res = await fetch('/api/feed/results')
      if (!res.ok) throw new Error('Failed to fetch resolved')
      const data = await res.json()
      setResolvedItems(data.items)
      resolvedLoaded.current = true
    } catch {
      setResolvedError('Failed to load resolved')
    } finally {
      setResolvedLoading(false)
    }
  }, [])

  const fetchFollowing = useCallback(async () => {
    setFollowingLoading(true)
    setFollowingError(null)
    try {
      const res = await fetch('/api/feed/following')
      if (!res.ok) throw new Error('Failed to fetch following')
      const data = await res.json()
      setFollowingItems(data.items)
      followingLoaded.current = true
    } catch {
      setFollowingError('Failed to load following feed')
    } finally {
      setFollowingLoading(false)
    }
  }, [])

  // Prefetch resolved for desktop right column
  useEffect(() => {
    if (!resolvedLoaded.current) fetchResolved()
  }, [fetchResolved])

  useEffect(() => {
    if (activeTab === 'activity' && !activityLoaded.current) fetchActivity()
    if (activeTab === 'results' && !resolvedLoaded.current) fetchResolved()
    if (activeTab === 'following' && !followingLoaded.current && status === 'authenticated') fetchFollowing()
  }, [activeTab, status, fetchActivity, fetchResolved, fetchFollowing])

  // Also fetch resolved when right tab switches to it
  useEffect(() => {
    if (rightTab === 'resolved' && !resolvedLoaded.current) fetchResolved()
  }, [rightTab, fetchResolved])

  const handleAction = () => {
    // Don't fetchFeed immediately — local state updates (preserveVoteCard /
    // markIdeaSubmitted) already moved the card. Fast polling picks up server
    // state in ~3s, with ref overlay preventing any bounce.
    signalActivity()
  }

  const openSheet = (item: FeedItem) => {
    setSelectedItem(item)
    setSheetOpen(true)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    setSelectedItem(null)
  }

  const userId = (session?.user as any)?.id

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

      {needsOnboarding && <Onboarding onComplete={completeOnboarding} />}
      {showGuide && <UserGuide onClose={closeGuide} />}

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="lg:grid lg:grid-cols-2 lg:gap-6">
          {/* ===== Left column ===== */}
          <div>
            {/* Desktop tabs */}
            <div className="hidden lg:block mb-6 border-b border-border">
              <div className="flex -mb-px">
                {DESKTOP_TABS.map(tab => (
                  <TabButton
                    key={tab.id}
                    id={tab.id}
                    label={tab.label}
                    isActive={activeTab === tab.id}
                    disabled={tab.authRequired && status !== 'authenticated'}
                    onClick={() => setActiveTab(tab.id)}
                  />
                ))}
              </div>
            </div>

            {/* Mobile tabs */}
            <div className="lg:hidden mb-6 border-b border-border">
              <div className="flex overflow-x-auto scrollbar-hide -mb-px">
                {MOBILE_TABS.map(tab => (
                  <TabButton
                    key={tab.id}
                    id={tab.id}
                    label={tab.label}
                    isActive={activeTab === tab.id}
                    disabled={tab.authRequired && status !== 'authenticated'}
                    onClick={() => setActiveTab(tab.id)}
                  />
                ))}
              </div>
            </div>

            {/* Left tab content */}
            {activeTab === 'for-you' && (
              <>
                {error && (
                  <div className="bg-error-bg border border-error text-error p-4 rounded-lg mb-4">
                    {error}
                    <button onClick={fetchFeed} className="ml-2 underline">Retry</button>
                  </div>
                )}

                {actionableItems.length === 0 && !error ? (
                  <EmptyState message="Nothing actionable right now." />
                ) : (
                  <div className="space-y-4">
                    <FeedCards
                      items={actionableItems}
                      handleAction={handleAction}
                      openSheet={openSheet}
                      preserveVoteCard={preserveVoteCard}
                      dismissVoteCard={dismissVoteCard}
                      markIdeaSubmitted={markIdeaSubmitted}
                    />
                  </div>
                )}

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
              </>
            )}

            {activeTab === 'activity' && (
              <TabContent loading={activityLoading} error={activityError} retry={fetchActivity}>
                {activityItems.length === 0 ? (
                  <EmptyState message="No activity yet." />
                ) : (
                  <div className="space-y-3">
                    {activityItems.map(item => (
                      <ActivityCard key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </TabContent>
            )}

            {/* Complete tab — mobile only */}
            {activeTab === 'done' && (
              <div className="lg:hidden">
                {status !== 'authenticated' ? (
                  <AuthPrompt message="Sign in to see your activity" />
                ) : doneItems.length === 0 ? (
                  <EmptyState message="Vote or submit ideas to see them here." />
                ) : (
                  <div className="space-y-4">
                    <FeedCards
                      items={doneItems}
                      handleAction={handleAction}
                      openSheet={openSheet}
                      preserveVoteCard={preserveVoteCard}
                      dismissVoteCard={dismissVoteCard}
                      markIdeaSubmitted={markIdeaSubmitted}
                    />
                    {userId && <SeeAllLink userId={userId} />}
                  </div>
                )}
              </div>
            )}

            {/* Resolved tab — mobile only */}
            {activeTab === 'results' && (
              <div className="lg:hidden">
                <TabContent loading={resolvedLoading} error={resolvedError} retry={fetchResolved}>
                  {resolvedItems.length === 0 ? (
                    <EmptyState message="No outcomes yet." />
                  ) : (
                    <div className="space-y-3">
                      {resolvedItems.map(item => (
                        <ResultCard key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </TabContent>
              </div>
            )}

            {activeTab === 'following' && (
              <>
                {status !== 'authenticated' ? (
                  <AuthPrompt message="Sign in to follow other users and see their activity" />
                ) : (
                  <TabContent loading={followingLoading} error={followingError} retry={fetchFollowing}>
                    {followingItems.length === 0 ? (
                      <EmptyState message="Follow users from their profile pages to see their activity here." />
                    ) : (
                      <div className="space-y-3">
                        {followingItems.map(item => (
                          <FollowingCard key={item.id} item={item} />
                        ))}
                      </div>
                    )}
                  </TabContent>
                )}
              </>
            )}
          </div>

          {/* ===== Right column (desktop only) ===== */}
          {status === 'authenticated' && (
            <div className="hidden lg:block">
              {/* Right column tabs: Complete | Resolved */}
              <div className="mb-6 border-b border-border">
                <div className="flex -mb-px">
                  {RIGHT_TABS.map(tab => (
                    <TabButton
                      key={tab.id}
                      id={tab.id}
                      label={tab.label}
                      isActive={rightTab === tab.id}
                      disabled={false}
                      onClick={() => setRightTab(tab.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Right column content */}
              {rightTab === 'complete' && (
                <>
                  {doneItems.length === 0 ? (
                    <EmptyState message="Vote or submit ideas to see them here." />
                  ) : (
                    <div className="space-y-4">
                      <FeedCards
                        items={doneItems}
                        handleAction={handleAction}
                        openSheet={openSheet}
                        preserveVoteCard={preserveVoteCard}
                        dismissVoteCard={dismissVoteCard}
                        markIdeaSubmitted={markIdeaSubmitted}
                      />
                      {userId && <SeeAllLink userId={userId} />}
                    </div>
                  )}
                </>
              )}

              {rightTab === 'resolved' && (
                <TabContent loading={resolvedLoading} error={resolvedError} retry={fetchResolved}>
                  {resolvedItems.length === 0 ? (
                    <EmptyState message="No outcomes yet." />
                  ) : (
                    <div className="space-y-3">
                      {resolvedItems.map(item => (
                        <ResultCard key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </TabContent>
              )}
            </div>
          )}

          {/* Right column placeholder for anonymous users — keeps grid balanced */}
          {status !== 'authenticated' && (
            <div className="hidden lg:block" />
          )}
        </div>
      </div>

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

// === Shared card renderer ===

function FeedCards({
  items,
  handleAction,
  openSheet,
  preserveVoteCard,
  dismissVoteCard,
  markIdeaSubmitted,
}: {
  items: FeedItem[]
  handleAction: () => void
  openSheet: (item: FeedItem) => void
  preserveVoteCard: (item: FeedItem) => void
  dismissVoteCard: (cellId: string) => void
  markIdeaSubmitted: (deliberationId: string, text: string) => void
}) {
  return (
    <>
      {items.map((item) => {
        const key = `${item.type}-${item.deliberation.id}-${item.cell?.id || 'no-cell'}`
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
                onSubmitted={(text) => markIdeaSubmitted(item.deliberation.id, text)}
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
                onSubmitted={(text) => markIdeaSubmitted(item.deliberation.id, text)}
              />
            )
          default:
            return null
        }
      })}
    </>
  )
}

// === Sub-components ===

function TabButton({
  id,
  label,
  isActive,
  disabled,
  onClick,
}: {
  id: string
  label: string
  isActive: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={() => { if (!disabled) onClick() }}
      className={`
        flex-shrink-0 px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap
        ${isActive
          ? 'text-accent'
          : disabled
            ? 'text-muted-light cursor-not-allowed'
            : 'text-muted hover:text-foreground cursor-pointer'
        }
      `}
    >
      {label}
      {isActive && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
      )}
    </button>
  )
}

function TabContent({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean
  error: string | null
  retry: () => void
  children: React.ReactNode
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Spinner size="md" />
        <div className="animate-pulse space-y-3 w-full">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-error-bg border border-error text-error p-4 rounded-lg">
        {error}
        <button onClick={retry} className="ml-2 underline">Retry</button>
      </div>
    )
  }

  return <>{children}</>
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-muted text-sm">{message}</p>
    </div>
  )
}

function AuthPrompt({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-muted mb-4">{message}</p>
      <Link
        href="/auth/signin"
        className="inline-block bg-accent hover:bg-accent-hover text-white px-6 py-2 rounded-lg transition-colors"
      >
        Sign In
      </Link>
    </div>
  )
}

function SeeAllLink({ userId }: { userId: string }) {
  return (
    <div className="text-center pt-2">
      <Link
        href={`/user/${userId}`}
        className="text-xs text-muted hover:text-accent transition-colors"
      >
        See all activity →
      </Link>
    </div>
  )
}
