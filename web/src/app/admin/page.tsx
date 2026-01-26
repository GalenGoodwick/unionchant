'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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
  }
  _count: {
    members: number
    ideas: number
  }
}

export default function AdminPage() {
  const [deliberations, setDeliberations] = useState<Deliberation[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all')
  const [search, setSearch] = useState('')

  const fetchDeliberations = async () => {
    try {
      const res = await fetch('/api/admin/deliberations')
      if (res.ok) {
        const data = await res.json()
        setDeliberations(data)
      }
    } catch (error) {
      console.error('Failed to fetch deliberations:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDeliberations()
  }, [])

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

  const phaseColor = (phase: string) => {
    switch (phase) {
      case 'SUBMISSION': return 'bg-blue-600'
      case 'VOTING': return 'bg-yellow-600'
      case 'COMPLETED': return 'bg-green-600'
      case 'ACCUMULATING': return 'bg-purple-600'
      default: return 'bg-slate-600'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/" className="text-slate-400 hover:text-slate-300 text-sm mb-2 inline-block">
              &larr; Back to home
            </Link>
            <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
          </div>
          <Link
            href="/admin/test"
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded"
          >
            Test Page
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-white">{deliberations.length}</div>
            <div className="text-slate-400 text-sm">Total Deliberations</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-blue-400">
              {deliberations.filter(d => d.phase === 'SUBMISSION').length}
            </div>
            <div className="text-slate-400 text-sm">In Submission</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-yellow-400">
              {deliberations.filter(d => d.phase === 'VOTING').length}
            </div>
            <div className="text-slate-400 text-sm">In Voting</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-green-400">
              {deliberations.filter(d => d.phase === 'COMPLETED').length}
            </div>
            <div className="text-slate-400 text-sm">Completed</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-800 rounded-lg p-4 mb-6 flex gap-4 items-center">
          <input
            type="text"
            placeholder="Search deliberations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-700 text-white rounded px-3 py-2 flex-1"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-2 rounded ${filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('public')}
              className={`px-3 py-2 rounded ${filter === 'public' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              Public
            </button>
            <button
              onClick={() => setFilter('private')}
              className={`px-3 py-2 rounded ${filter === 'private' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'}`}
            >
              Private
            </button>
          </div>
          <button
            onClick={fetchDeliberations}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded"
          >
            Refresh
          </button>
        </div>

        {/* Deliberations Table */}
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : filteredDeliberations.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No deliberations found</div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-700">
                <tr>
                  <th className="text-left p-4 text-slate-300 font-medium">Question</th>
                  <th className="text-left p-4 text-slate-300 font-medium">Phase</th>
                  <th className="text-left p-4 text-slate-300 font-medium">Members</th>
                  <th className="text-left p-4 text-slate-300 font-medium">Ideas</th>
                  <th className="text-left p-4 text-slate-300 font-medium">Creator</th>
                  <th className="text-left p-4 text-slate-300 font-medium">Created</th>
                  <th className="text-left p-4 text-slate-300 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeliberations.map((d) => (
                  <tr key={d.id} className="border-t border-slate-700 hover:bg-slate-700/50">
                    <td className="p-4">
                      <Link href={`/deliberations/${d.id}`} className="text-white hover:text-indigo-400">
                        {d.question.length > 50 ? d.question.slice(0, 50) + '...' : d.question}
                      </Link>
                      <div className="flex gap-1 mt-1">
                        {!d.isPublic && (
                          <span className="text-xs bg-slate-600 text-slate-300 px-1.5 py-0.5 rounded">
                            Private
                          </span>
                        )}
                        {d.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-xs bg-indigo-600/30 text-indigo-300 px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs text-white ${phaseColor(d.phase)}`}>
                        {d.phase}
                      </span>
                    </td>
                    <td className="p-4 text-slate-300">{d._count.members}</td>
                    <td className="p-4 text-slate-300">{d._count.ideas}</td>
                    <td className="p-4 text-slate-400 text-sm">
                      {d.creator.name || d.creator.email.split('@')[0]}
                    </td>
                    <td className="p-4 text-slate-400 text-sm">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Link
                          href={`/deliberations/${d.id}`}
                          className="text-indigo-400 hover:text-indigo-300 text-sm"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => handleDelete(d.id, d.question)}
                          disabled={deleting === d.id}
                          className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50"
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
