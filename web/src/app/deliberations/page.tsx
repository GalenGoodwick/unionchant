'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getDisplayName } from '@/lib/user'
import { useAdmin } from '@/hooks/useAdmin'

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED'

type Deliberation = {
  id: string
  question: string
  description: string | null
  phase: string
  tags: string[]
  createdAt: string
  creator: {
    name: string | null
    status?: UserStatus
  }
  _count: {
    members: number
    ideas: number
  }
}

function DeliberationsList() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleRowClick = (id: string) => {
    router.push(`/deliberations/${id}`)
  }
  const [deliberations, setDeliberations] = useState<Deliberation[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [phaseFilter, setPhaseFilter] = useState<string>('all')

  const activeTag = searchParams.get('tag')

  useEffect(() => {
    const url = activeTag ? `/api/deliberations?tag=${encodeURIComponent(activeTag)}` : '/api/deliberations'
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch')
        return res.json()
      })
      .then(data => {
        // Ensure we have an array
        const items = Array.isArray(data) ? data : []
        setDeliberations(items)
        // Collect all unique tags
        const tags = new Set<string>()
        items.forEach((d: Deliberation) => d.tags?.forEach((t: string) => tags.add(t)))
        setAllTags(Array.from(tags).sort())
        setLoading(false)
      })
      .catch(() => {
        setDeliberations([])
        setLoading(false)
      })
  }, [activeTag])

  const handleTagClick = (tag: string) => {
    if (activeTag === tag) {
      router.push('/deliberations')
    } else {
      router.push(`/deliberations?tag=${encodeURIComponent(tag)}`)
    }
  }

  const phaseStyles: Record<string, string> = {
    SUBMISSION: 'bg-accent text-white',
    VOTING: 'bg-warning text-white',
    COMPLETED: 'bg-success text-white',
    ACCUMULATING: 'bg-purple text-white',
  }

  const filteredDeliberations = deliberations.filter(d => {
    if (phaseFilter !== 'all' && d.phase !== phaseFilter) return false
    if (search && !d.question.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Stats
  const stats = {
    total: deliberations.length,
    submission: deliberations.filter(d => d.phase === 'SUBMISSION').length,
    voting: deliberations.filter(d => d.phase === 'VOTING').length,
    completed: deliberations.filter(d => d.phase === 'COMPLETED').length,
  }

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6">
        <div className="bg-background rounded-lg border border-border p-3 sm:p-4">
          <div className="text-2xl sm:text-3xl font-bold text-foreground font-mono">{stats.total}</div>
          <div className="text-muted text-xs sm:text-sm">Total</div>
        </div>
        <div className="bg-background rounded-lg border border-border p-3 sm:p-4">
          <div className="text-2xl sm:text-3xl font-bold text-accent font-mono">{stats.submission}</div>
          <div className="text-muted text-xs sm:text-sm">Submission</div>
        </div>
        <div className="bg-background rounded-lg border border-border p-3 sm:p-4">
          <div className="text-2xl sm:text-3xl font-bold text-warning font-mono">{stats.voting}</div>
          <div className="text-muted text-xs sm:text-sm">Voting</div>
        </div>
        <div className="bg-background rounded-lg border border-border p-3 sm:p-4">
          <div className="text-2xl sm:text-3xl font-bold text-success font-mono">{stats.completed}</div>
          <div className="text-muted text-xs sm:text-sm">Completed</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-background rounded-lg border border-border p-3 sm:p-4 mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center">
        <input
          type="text"
          placeholder="Search deliberations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-surface border border-border text-foreground rounded-lg px-3 py-2 flex-1 min-w-0 focus:outline-none focus:border-accent"
        />
        <div className="flex gap-1 sm:gap-2 flex-wrap">
          {['all', 'SUBMISSION', 'VOTING', 'COMPLETED', 'ACCUMULATING'].map(phase => (
            <button
              key={phase}
              onClick={() => setPhaseFilter(phase)}
              className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors ${
                phaseFilter === phase
                  ? 'bg-header text-white'
                  : 'bg-surface text-muted border border-border hover:border-border-strong'
              }`}
            >
              {phase === 'all' ? 'All' : phase.charAt(0) + phase.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                activeTag === tag
                  ? 'bg-header text-white'
                  : 'bg-background text-muted border border-border hover:border-border-strong'
              }`}
            >
              {tag}
            </button>
          ))}
          {activeTag && (
            <button
              onClick={() => router.push('/deliberations')}
              className="px-3 py-1 text-sm text-muted hover:text-foreground"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Table - Desktop / Card list - Mobile */}
      <div className="bg-background rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted">Loading...</div>
        ) : filteredDeliberations.length === 0 ? (
          <div className="p-8 text-center text-muted">No deliberations found</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface border-b border-border">
                  <tr>
                    <th className="text-left p-4 text-muted font-medium text-sm">Question</th>
                    <th className="text-left p-4 text-muted font-medium text-sm">Phase</th>
                    <th className="text-left p-4 text-muted font-medium text-sm">Members</th>
                    <th className="text-left p-4 text-muted font-medium text-sm">Ideas</th>
                    <th className="text-left p-4 text-muted font-medium text-sm">Creator</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeliberations.map((d) => (
                    <tr key={d.id} onClick={() => handleRowClick(d.id)} className="border-t border-border hover:bg-surface cursor-pointer">
                      <td className="p-4">
                        <Link href={`/deliberations/${d.id}`} className="text-foreground hover:text-accent font-medium">
                          {d.question.length > 60 ? d.question.slice(0, 60) + '...' : d.question}
                        </Link>
                        {d.tags && d.tags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {d.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="text-xs bg-surface text-muted px-1.5 py-0.5 rounded border border-border">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${phaseStyles[d.phase] || 'bg-surface text-muted'}`}>
                          {d.phase}
                        </span>
                      </td>
                      <td className="p-4 text-muted font-mono">{d._count.members}</td>
                      <td className="p-4 text-muted font-mono">{d._count.ideas}</td>
                      <td className="p-4 text-muted-light text-sm">
                        {getDisplayName(d.creator)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-border">
              {filteredDeliberations.map((d) => (
                <div
                  key={d.id}
                  onClick={() => handleRowClick(d.id)}
                  className="p-4 hover:bg-surface cursor-pointer"
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <Link href={`/deliberations/${d.id}`} className="text-foreground hover:text-accent font-medium text-sm flex-1">
                      {d.question.length > 50 ? d.question.slice(0, 50) + '...' : d.question}
                    </Link>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${phaseStyles[d.phase] || 'bg-surface text-muted'}`}>
                      {d.phase}
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted">
                    <span className="font-mono">{d._count.members} members</span>
                    <span className="font-mono">{d._count.ideas} ideas</span>
                    <span>{getDisplayName(d.creator)}</span>
                  </div>
                  {d.tags && d.tags.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {d.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs bg-surface text-muted px-1.5 py-0.5 rounded border border-border">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

export default function DeliberationsPage() {
  const { data: session } = useSession()
  const { isAdmin } = useAdmin()

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-header text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-semibold font-serif hover:text-accent-light transition-colors">
            Union Chant
          </Link>
          <nav className="flex gap-4 text-sm">
            {isAdmin && (
              <Link href="/admin" className="text-orange-300 hover:text-orange-200 transition-colors">
                Admin
              </Link>
            )}
            {session && (
              <Link href="/settings" className="hover:text-accent-light transition-colors">
                Settings
              </Link>
            )}
            <Link href="/auth/signin" className="hover:text-accent-light transition-colors">
              {session ? 'Account' : 'Sign In'}
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <div>
            <Link href="/" className="text-muted hover:text-foreground text-sm mb-2 inline-block">
              &larr; Back to home
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Deliberations</h1>
          </div>
          {session && (
            <Link
              href="/deliberations/new"
              className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              New Deliberation
            </Link>
          )}
        </div>

        <Suspense fallback={<div className="text-muted text-center py-12">Loading...</div>}>
          <DeliberationsList />
        </Suspense>
      </div>
    </div>
  )
}
