'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'

interface DeliberationSummary {
  id: string
  question: string
  phase: string
  isPublic: boolean
  organization: string | null
  currentTier: number
  createdAt: string
  _count: {
    members: number
    ideas: number
  }
}

interface CommunitySummary {
  id: string
  name: string
  slug: string
  description: string | null
  role: string
  _count: { members: number; deliberations: number }
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [deliberations, setDeliberations] = useState<DeliberationSummary[]>([])
  const [communities, setCommunities] = useState<CommunitySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }
    if (status === 'authenticated') {
      Promise.all([
        fetch('/api/deliberations/mine').then(res => {
          if (!res.ok) throw new Error('Failed to fetch')
          return res.json()
        }),
        fetch('/api/communities/mine').then(res => {
          if (!res.ok) return []
          return res.json()
        }),
      ])
        .then(([delibData, commData]) => {
          setDeliberations(delibData)
          setCommunities(Array.isArray(commData) ? commData : [])
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [status, router])

  const phaseColors: Record<string, string> = {
    SUBMISSION: 'bg-blue-500',
    VOTING: 'bg-warning',
    ACCUMULATING: 'bg-purple',
    COMPLETED: 'bg-success',
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">My Deliberations</h1>
          <Link
            href="/deliberations/new"
            className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            + Create New
          </Link>
        </div>

        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-surface border border-border rounded-lg p-4">
                <div className="h-5 bg-background rounded w-2/3 mb-3" />
                <div className="h-4 bg-background rounded w-1/3" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-error-bg text-error p-4 rounded-lg">{error}</div>
        )}

        {!loading && !error && deliberations.length === 0 && (
          <div className="text-center py-16 bg-surface border border-border rounded-lg">
            <p className="text-muted text-lg mb-4">You haven&apos;t created any deliberations yet.</p>
            <Link
              href="/deliberations/new"
              className="bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-lg font-medium transition-colors inline-block"
            >
              Create Your First Deliberation
            </Link>
          </div>
        )}

        {!loading && !error && deliberations.length > 0 && (
          <div className="space-y-3">
            {deliberations.map(d => (
              <Link
                key={d.id}
                href={`/dashboard/${d.id}`}
                className="block bg-surface border border-border rounded-lg p-4 hover:border-accent transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-foreground font-medium truncate">{d.question}</h2>
                    {d.organization && (
                      <p className="text-sm text-muted mt-0.5">{d.organization}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded text-white text-xs ${phaseColors[d.phase] || 'bg-muted'}`}>
                      {d.phase}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs ${d.isPublic ? 'bg-success-bg text-success border border-success' : 'bg-error-bg text-error border border-error'}`}>
                      {d.isPublic ? 'Public' : 'Private'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted">
                  <span>{d._count.members} members</span>
                  <span>{d._count.ideas} ideas</span>
                  {d.phase === 'VOTING' && <span>Tier {d.currentTier}</span>}
                  <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* My Communities */}
        {!loading && !error && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">My Communities</h2>
              <Link
                href="/communities"
                className="text-accent hover:text-accent-hover text-sm transition-colors"
              >
                Browse All
              </Link>
            </div>

            {communities.length === 0 ? (
              <div className="text-center py-8 bg-surface border border-border rounded-lg">
                <p className="text-muted mb-4">You haven&apos;t joined any communities yet.</p>
                <Link
                  href="/communities"
                  className="text-accent hover:text-accent-hover font-medium"
                >
                  Discover Communities
                </Link>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {communities.map(c => (
                  <Link
                    key={c.id}
                    href={c.role === 'OWNER' || c.role === 'ADMIN' ? `/communities/${c.slug}/settings` : `/communities/${c.slug}`}
                    className="bg-surface border border-border rounded-lg p-4 hover:border-accent transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-foreground font-medium truncate">{c.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent shrink-0">
                        {c.role}
                      </span>
                    </div>
                    {c.description && (
                      <p className="text-muted text-sm mt-1 line-clamp-2">{c.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                      <span>{c._count.members} members</span>
                      <span>{c._count.deliberations} deliberations</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
