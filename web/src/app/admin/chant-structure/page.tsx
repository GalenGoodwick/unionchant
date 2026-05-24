'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

type TierData = {
  tier: number
  totalCells: number
  totalBatches: number
  totalParticipants: number
  totalVotes: number
  advancingIdeas: number
  batches: {
    batch: number
    cells: number
    totalParticipants: number
    totalVotes: number
    uniqueIdeas: number
  }[]
}

type ChantStructure = {
  deliberation: {
    id: string
    question: string
    phase: string
    currentTier: number
    totalMembers: number
    totalIdeas: number
    championText: string | null
    championTier: number | null
    createdAt: string
    completedAt: string | null
  }
  totalTiers: number
  tiers: TierData[]
}

function ChantStructureContent() {
  const searchParams = useSearchParams()
  const deliberationId = searchParams.get('id')

  const [data, setData] = useState<ChantStructure | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const url = deliberationId
          ? `/api/admin/chant-structure?id=${deliberationId}`
          : '/api/admin/chant-structure'
        const res = await fetch(url)
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to fetch')
        }
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [deliberationId])

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-muted animate-pulse">Loading...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-error/10 border border-error/30 rounded-lg p-4 text-error">
            {error}
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const tier1Cells = data.tiers[0]?.totalCells || 0
  const cellCountStable = data.tiers.every(t => t.totalCells === tier1Cells)

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/admin" className="text-accent text-sm hover:underline mb-2 block">
              ← Back to Admin
            </Link>
            <h1 className="text-2xl font-bold text-foreground">Chant Structure Analysis</h1>
          </div>
        </div>

        {/* Deliberation Overview */}
        <div className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold text-foreground mb-4">{data.deliberation.question}</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-xs text-muted">Phase</div>
              <div className="text-sm font-mono text-foreground">{data.deliberation.phase}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Current Tier</div>
              <div className="text-sm font-mono text-foreground">{data.deliberation.currentTier}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Total Members</div>
              <div className="text-sm font-mono text-foreground">{data.deliberation.totalMembers}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Total Ideas</div>
              <div className="text-sm font-mono text-foreground">{data.deliberation.totalIdeas}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-muted">ID:</span>{' '}
              <span className="font-mono text-foreground">{data.deliberation.id}</span>
            </div>
            <div>
              <span className="text-muted">Created:</span>{' '}
              <span className="text-foreground">{new Date(data.deliberation.createdAt).toLocaleString()}</span>
            </div>
          </div>

          {data.deliberation.completedAt && (
            <div className="text-xs mt-2">
              <span className="text-muted">Completed:</span>{' '}
              <span className="text-foreground">{new Date(data.deliberation.completedAt).toLocaleString()}</span>
            </div>
          )}

          {data.deliberation.championText && (
            <div className="mt-4 p-3 bg-success/10 border border-success/30 rounded">
              <div className="text-xs text-success font-semibold mb-1">
                Champion (Tier {data.deliberation.championTier})
              </div>
              <div className="text-sm text-foreground italic">"{data.deliberation.championText}"</div>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="bg-surface border border-border rounded-lg p-6">
          <h3 className="text-lg font-bold text-foreground mb-4">Summary</h3>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-muted">Total Tiers</div>
              <div className="text-3xl font-bold text-foreground">{data.totalTiers}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Tier 1 Cells</div>
              <div className="text-3xl font-bold text-foreground">{tier1Cells}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Cell Count Stable</div>
              <div className="text-3xl font-bold">
                {cellCountStable ? (
                  <span className="text-success">✓</span>
                ) : (
                  <span className="text-error">✗</span>
                )}
              </div>
            </div>
          </div>

          {!cellCountStable && (
            <div className="mt-4 p-3 bg-error/10 border border-error/30 rounded text-sm text-error">
              ⚠️ Cell count varies across tiers - not maintaining stable count
            </div>
          )}
        </div>

        {/* Tier-by-Tier Breakdown */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-foreground">Tier-by-Tier Breakdown</h3>

          {data.tiers.map((tier) => {
            const cellMismatch = tier1Cells > 0 && tier.totalCells !== tier1Cells

            return (
              <div
                key={tier.tier}
                className={`bg-surface border rounded-lg p-6 ${
                  cellMismatch ? 'border-error/50' : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xl font-bold text-foreground">Tier {tier.tier}</h4>
                  {cellMismatch && (
                    <span className="text-xs text-error font-semibold px-2 py-1 bg-error/10 rounded">
                      Cell count mismatch
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-muted">Cells</div>
                    <div className={`text-2xl font-bold ${cellMismatch ? 'text-error' : 'text-foreground'}`}>
                      {tier.totalCells}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Batches</div>
                    <div className="text-2xl font-bold text-foreground">{tier.totalBatches}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Participants</div>
                    <div className="text-2xl font-bold text-foreground">{tier.totalParticipants}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Votes</div>
                    <div className="text-2xl font-bold text-foreground">{tier.totalVotes}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Advancing</div>
                    <div className="text-2xl font-bold text-success">{tier.advancingIdeas}</div>
                  </div>
                </div>

                {/* Batches */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider">Batches</div>
                  {tier.batches.map((batch) => (
                    <div
                      key={batch.batch}
                      className="bg-background border border-border rounded p-3 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-foreground">Batch {batch.batch}</span>
                        <div className="flex gap-4 text-xs text-muted">
                          <span>{batch.cells} cells</span>
                          <span>{batch.totalParticipants} participants</span>
                          <span>{batch.totalVotes} votes</span>
                          <span>{batch.uniqueIdeas} ideas</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


export default function ChantStructurePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background p-8"><div className="max-w-6xl mx-auto"><div className="text-muted animate-pulse">Loading...</div></div></div>}>
      <ChantStructureContent />
    </Suspense>
  )
}
