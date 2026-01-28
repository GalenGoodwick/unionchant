'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { FeedItem } from '@/types/feed'

type TierData = {
  tier: number
  ideas: { id: string; text: string }[]
  votingProgress: number
  totalCells: number
  spotsRemaining: number
  isBatch: boolean
  cells: { id: string; ideas?: { id: string; text: string }[] }[]
}

type Props = {
  item: FeedItem
  onAction: () => void
  onExplore: () => void
}

export default function PredictCard({ item, onAction, onExplore }: Props) {
  const { data: session } = useSession()
  const router = useRouter()
  const [currentTier, setCurrentTier] = useState(0)
  const [tiers, setTiers] = useState<TierData[]>(() => {
    // Initialize with pre-fetched tierInfo if available
    if (item.tierInfo && item.tierInfo.ideas.length > 0) {
      return [{
        tier: item.tierInfo.tier,
        ideas: item.tierInfo.ideas,
        votingProgress: item.tierInfo.votingProgress,
        totalCells: item.tierInfo.totalCells,
        spotsRemaining: item.tierInfo.spotsRemaining,
        isBatch: item.tierInfo.tier > 1, // Tier 1 is not batch, Tier 2+ is batch
        cells: item.tierInfo.cells || [],
      }]
    }
    return []
  })
  const [predictions, setPredictions] = useState<Record<number, string>>(
    item.userPredictions || {}
  ) // tier -> ideaId
  const [predicting, setPredicting] = useState<string | null>(null)
  const [loading, setLoading] = useState(!item.tierInfo || item.tierInfo.ideas.length === 0)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [assignedCell, setAssignedCell] = useState<{ id: string; ideas: { id: string; text: string; author: string }[] } | null>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)

  // Fetch additional tiers if needed (for multi-tier deliberations)
  useEffect(() => {
    // Skip if we only have 1 tier or already have all tiers
    if (item.deliberation.currentTier <= 1 || tiers.length >= item.deliberation.currentTier) {
      setLoading(false)
      return
    }

    const fetchTiers = async () => {
      setLoading(true)
      const tierData: TierData[] = []

      // Fetch tiers 1 through currentTier
      for (let t = 1; t <= item.deliberation.currentTier; t++) {
        try {
          const res = await fetch(`/api/deliberations/${item.deliberation.id}/tiers/${t}`)
          if (res.ok) {
            const data = await res.json()
            tierData.push({
              tier: t,
              ideas: data.ideas.map((i: { id: string; text: string }) => ({
                id: i.id,
                text: i.text,
              })),
              votingProgress: data.stats.votingProgress,
              totalCells: data.stats.totalCells,
              spotsRemaining: data.cells.reduce(
                (sum: number, c: { participantCount: number }) => sum + Math.max(0, 5 - c.participantCount),
                0
              ),
              isBatch: data.isBatch ?? true,
              cells: (data.cells || []).map((c: { id: string; ideas?: { id: string; text: string }[] }) => ({
                id: c.id,
                ideas: c.ideas,
              })),
            })
          }
        } catch (err) {
          console.error(`Failed to fetch tier ${t}:`, err)
        }
      }

      if (tierData.length > 0) {
        setTiers(tierData)
      }
      setLoading(false)
    }

    fetchTiers()
  }, [item.deliberation.id, item.deliberation.currentTier, tiers.length])

  // Track if we have pre-fetched predictions (stable reference for useEffect)
  const hasPrefetchedPredictions = Boolean(item.userPredictions && Object.keys(item.userPredictions).length > 0)

  // Fetch user's existing predictions only if not pre-fetched
  useEffect(() => {
    if (hasPrefetchedPredictions || !session) return

    const fetchPredictions = async () => {
      try {
        const res = await fetch(`/api/predictions?deliberationId=${item.deliberation.id}`)
        if (res.ok) {
          const data = await res.json()
          const predMap: Record<number, string> = {}
          for (const pred of data.predictions) {
            predMap[pred.tierPredictedAt] = pred.predictedIdeaId
          }
          setPredictions(predMap)
        }
      } catch (err) {
        console.error('Failed to fetch predictions:', err)
      }
    }

    fetchPredictions()
  }, [session, item.deliberation.id, hasPrefetchedPredictions])

  const handleJoinAndVote = async () => {
    if (!session) {
      router.push('/auth/signin')
      return
    }

    setJoining(true)
    try {
      // First join the deliberation
      await fetch(`/api/deliberations/${item.deliberation.id}/join`, {
        method: 'POST',
      })

      // Then try to enter a cell
      const res = await fetch(`/api/deliberations/${item.deliberation.id}/enter`, {
        method: 'POST',
      })

      if (res.ok) {
        const data = await res.json()
        setJoined(true)
        setAssignedCell({
          id: data.cell.id,
          ideas: data.cell.ideas || [],
        })
        onAction()
      } else {
        const data = await res.json()
        alert(data.error || 'No spots available')
      }
    } catch (err) {
      console.error('Join error:', err)
      alert('Failed to join')
    } finally {
      setJoining(false)
    }
  }

  const handlePredict = async (ideaId: string, tier: number, cellId?: string) => {
    if (!session) {
      router.push('/auth/signin')
      return
    }

    setPredicting(ideaId)
    try {
      const body: Record<string, unknown> = {
        deliberationId: item.deliberation.id,
        predictedIdeaId: ideaId,
        tier: tier,
      }
      // For Tier 1 (non-batch), include cellId
      if (cellId) {
        body.cellId = cellId
      }

      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setPredictions(prev => ({ ...prev, [tier]: ideaId }))
        onAction()

        // Auto-advance to next tier after short delay
        if (currentTier < tiers.length - 1) {
          setTimeout(() => goToTier(currentTier + 1), 600)
        }
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to predict')
      }
    } catch (err) {
      console.error('Predict error:', err)
      alert('Failed to make prediction')
    } finally {
      setPredicting(null)
    }
  }

  const goToTier = (index: number) => {
    if (index < 0 || index >= tiers.length) return
    setCurrentTier(index)
    if (carouselRef.current) {
      carouselRef.current.style.transform = `translateX(-${index * 100}%)`
    }
  }

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentTier < tiers.length - 1) {
        goToTier(currentTier + 1)
      } else if (diff < 0 && currentTier > 0) {
        goToTier(currentTier - 1)
      }
    }
  }

  const currentTierData = tiers[currentTier]
  const hasPredicted = Object.keys(predictions).length > 0

  // Don't render if no tiers or no ideas in any tier
  if (tiers.length === 0 || tiers.every(t => t.ideas.length === 0)) {
    // Show loading skeleton only if still loading
    if (loading) {
      return (
        <div className="bg-surface border border-purple rounded-xl p-4">
          <div className="animate-pulse h-32 bg-purple-bg rounded-lg" />
        </div>
      )
    }
    return null // Don't show empty card
  }

  // If user just joined, show success and redirect option
  if (joined && assignedCell) {
    return (
      <div className="bg-surface border border-success rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-success font-bold text-sm uppercase tracking-wide">
            You're In!
          </span>
        </div>
        <div className="p-4 text-center">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            "{item.deliberation.question}"
          </h3>
          <p className="text-muted mb-4">You've been assigned to a voting cell.</p>
          <button
            onClick={onExplore}
            className="bg-warning hover:bg-warning-hover text-black px-6 py-2 rounded-lg font-semibold transition-colors"
          >
            Go Vote Now →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-purple rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex justify-between items-center">
        <span className="text-purple font-bold text-sm uppercase tracking-wide">
          Predict
        </span>
        <span className="text-sm text-muted font-mono">
          Tier {currentTierData?.tier || 1} • {currentTierData?.votingProgress || 0}% voted
        </span>
      </div>

      {/* Carousel */}
      <div
        className="overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={carouselRef}
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${currentTier * 100}%)` }}
        >
          {tiers.map((tierData) => (
            <div key={tierData.tier} className="min-w-full flex-shrink-0 p-4">
              <Link
                href={`/deliberations/${item.deliberation.id}`}
                className="block text-lg font-semibold text-foreground mb-4 hover:text-accent transition-colors"
              >
                "{item.deliberation.question}"
              </Link>

              {/* Ideas - no vote counts shown */}
              <div className="space-y-2">
                {tierData.ideas.map((idea) => {
                  const isPredicted = predictions[tierData.tier] === idea.id
                  const hasTierPrediction = !!predictions[tierData.tier]

                  // For non-batch (Tier 1), find which cell contains this idea
                  const cellId = !tierData.isBatch && tierData.cells?.length
                    ? tierData.cells.find(c => c.ideas?.some(i => i.id === idea.id))?.id
                    : tierData.cells?.[0]?.id

                  return (
                    <div
                      key={idea.id}
                      className={`p-3 rounded-lg flex justify-between items-center transition-all ${
                        isPredicted
                          ? 'bg-success-bg border border-success'
                          : hasTierPrediction
                          ? 'bg-surface border border-border opacity-40'
                          : 'bg-background border border-border hover:border-purple'
                      }`}
                    >
                      <p className="text-foreground flex-1 truncate">{idea.text}</p>

                      {isPredicted ? (
                        <span className="text-success text-sm font-medium">Your Pick</span>
                      ) : !hasTierPrediction ? (
                        <button
                          onClick={() => handlePredict(idea.id, tierData.tier, cellId)}
                          disabled={predicting !== null}
                          className="bg-purple hover:bg-purple-hover text-white px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          {predicting === idea.id ? '...' : 'Predict'}
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div className="h-1.5 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple transition-all duration-300"
                    style={{ width: `${tierData.votingProgress}%` }}
                  />
                </div>
              </div>

              {/* Join & Vote option for Tier 1 with spots */}
              {tierData.tier === 1 && tierData.spotsRemaining > 0 && !joined && (
                <div className="mt-4 p-3 bg-warning-bg border border-warning rounded-lg flex justify-between items-center">
                  <span className="text-foreground text-sm">
                    {tierData.spotsRemaining} spot{tierData.spotsRemaining !== 1 ? 's' : ''} left to vote
                  </span>
                  <button
                    onClick={handleJoinAndVote}
                    disabled={joining}
                    className="bg-warning hover:bg-warning-hover text-black px-4 py-1.5 rounded text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {joining ? '...' : 'Join & Vote'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer with dots and explore */}
      <div className="px-4 py-3 border-t border-border flex justify-between items-center">
        {/* Tier dots */}
        <div className="flex gap-1.5">
          {tiers.map((tierData, i) => {
            const predicted = !!predictions[tierData.tier]
            return (
              <button
                key={tierData.tier}
                onClick={() => goToTier(i)}
                className={`h-2 rounded-full transition-all ${
                  i === currentTier
                    ? 'w-5 bg-purple'
                    : predicted
                    ? 'w-2 bg-success'
                    : 'w-2 bg-muted-light hover:bg-muted'
                }`}
              />
            )
          })}
        </div>

        {/* Swipe hint or links */}
        <div className="flex items-center gap-3">
          {tiers.length > 1 && !hasPredicted && (
            <span className="text-xs text-muted">
              ← Swipe →
            </span>
          )}
          {!hasPredicted && tiers.length === 1 && (
            <span className="text-xs text-muted">
              {currentTierData?.totalCells || 0} cells
            </span>
          )}
          <button
            onClick={onExplore}
            className="text-muted hover:text-foreground text-sm transition-colors"
          >
            Comments
          </button>
          <Link
            href={`/deliberations/${item.deliberation.id}`}
            className="text-accent hover:text-accent-hover text-sm transition-colors"
          >
            Full page →
          </Link>
        </div>
      </div>
    </div>
  )
}
