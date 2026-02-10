'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'

interface Contribution {
  id: string
  amountLamports: string
  verified: boolean
  user: { id: string; name: string | null }
  createdAt: string
}

interface LaunchDetail {
  id: string
  chantId: string
  name: string
  description: string | null
  targetLamports: string
  currentLamports: string
  status: string
  poolDeadline: string
  winnerIdeaId: string | null
  phase: string
  currentTier: number
  championId: string | null
  ideaCount: number
  memberCount: number
  cellCount: number
  creator: { id: string; name: string | null; walletAddress: string | null }
  contributions: Contribution[]
  createdAt: string
}

function lamportsToSol(lamports: string): string {
  return (Number(lamports) / 1_000_000_000).toFixed(2)
}

function PoolBar({ current, target }: { current: string; target: string }) {
  const pct = Math.min(100, (Number(current) / Number(target)) * 100)
  return (
    <div className="w-full bg-background rounded-full h-3 overflow-hidden">
      <div
        className="h-full bg-accent rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function LaunchDetailPage() {
  const { data: session } = useSession()
  const params = useParams()
  const id = params.id as string
  const [launch, setLaunch] = useState<LaunchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [contributeSol, setContributeSol] = useState('')
  const [contributing, setContributing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchLaunch = useCallback(async () => {
    try {
      const res = await fetch(`/api/launches/${id}`)
      if (res.ok) setLaunch(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetchLaunch() }, [fetchLaunch])

  async function handleContribute(e: React.FormEvent) {
    e.preventDefault()
    const sol = parseFloat(contributeSol)
    if (!sol || sol <= 0) { setError('Amount must be positive'); return }

    setContributing(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`/api/launches/${id}/contribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountSol: sol }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed'); return }
      setSuccess(`Contributed ${sol} SOL`)
      setContributeSol('')
      fetchLaunch()
    } catch {
      setError('Network error')
    } finally {
      setContributing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-12 text-center text-muted">Loading...</main>
      </div>
    )
  }

  if (!launch) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-12 text-center text-muted">Launch not found</main>
      </div>
    )
  }

  const pctFunded = Math.min(100, (Number(launch.currentLamports) / Number(launch.targetLamports)) * 100)
  const deadlinePassed = new Date(launch.poolDeadline) < new Date()

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/launches" className="text-sm text-muted hover:text-foreground mb-4 inline-block">
          &larr; All Launches
        </Link>

        <div className="bg-surface border border-border rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-2xl font-bold text-foreground">{launch.name}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              launch.status === 'FUNDING' ? 'bg-accent-light text-accent' :
              launch.status === 'COMPLETE' ? 'bg-success-bg text-success' :
              'bg-surface text-muted'
            }`}>
              {launch.status}
            </span>
          </div>

          {launch.description && (
            <p className="text-sm text-muted mb-4">{launch.description}</p>
          )}

          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-foreground">
              {lamportsToSol(launch.currentLamports)} SOL
            </span>
            <span className="text-sm text-muted">
              of {lamportsToSol(launch.targetLamports)} SOL ({pctFunded.toFixed(0)}%)
            </span>
          </div>
          <PoolBar current={launch.currentLamports} target={launch.targetLamports} />

          <div className="grid grid-cols-4 gap-4 mt-4 text-center">
            <div>
              <div className="text-lg font-mono font-bold text-foreground">{launch.ideaCount}</div>
              <div className="text-xs text-muted">Proposals</div>
            </div>
            <div>
              <div className="text-lg font-mono font-bold text-foreground">{launch.contributions.length}</div>
              <div className="text-xs text-muted">Contributors</div>
            </div>
            <div>
              <div className="text-lg font-mono font-bold text-foreground">{launch.cellCount}</div>
              <div className="text-xs text-muted">Cells</div>
            </div>
            <div>
              <div className="text-lg font-mono font-bold text-foreground">T{launch.currentTier}</div>
              <div className="text-xs text-muted">Tier</div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border text-xs text-muted">
            <span>Created by {launch.creator.name || 'Anonymous'}</span>
            <span>{deadlinePassed ? 'Deadline passed' : `Deadline: ${new Date(launch.poolDeadline).toLocaleDateString()}`}</span>
          </div>
        </div>

        {/* Contribute */}
        {launch.status === 'FUNDING' && !deadlinePassed && session && (
          <div className="bg-surface border border-border rounded-xl p-5 mb-6">
            <h2 className="text-lg font-semibold text-foreground mb-3">Contribute SOL</h2>
            <form onSubmit={handleContribute} className="flex gap-3">
              <input
                type="number"
                value={contributeSol}
                onChange={e => setContributeSol(e.target.value)}
                placeholder="Amount in SOL"
                min="0.01"
                step="0.01"
                className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={contributing}
                className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {contributing ? '...' : 'Contribute'}
              </button>
            </form>
            {error && <p className="text-sm text-error mt-2">{error}</p>}
            {success && <p className="text-sm text-success mt-2">{success}</p>}
            <p className="text-xs text-muted mt-2">
              Phase 1: honor-system tracking. On-chain escrow coming in Phase 2.
            </p>
          </div>
        )}

        {/* Link to chant for proposals/voting */}
        <div className="bg-surface border border-border rounded-xl p-5 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-2">Deliberation</h2>
          <p className="text-sm text-muted mb-3">
            Submit project proposals and vote in the linked deliberation. 5 AI agents evaluate each proposal in cells.
          </p>
          <Link
            href={`/chants/${launch.chantId}`}
            className="inline-block px-4 py-2 bg-warning text-black rounded-lg text-sm font-medium hover:bg-warning-hover transition-colors"
          >
            View Proposals &amp; Vote
          </Link>
        </div>

        {/* Contributors */}
        {launch.contributions.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <h2 className="text-lg font-semibold text-foreground mb-3">Contributors</h2>
            <div className="space-y-2">
              {launch.contributions.map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{c.user.name || 'Anonymous'}</span>
                  <span className="font-mono text-muted">{lamportsToSol(c.amountLamports)} SOL</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
