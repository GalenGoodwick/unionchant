'use client'

import { getDisplayName } from '@/lib/user'
import type { Idea } from './types'

export default function DefenderCard({
  defender,
  isFinalShowdown,
}: {
  defender: Idea
  isFinalShowdown?: boolean
}) {
  return (
    <div className="bg-orange-bg border-2 border-orange rounded-[10px] p-4">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-5 h-5 text-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span className="text-xs font-bold text-orange uppercase tracking-wider">Defending Priority</span>
        {isFinalShowdown && <span className="text-xs text-orange">(Final Showdown)</span>}
      </div>
      <p className="text-foreground font-medium text-base leading-snug mb-2">
        {defender.text}
      </p>
      <div>
        <span className="text-sm text-orange">{getDisplayName(defender.author)}</span>
        <p className="text-xs text-muted mt-0.5">Won original vote · Enters at Tier 2 (advantage)</p>
      </div>
    </div>
  )
}
