'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

interface Chant {
  id: string
  question: string
  phase: string
  isPublic: boolean
  currentTier: number
  createdAt: string
  _count: { members: number; ideas: number }
}

interface Group {
  id: string
  name: string
  slug: string
  isPublic: boolean
  createdAt: string
  role: string
  _count: { members: number; deliberations: number }
}

export default function ManagePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [chants, setChants] = useState<Chant[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [tier, setTier] = useState('free')
  const [actioningId, setActioningId] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }
    if (status !== 'authenticated') return

    async function load() {
      try {
        const [chantsRes, groupsRes, meRes] = await Promise.all([
          fetch('/api/deliberations/mine'),
          fetch('/api/communities/mine'),
          fetch('/api/user/me'),
        ])
        if (chantsRes.ok) setChants(await chantsRes.json())
        if (groupsRes.ok) setGroups(await groupsRes.json())
        if (meRes.ok) {
          const data = await meRes.json()
          setTier(data.user?.subscriptionTier || 'free')
        }
      } catch { /* silent */ }
      setLoading(false)
    }
    load()
  }, [status, router])

  const deleteChant = async (id: string) => {
    if (!confirm('Delete this chant and all its data? This cannot be undone.')) return
    setActioningId(id)
    try {
      const res = await fetch(`/api/admin/deliberations/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setChants(prev => prev.filter(c => c.id !== id))
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to delete')
      }
    } catch {
      alert('Failed to delete')
    }
    setActioningId(null)
  }

  const deleteGroup = async (slug: string, id: string) => {
    if (!confirm('Delete this group? Chants will be unlinked but not deleted.')) return
    setActioningId(id)
    try {
      const res = await fetch(`/api/communities/${slug}`, { method: 'DELETE' })
      if (res.ok) {
        setGroups(prev => prev.filter(g => g.id !== id))
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to delete')
      }
    } catch {
      alert('Failed to delete')
    }
    setActioningId(null)
  }

  const makePrivate = async (type: 'chant' | 'group', item: Chant | Group) => {
    if (tier === 'free') {
      router.push('/pricing')
      return
    }
    setActioningId(item.id)
    try {
      if (type === 'chant') {
        const res = await fetch(`/api/deliberations/${item.id}/manage`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPublic: false }),
        })
        if (res.ok) {
          setChants(prev => prev.map(c => c.id === item.id ? { ...c, isPublic: false } : c))
        } else {
          const data = await res.json().catch(() => ({}))
          alert(data.message || data.error || 'Failed to make private')
        }
      } else {
        const g = item as Group
        const res = await fetch(`/api/communities/${g.slug}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPublic: false }),
        })
        if (res.ok) {
          setGroups(prev => prev.map(gr => gr.id === item.id ? { ...gr, isPublic: false } : gr))
        } else {
          const data = await res.json().catch(() => ({}))
          alert(data.message || data.error || 'Failed to make private')
        }
      }
    } catch {
      alert('Something went wrong')
    }
    setActioningId(null)
  }

  const makePublic = async (type: 'chant' | 'group', item: Chant | Group) => {
    setActioningId(item.id)
    try {
      if (type === 'chant') {
        const res = await fetch(`/api/deliberations/${item.id}/manage`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPublic: true }),
        })
        if (res.ok) {
          setChants(prev => prev.map(c => c.id === item.id ? { ...c, isPublic: true } : c))
        }
      } else {
        const g = item as Group
        const res = await fetch(`/api/communities/${g.slug}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPublic: true }),
        })
        if (res.ok) {
          setGroups(prev => prev.map(gr => gr.id === item.id ? { ...gr, isPublic: true } : gr))
        }
      }
    } catch { /* silent */ }
    setActioningId(null)
  }

  if (status === 'loading' || loading) {
    return (
      <FrameLayout active="chants" showBack>
        <div className="flex items-center justify-center py-16">
          <div className="text-xs text-muted animate-pulse">Loading...</div>
        </div>
      </FrameLayout>
    )
  }

  return (
    <FrameLayout active="chants" showBack>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-sm font-bold text-foreground">Manage</h1>
      </div>

      {/* Chants */}
      <h2 className="text-xs font-semibold text-foreground mb-2">Your Chants</h2>
      {chants.length === 0 ? (
        <p className="text-muted text-xs mb-4">No chants created yet.</p>
      ) : (
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg divide-y divide-border mb-4">
          {chants.map(c => (
            <div key={c.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/chants/${c.id}`} className="text-xs text-foreground hover:text-accent font-medium line-clamp-2">
                    {c.question}
                  </Link>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted">
                    <span className={`px-1.5 py-0.5 rounded font-medium ${
                      c.phase === 'COMPLETED' ? 'bg-success-bg text-success' :
                      c.phase === 'VOTING' ? 'bg-warning-bg text-warning' :
                      'bg-surface text-muted'
                    }`}>{c.phase}</span>
                    <span>{c._count.members} members</span>
                    <span>{c._count.ideas} ideas</span>
                    <span className={c.isPublic ? 'text-muted' : 'text-purple'}>{c.isPublic ? 'Public' : 'Private'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {c.isPublic ? (
                    <button
                      onClick={() => makePrivate('chant', c)}
                      disabled={actioningId === c.id}
                      className="text-xs text-purple hover:text-purple border border-purple/30 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
                    >
                      Make private
                    </button>
                  ) : (
                    <button
                      onClick={() => makePublic('chant', c)}
                      disabled={actioningId === c.id}
                      className="text-xs text-accent hover:text-accent border border-accent/30 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
                    >
                      Make public
                    </button>
                  )}
                  <button
                    onClick={() => deleteChant(c.id)}
                    disabled={actioningId === c.id}
                    className="text-xs text-error hover:text-error-hover border border-error/30 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Groups */}
      <h2 className="text-xs font-semibold text-foreground mb-2">Your Groups</h2>
      {groups.length === 0 ? (
        <p className="text-muted text-xs mb-4">No groups yet.</p>
      ) : (
        <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg divide-y divide-border mb-4">
          {groups.map(g => (
            <div key={g.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/groups/${g.slug}`} className="text-xs text-foreground hover:text-accent font-medium">
                    {g.name}
                  </Link>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted">
                    <span className="px-1.5 py-0.5 rounded font-medium bg-surface">{g.role}</span>
                    <span>{g._count.members} members</span>
                    <span>{g._count.deliberations} chants</span>
                    <span className={g.isPublic ? 'text-muted' : 'text-purple'}>{g.isPublic ? 'Public' : 'Private'}</span>
                  </div>
                </div>
                {g.role === 'OWNER' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {g.isPublic ? (
                      <button
                        onClick={() => makePrivate('group', g)}
                        disabled={actioningId === g.id}
                        className="text-xs text-purple hover:text-purple border border-purple/30 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
                      >
                        Make private
                      </button>
                    ) : (
                      <button
                        onClick={() => makePublic('group', g)}
                        disabled={actioningId === g.id}
                        className="text-xs text-accent hover:text-accent border border-accent/30 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
                      >
                        Make public
                      </button>
                    )}
                    <button
                      onClick={() => deleteGroup(g.slug, g.id)}
                      disabled={actioningId === g.id}
                      className="text-xs text-error hover:text-error-hover border border-error/30 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tier === 'free' && (
        <div className="bg-purple-bg border border-purple/20 rounded-lg p-3 text-xs text-purple">
          Private chants and groups require a Pro subscription.{' '}
          <Link href="/pricing" className="underline font-medium">Upgrade</Link>
        </div>
      )}
    </FrameLayout>
  )
}
