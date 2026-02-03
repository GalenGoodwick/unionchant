'use client'

import { useEffect, useState } from 'react'
import Section from './Section'
import type { VotingHistory } from './types'

export default function HistoryPanel({ deliberationId }: { deliberationId: string }) {
  const [history, setHistory] = useState<VotingHistory | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/deliberations/${deliberationId}/history`)
        if (res.ok) setHistory(await res.json())
      } catch (err) {
        console.error('Failed to fetch history:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [deliberationId])

  if (loading) return null

  if (!history || history.totalCells === 0) {
    return (
      <Section title="Voting History" defaultOpen={false}>
        <p className="text-muted text-sm">No completed voting rounds yet.</p>
      </Section>
    )
  }

  const tiers = Object.keys(history.tiers).map(Number).sort((a, b) => a - b)

  return (
    <Section
      title="History"
      badge={<span className="text-xs text-muted font-mono">{history.totalCells} cells</span>}
      defaultOpen={false}
    >
      {tiers.map(tier => (
        <div key={tier} className="mb-3">
          <p className="text-sm font-medium text-foreground mb-1">Tier {tier}</p>
          {history.tiers[tier].map(cell => (
            <div key={cell.id} className="bg-surface rounded p-2 mb-1">
              {cell.ideas.sort((a, b) => b.votes - a.votes).map(idea => (
                <div key={idea.id} className={`flex justify-between text-xs py-0.5 ${
                  idea.isWinner ? 'text-success' : 'text-muted'
                }`}>
                  <span className="truncate flex-1">{idea.text}</span>
                  <span className="font-mono ml-2">{idea.votes}{idea.isWinner && ' ✓'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </Section>
  )
}
