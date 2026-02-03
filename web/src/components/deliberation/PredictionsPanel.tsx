'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import Section from './Section'
import type { TierInfo, Prediction } from './types'

export default function PredictionsPanel({ deliberationId, currentTier }: {
  deliberationId: string
  currentTier: number
}) {
  const { data: session } = useSession()
  const router = useRouter()
  const { showToast } = useToast()
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [predicting, setPredicting] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tierRes, predRes] = await Promise.all([
          fetch(`/api/deliberations/${deliberationId}/tiers/${currentTier}`),
          session ? fetch(`/api/predictions?deliberationId=${deliberationId}`) : null
        ])

        if (tierRes.ok) setTierInfo(await tierRes.json())
        if (predRes?.ok) {
          const data = await predRes.json()
          setPredictions(data.predictions || [])
        }
      } catch (err) {
        console.error('Failed to fetch:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [deliberationId, currentTier, session])

  const handlePredict = async (ideaId: string) => {
    if (!session) {
      router.push('/auth/signin')
      return
    }
    setPredicting(ideaId)
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliberationId, predictedIdeaId: ideaId, tier: currentTier }),
      })
      if (res.ok) {
        const predRes = await fetch(`/api/predictions?deliberationId=${deliberationId}`)
        if (predRes.ok) {
          const data = await predRes.json()
          setPredictions(data.predictions || [])
        }
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to predict', 'error')
      }
    } finally {
      setPredicting(null)
    }
  }

  if (loading || !tierInfo) return null

  const currentPred = predictions.find(p => p.tierPredictedAt === currentTier)

  return (
    <Section
      title="Predict Winner"
      badge={
        <span className="text-xs bg-purple text-white px-2 py-0.5 rounded">
          {tierInfo.stats.votingProgress}% voted
        </span>
      }
      variant="purple"
      defaultOpen={true}
    >
      <div className="w-full bg-background rounded-full h-1.5 mb-3">
        <div className="bg-purple h-1.5 rounded-full transition-all" style={{ width: `${tierInfo.stats.votingProgress}%` }} />
      </div>

      <div className="space-y-1.5">
        {(tierInfo.liveTally || tierInfo.ideas).map((item) => {
          const idea = 'voteCount' in item ? { ...item, id: item.ideaId } : item
          const voteCount = 'voteCount' in item ? item.voteCount : undefined
          const isPredicted = currentPred?.predictedIdeaId === idea.id

          return (
            <div
              key={idea.id}
              className={`p-2 rounded flex justify-between items-center text-sm ${
                isPredicted ? 'bg-purple text-white' : 'bg-background border border-border'
              }`}
            >
              <div className="flex-1">
                <p className={isPredicted ? 'text-white' : 'text-foreground'}>{idea.text}</p>
                {voteCount !== undefined && (
                  <span className={`text-xs font-mono ${isPredicted ? 'text-purple-light' : 'text-muted'}`}>
                    {voteCount} votes
                  </span>
                )}
              </div>

              {isPredicted ? (
                <span className="text-xs bg-purple-hover px-2 py-0.5 rounded">Your pick</span>
              ) : !currentPred ? (
                <button
                  onClick={() => handlePredict(idea.id)}
                  disabled={predicting === idea.id}
                  className="bg-purple hover:bg-purple-hover text-white px-3 py-1 rounded text-xs"
                >
                  {predicting === idea.id ? '...' : 'Pick'}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      {predictions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-purple-border">
          <p className="text-xs text-purple mb-2">Your predictions:</p>
          <div className="space-y-1">
            {predictions.map(p => (
              <div key={p.id} className="flex justify-between text-xs">
                <span className="text-foreground truncate flex-1">{p.predictedIdea.text}</span>
                <span className={
                  p.resolvedAt === null ? 'text-purple' :
                  p.wonImmediate || p.ideaBecameChampion ? 'text-success' : 'text-error'
                }>
                  {p.resolvedAt === null ? 'T' + p.tierPredictedAt :
                   p.ideaBecameChampion ? '🏆' : p.wonImmediate ? '✓' : '✗'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}
