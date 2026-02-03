'use client'

import type { Idea } from './types'

export default function TierFunnel({
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
  const tiers: { tier: number; ideas: number; advancing: number; status: 'completed' | 'active' | 'pending'; isFinalShowdown: boolean }[] = []

  for (let t = 1; t <= currentTier; t++) {
    const ideasAtThisTier = t === 1
      ? ideas.filter(i => i.status !== 'PENDING' && i.status !== 'SUBMITTED').length || totalIdeas
      : ideas.filter(i => i.tier >= t).length

    let advancingFromThisTier: number
    if (t < currentTier) {
      advancingFromThisTier = ideas.filter(i => i.tier >= t + 1).length
    } else {
      advancingFromThisTier = ideas.filter(i => i.status === 'ADVANCING' || i.status === 'WINNER').length
    }

    const status: 'completed' | 'active' | 'pending' = t < currentTier ? 'completed' : t === currentTier ? 'active' : 'pending'
    const isFinalShowdown = t > 1 && ideasAtThisTier <= 5 && ideasAtThisTier > 0 && t === currentTier && status === 'active'

    if (ideasAtThisTier > 0 || t === 1) {
      tiers.push({ tier: t, ideas: ideasAtThisTier, advancing: advancingFromThisTier, status, isFinalShowdown })
    }
  }

  const winner = ideas.find(i => i.status === 'WINNER')
  if (winner && tiers.length > 0) {
    const lastTier = tiers[tiers.length - 1]
    if (lastTier.status === 'active') {
      lastTier.status = 'completed'
      lastTier.advancing = 1
    }
  }

  if (tiers.length === 0) return null

  return (
    <div className="bg-background rounded-lg border border-border p-4 mb-4">
      <h3 className="text-sm font-medium text-muted mb-3">Tournament Progress</h3>
      <div className="space-y-2">
        {tiers.map((t, i, arr) => (
          <div key={t.tier} className="relative">
            <div className={`flex items-center gap-3 p-2 rounded-lg transition-all ${
              t.status === 'active' ? 'bg-warning-bg border border-warning' :
              t.status === 'completed' ? 'bg-success-bg border border-success' :
              'bg-surface border border-border'
            }`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                t.status === 'active' ? 'bg-warning text-white' :
                t.status === 'completed' ? 'bg-success text-white' :
                'bg-border text-muted'
              }`}>
                {t.tier}
              </div>
              <div className="flex-1">
                <div className="text-sm text-foreground font-medium">
                  Tier {t.tier} {t.isFinalShowdown && <span className="text-purple text-xs ml-1">(Final Showdown)</span>}
                </div>
                <div className="text-xs text-muted">
                  {t.ideas} idea{t.ideas !== 1 ? 's' : ''} {t.status === 'completed' && t.advancing > 0 ? `→ ${t.advancing} advancing` : ''}
                </div>
              </div>
              {t.status === 'completed' && (
                <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {t.status === 'active' && (
                <div className="w-5 h-5 border-2 border-warning border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            {i < arr.length - 1 && (
              <div className="absolute left-5 top-full w-0.5 h-2 bg-border" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
