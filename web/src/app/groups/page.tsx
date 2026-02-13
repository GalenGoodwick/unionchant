'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'

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
  const [tab, setTab] = useState<'mine' | 'discover'>('mine')

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
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [session, search])

  const mySlugs = new Set(myCommunities.map(c => c.slug))
  const displayList = tab === 'mine' ? myCommunities : publicCommunities

  return (
    <FrameLayout
      active="groups"
      header={
        <div className="space-y-2 pb-3">
          <div className="flex gap-1.5">
            {(['mine', 'discover'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2.5 py-1 text-xs rounded-lg whitespace-nowrap transition-colors ${
                  tab === t
                    ? 'bg-accent/15 text-accent font-medium'
                    : 'text-muted hover:text-foreground hover:bg-surface/80'
                }`}
              >
                {t === 'mine' ? 'My Groups' : 'Discover'}
              </button>
            ))}
          </div>
          {tab === 'discover' && (
            <input
              type="text"
              placeholder="Search groups..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 bg-background/80 backdrop-blur-sm border border-border rounded-lg text-sm text-foreground placeholder-muted/50 focus:outline-none focus:border-accent transition-colors"
            />
          )}
        </div>
      }
      footerRight={
        session ? (
          <Link
            href="/groups/new"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-orange hover:bg-orange-hover text-white shadow-sm flex items-center justify-center transition-colors shrink-0"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        ) : undefined
      }
    >
      {loading ? (
        <div className="text-center text-muted py-12 animate-pulse text-sm">Loading groups...</div>
      ) : displayList.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted mb-2 text-sm">
            {tab === 'mine'
              ? 'You haven\'t joined any groups yet.'
              : search ? 'No groups match your search.' : 'No public groups yet.'}
          </p>
          {tab === 'mine' && (
            <button onClick={() => setTab('discover')} className="text-accent text-sm hover:underline">
              Discover groups
            </button>
          )}
          {tab === 'discover' && session && !search && (
            <Link href="/groups/new" className="text-accent text-sm hover:underline">
              Create the first group
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayList.map(c => (
            <Link
              key={c.id}
              href={`/groups/${c.slug}`}
              className="block p-3.5 bg-surface/90 hover:bg-surface-hover/90 border border-border rounded-lg transition-all shadow-sm hover:shadow-md backdrop-blur-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium text-foreground leading-tight flex-1">{c.name}</h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!c.isPublic && (
                    <span className="px-2 py-0.5 text-[11px] rounded-full font-medium bg-muted/15 text-muted">Private</span>
                  )}
                  {c.role && (
                    <span className="px-2 py-0.5 text-[11px] rounded-full font-medium bg-accent/15 text-accent">{c.role}</span>
                  )}
                  {tab === 'discover' && mySlugs.has(c.slug) && (
                    <span className="px-2 py-0.5 text-[11px] rounded-full font-medium bg-success/15 text-success">Joined</span>
                  )}
                </div>
              </div>
              {c.description && (
                <p className="text-xs text-muted mt-1.5 line-clamp-2 leading-relaxed">{c.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                <span>{c._count.members} members</span>
                <span className="text-border-strong">&middot;</span>
                <span>{c._count.deliberations} chants</span>
                <span className="text-border-strong">&middot;</span>
                <span>by {c.creator.name || 'Anonymous'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </FrameLayout>
  )
}
