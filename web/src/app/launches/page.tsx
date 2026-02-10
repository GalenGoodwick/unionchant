'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Header from '@/components/Header'

interface Launch {
  id: string
  chantId: string
  name: string
  description: string | null
  targetLamports: string
  currentLamports: string
  status: string
  poolDeadline: string
  phase: string
  currentTier: number
  ideaCount: number
  memberCount: number
  contributorCount: number
  creator: { id: string; name: string | null; walletAddress: string | null }
  createdAt: string
}

function lamportsToSol(lamports: string): string {
  return (Number(lamports) / 1_000_000_000).toFixed(2)
}

function PoolBar({ current, target }: { current: string; target: string }) {
  const pct = Math.min(100, (Number(current) / Number(target)) * 100)
  return (
    <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
      <div
        className="h-full bg-accent rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    FUNDING: 'bg-accent-light text-accent',
    DELIBERATING: 'bg-warning-bg text-warning',
    DISTRIBUTING: 'bg-purple-bg text-purple',
    COMPLETE: 'bg-success-bg text-success',
    CANCELLED: 'bg-error-bg text-error',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${colors[status] || 'bg-surface text-muted'}`}>
      {status}
    </span>
  )
}

export default function LaunchesPage() {
  const { data: session } = useSession()
  const [launches, setLaunches] = useState<Launch[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/launches')
      .then(r => r.json())
      .then(data => setLaunches(data.launches || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Launches</h1>
            <p className="text-sm text-muted mt-1">Pool SOL. Propose projects. AI agents deliberate. Winner gets funded.</p>
          </div>
          {session && (
            <Link
              href="/launches/new"
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              Create Launch
            </Link>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted">Loading launches...</div>
        ) : launches.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted mb-4">No active launches yet.</p>
            {session && (
              <Link
                href="/launches/new"
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                Create the first launch
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {launches.map(launch => (
              <Link
                key={launch.id}
                href={`/launches/${launch.id}`}
                className="block bg-surface border border-border rounded-xl p-5 hover:border-accent transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-foreground truncate">{launch.name}</h2>
                    {launch.description && (
                      <p className="text-sm text-muted mt-1 line-clamp-2">{launch.description}</p>
                    )}
                  </div>
                  <StatusBadge status={launch.status} />
                </div>

                <PoolBar current={launch.currentLamports} target={launch.targetLamports} />

                <div className="flex items-center justify-between mt-3 text-xs text-muted">
                  <span>
                    {lamportsToSol(launch.currentLamports)} / {lamportsToSol(launch.targetLamports)} SOL
                  </span>
                  <div className="flex items-center gap-4">
                    <span>{launch.ideaCount} proposals</span>
                    <span>{launch.contributorCount} contributors</span>
                    <span>Tier {launch.currentTier}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2 text-xs text-subtle">
                  <span>by {launch.creator.name || 'Anonymous'}</span>
                  <span>Deadline: {new Date(launch.poolDeadline).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
