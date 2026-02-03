'use client'

import type { Idea } from './types'

export default function TierFunnelCompact({
  currentTier,
  totalIdeas,
  phase,
  ideas
}: {
  currentTier: number
  totalIdeas: number
  phase: string
  ideas: Idea[]
}) {
  const tiers: { tier: number; ideas: number; status: 'completed' | 'active' | 'pending'; isFinalShowdown: boolean }[] = []

  for (let t = 1; t <= currentTier; t++) {
    const ideasAtThisTier = t === 1
      ? ideas.filter(i => i.status !== 'PENDING' && i.status !== 'SUBMITTED').length || totalIdeas
      : ideas.filter(i => i.tier >= t).length

    const status: 'completed' | 'active' | 'pending' = t < currentTier ? 'completed' : t === currentTier ? 'active' : 'pending'
    const isFinalShowdown = t > 1 && ideasAtThisTier <= 5 && ideasAtThisTier > 0 && t === currentTier && status === 'active'

    if (ideasAtThisTier > 0 || t === 1) {
      tiers.push({ tier: t, ideas: ideasAtThisTier, status, isFinalShowdown })
    }
  }

  const winner = ideas.find(i => i.status === 'WINNER')
  if (winner && tiers.length > 0) {
    const lastTier = tiers[tiers.length - 1]
    if (lastTier.status === 'active') {
      lastTier.status = 'completed'
    }
  }

  if (tiers.length === 0) return null

  return (
    <div className="flex items-center gap-1 py-2 px-3 bg-surface rounded-lg border border-border overflow-x-auto">
      {tiers.map((t, i) => (
        <div key={t.tier} className="flex items-center gap-1 shrink-0">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
            t.status === 'active' ? 'bg-warning-bg text-warning border border-warning' :
            t.status === 'completed' ? 'bg-success-bg text-success border border-success' :
            'bg-background text-muted border border-border'
          }`}>
            <span>T{t.tier}</span>
            <span className="font-mono text-[10px] opacity-75">({t.ideas})</span>
            {t.isFinalShowdown && <span className="text-purple text-[10px]">Final</span>}
            {t.status === 'completed' && (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
            {t.status === 'active' && (
              <div className="w-2.5 h-2.5 border-[1.5px] border-warning border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          {i < tiers.length - 1 && (
            <svg className="w-3 h-3 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      ))}
      <svg className="w-3 h-3 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
      <div className={`px-2 py-1 rounded text-xs font-medium shrink-0 ${
        winner ? 'bg-success-bg text-success border border-success' : 'bg-background text-muted border border-border'
      }`}>
        {winner ? '🏆' : '?'}
      </div>
    </div>
  )
}
