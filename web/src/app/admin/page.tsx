'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { getDisplayName } from '@/lib/user'

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED'

interface Deliberation {
  id: string
  question: string
  phase: string
  isPublic: boolean
  tags: string[]
  createdAt: string
  creator: {
    name: string | null
    email: string
    status?: UserStatus
  }
  _count: {
    members: number
    ideas: number
  }
}

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [deliberations, setDeliberations] = useState<Deliberation[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all')
  const [search, setSearch] = useState('')

  const fetchDeliberations = async () => {
    try {
      const res = await fetch('/api/admin/deliberations')
      if (res.ok) {
        const data = await res.json()
        // Ensure we have an array
        setDeliberations(Array.isArray(data) ? data : [])
      } else {
        setDeliberations([])
      }
    } catch (error) {
      console.error('Failed to fetch deliberations:', error)
      setDeliberations([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }

    if (status === 'authenticated') {
      // Check admin status
      fetch('/api/admin/check')
        .then(res => res.json())
        .then(data => {
          setIsAdmin(data.isAdmin)
          if (data.isAdmin) {
            fetchDeliberations()
          }
        })
        .catch(() => setIsAdmin(false))
    }
  }, [status, router])

  const handleDelete = async (id: string, question: string) => {
    if (!confirm(`Are you sure you want to delete "${question}"?\n\nThis will permanently delete all ideas, votes, and comments.`)) {
      return
    }

    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/deliberations/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setDeliberations(prev => prev.filter(d => d.id !== id))
      } else {
        const error = await res.json()
        alert(`Failed to delete: ${error.error}`)
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete deliberation')
    } finally {
      setDeleting(null)
    }
  }

  const filteredDeliberations = deliberations.filter(d => {
    if (filter === 'public' && !d.isPublic) return false
    if (filter === 'private' && d.isPublic) return false
    if (search && !d.question.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const phaseStyles: Record<string, string> = {
    SUBMISSION: 'bg-accent text-white',
    VOTING: 'bg-warning text-white',
    COMPLETED: 'bg-success text-white',
    ACCUMULATING: 'bg-purple text-white',
  }

  // Loading state
  if (status === 'loading' || isAdmin === null) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    )
  }

  // Block non-admin users
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Access Denied</h1>
          <p className="text-muted mb-6">You don&apos;t have permission to access this page.</p>
          <Link href="/" className="text-accent hover:text-accent-hover">
            Go to homepage
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-header text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-semibold font-serif hover:text-accent-light transition-colors">
            Union Chant
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/deliberations" className="hover:text-accent-light transition-colors">
              Deliberations
            </Link>
            {isAdmin && (
              <Link href="/admin/test" className="hover:text-accent-light transition-colors">
                Test Page
              </Link>
            )}
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Link href="/" className="text-muted hover:text-foreground text-sm mb-2 inline-block">
              &larr; Back to home
            </Link>
            <h1 className="text-2xl font-bold text-foreground">
              {isAdmin ? 'Admin Panel' : 'Your Deliberations'}
            </h1>
            {isAdmin && (
              <p className="text-muted text-sm mt-1">Full admin access enabled</p>
            )}
          </div>
          {isAdmin && (
            <Link
              href="/admin/test"
              className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg transition-colors"
            >
              Test Page
            </Link>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-background rounded-lg border border-border p-4">
            <div className="text-3xl font-bold text-foreground font-mono">{deliberations.length}</div>
            <div className="text-muted text-sm">{isAdmin ? 'All Deliberations' : 'Your Deliberations'}</div>
          </div>
          <div className="bg-background rounded-lg border border-border p-4">
            <div className="text-3xl font-bold text-accent font-mono">
              {deliberations.filter(d => d.phase === 'SUBMISSION').length}
            </div>
            <div className="text-muted text-sm">In Submission</div>
          </div>
          <div className="bg-background rounded-lg border border-border p-4">
            <div className="text-3xl font-bold text-warning font-mono">
              {deliberations.filter(d => d.phase === 'VOTING').length}
            </div>
            <div className="text-muted text-sm">In Voting</div>
          </div>
          <div className="bg-background rounded-lg border border-border p-4">
            <div className="text-3xl font-bold text-success font-mono">
              {deliberations.filter(d => d.phase === 'COMPLETED').length}
            </div>
            <div className="text-muted text-sm">Completed</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-background rounded-lg border border-border p-4 mb-6 flex gap-4 items-center flex-wrap">
          <input
            type="text"
            placeholder="Search deliberations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-surface border border-border text-foreground rounded-lg px-3 py-2 flex-1 min-w-[200px] focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'all' ? 'bg-header text-white' : 'bg-surface text-muted border border-border'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('public')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'public' ? 'bg-header text-white' : 'bg-surface text-muted border border-border'
              }`}
            >
              Public
            </button>
            <button
              onClick={() => setFilter('private')}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                filter === 'private' ? 'bg-header text-white' : 'bg-surface text-muted border border-border'
              }`}
            >
              Private
            </button>
          </div>
          <button
            onClick={fetchDeliberations}
            className="bg-surface hover:bg-surface-alt text-muted border border-border px-3 py-2 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Deliberations Table */}
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted">Loading...</div>
          ) : filteredDeliberations.length === 0 ? (
            <div className="p-8 text-center text-muted">No deliberations found</div>
          ) : (
            <table className="w-full">
              <thead className="bg-surface border-b border-border">
                <tr>
                  <th className="text-left p-4 text-muted font-medium text-sm">Question</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Phase</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Members</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Ideas</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Creator</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Created</th>
                  <th className="text-left p-4 text-muted font-medium text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeliberations.map((d) => (
                  <tr key={d.id} className="border-t border-border hover:bg-surface">
                    <td className="p-4">
                      <Link href={`/deliberations/${d.id}`} className="text-foreground hover:text-accent font-medium">
                        {d.question.length > 50 ? d.question.slice(0, 50) + '...' : d.question}
                      </Link>
                      <div className="flex gap-1 mt-1">
                        {!d.isPublic && (
                          <span className="text-xs bg-surface text-muted px-1.5 py-0.5 rounded border border-border">
                            Private
                          </span>
                        )}
                        {d.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-xs bg-accent-light text-accent px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${phaseStyles[d.phase] || 'bg-surface text-muted'}`}>
                        {d.phase}
                      </span>
                    </td>
                    <td className="p-4 text-muted font-mono">{d._count.members}</td>
                    <td className="p-4 text-muted font-mono">{d._count.ideas}</td>
                    <td className="p-4 text-muted-light text-sm">
                      {getDisplayName(d.creator, d.creator.email.split('@')[0])}
                    </td>
                    <td className="p-4 text-muted-light text-sm font-mono">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Link
                          href={`/deliberations/${d.id}`}
                          className="text-accent hover:text-accent-hover text-sm"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => handleDelete(d.id, d.question)}
                          disabled={deleting === d.id}
                          className="text-error hover:text-error-hover text-sm disabled:opacity-50"
                        >
                          {deleting === d.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
