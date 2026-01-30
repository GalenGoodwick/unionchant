'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Spinner from '@/components/Spinner'

type Match = {
  user: { id: string; name: string; image: string | null }
  agreeCount: number
  disagreeCount: number
  totalCells: number
  agreementPct: number
}

export default function AgreementLeaderboard() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/user/me/agreement')
      .then(r => r.json())
      .then(d => setMatches(d.matches || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-4"><Spinner size="sm" label="Loading agreement data" /></div>
  if (matches.length === 0) return null

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-3">People who vote like you</h2>
      <div className="bg-background rounded-xl border border-border divide-y divide-border">
        {matches.map(match => (
          <Link
            key={match.user.id}
            href={`/user/${match.user.id}`}
            className="flex items-center gap-3 p-4 hover:bg-surface transition-colors"
          >
            {match.user.image ? (
              <img src={match.user.image} alt="" className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                <span className="text-accent font-semibold">{match.user.name.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-foreground font-medium truncate">{match.user.name}</p>
              <p className="text-muted text-xs">{match.totalCells} shared cells</p>
            </div>
            <div className="text-right">
              <span className={`text-lg font-bold font-mono ${
                match.agreementPct >= 70 ? 'text-success' : match.agreementPct >= 40 ? 'text-warning' : 'text-muted'
              }`}>
                {match.agreementPct}%
              </span>
              <p className="text-xs text-muted">agreement</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
