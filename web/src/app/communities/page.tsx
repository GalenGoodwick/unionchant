'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'

type Community = {
  id: string
  name: string
  slug: string
  description: string | null
  isPublic: boolean
  createdAt: string
  role?: string
  creator: { name: string | null; status: string }
  _count: { members: number; deliberations: number }
}

export default function CommunitiesPage() {
  const { data: session } = useSession()
  const [publicCommunities, setPublicCommunities] = useState<Community[]>([])
  const [myCommunities, setMyCommunities] = useState<Community[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = search ? `?search=${encodeURIComponent(search)}` : ''
        const promises: Promise<Response>[] = [
          fetch(`/api/communities${params}`),
        ]
        if (session) {
          promises.push(fetch('/api/communities/mine'))
        }

        const results = await Promise.all(promises)
        const publicData = await results[0].json()
        setPublicCommunities(publicData.communities || [])

        if (results[1]) {
          const mineData = await results[1].json()
          setMyCommunities(Array.isArray(mineData) ? mineData : [])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [session, search])

  const mySlugs = new Set(myCommunities.map(c => c.slug))

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Communities</h1>
          {session && (
            <Link
              href="/communities/new"
              className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              + Create
            </Link>
          )}
        </div>

        {/* My Communities */}
        {session && myCommunities.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-3">My Communities</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {myCommunities.map(c => (
                <Link
                  key={c.id}
                  href={`/communities/${c.slug}`}
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
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-3">Discover</h2>
          <input
            type="text"
            placeholder="Search communities..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-light focus:outline-none focus:border-accent"
          />
        </div>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-surface border border-border rounded-lg p-4">
                <div className="h-5 bg-background rounded w-2/3 mb-3" />
                <div className="h-4 bg-background rounded w-1/3" />
              </div>
            ))}
          </div>
        )}

        {error && <div className="bg-error-bg text-error p-4 rounded-lg">{error}</div>}

        {!loading && !error && (
          <div className="space-y-3">
            {publicCommunities.length === 0 && (
              <div className="text-center py-12 bg-surface border border-border rounded-lg">
                <p className="text-muted">
                  {search ? 'No communities found matching your search.' : 'No public communities yet.'}
                </p>
                {session && !search && (
                  <Link
                    href="/communities/new"
                    className="inline-block mt-4 bg-accent hover:bg-accent-hover text-white px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    Create the First Community
                  </Link>
                )}
              </div>
            )}
            {publicCommunities.map(c => (
              <Link
                key={c.id}
                href={`/communities/${c.slug}`}
                className="block bg-surface border border-border rounded-lg p-4 hover:border-accent transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-foreground font-medium">{c.name}</h3>
                    {c.description && (
                      <p className="text-muted text-sm mt-1 line-clamp-2">{c.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {mySlugs.has(c.slug) && (
                      <span className="text-xs px-2 py-0.5 rounded bg-success-bg text-success border border-success">
                        Joined
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted">
                  <span>{c._count.members} members</span>
                  <span>{c._count.deliberations} deliberations</span>
                  <span>by {c.creator.name || 'Anonymous'}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
