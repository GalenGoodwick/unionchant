'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import FrameLayout from '@/components/FrameLayout'
import FirstVisitTooltip from '@/components/FirstVisitTooltip'
import { phaseLabel } from '@/lib/labels'

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
  isPublic: boolean
  role: string
  _count: { members: number; deliberations: number }
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [deliberations, setDeliberations] = useState<DeliberationSummary[]>([])
  const [communities, setCommunities] = useState<CommunitySummary[]>([])
  const [podiums, setPodiums] = useState<Array<{
    id: string; title: string; views: number; pinned: boolean; createdAt: string
    deliberation: { id: string; question: string } | null
  }>>([])
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
        fetch(`/api/podiums?authorId=${session?.user?.id || ''}&limit=10`).then(res => {
          if (!res.ok) return { items: [] }
          return res.json()
        }),
      ])
        .then(([delibData, commData, podiumData]) => {
          setDeliberations(delibData)
          setCommunities(Array.isArray(commData) ? commData : [])
          setPodiums(podiumData.items || [])
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [status, router])

  const phaseColors: Record<string, string> = {
    SUBMISSION: 'bg-accent',
    VOTING: 'bg-warning',
    ACCUMULATING: 'bg-purple',
    COMPLETED: 'bg-success',
  }

  return (
    <FrameLayout active="chants" showBack>
      <FirstVisitTooltip id="manage-page">
        This is your facilitator dashboard. Select a chant to start voting, open challenge rounds, set timers, and control the flow.
      </FirstVisitTooltip>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-sm font-bold text-foreground">My Chants</h1>
        <Link
          href="/chants/new"
          className="bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        >
          + Create New
        </Link>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3">
              <div className="h-4 bg-background rounded w-2/3 mb-2" />
              <div className="h-3 bg-background rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-error-bg text-error p-3 rounded-lg text-xs">{error}</div>
      )}

      {!loading && !error && deliberations.length === 0 && (
        <div className="text-center py-10 bg-surface/90 backdrop-blur-sm border border-border rounded-lg">
          <p className="text-muted text-xs mb-3">You haven&apos;t created any chants yet.</p>
          <Link
            href="/chants/new"
            className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors inline-block"
          >
            Create Your First Chant
          </Link>
        </div>
      )}

      {!loading && !error && deliberations.length > 0 && (() => {
        const privateTalks = deliberations.filter(d => !d.isPublic)
        const publicTalks = deliberations.filter(d => d.isPublic)
        const renderTalk = (d: DeliberationSummary) => (
          <Link
            key={d.id}
            href={`/dashboard/${d.id}`}
            className="block bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 hover:border-accent transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-xs text-foreground font-medium truncate">{d.question}</h2>
                {d.organization && (
                  <p className="text-xs text-muted mt-0.5">{d.organization}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`px-1.5 py-0.5 rounded text-white text-xs ${phaseColors[d.phase] || 'bg-muted'}`}>
                  {phaseLabel(d.phase)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
              <span>{d._count.members} members</span>
              <span>{d._count.ideas} ideas</span>
              {d.phase === 'VOTING' && <span>Tier {d.currentTier}</span>}
              <span>{new Date(d.createdAt).toLocaleDateString()}</span>
            </div>
          </Link>
        )
        return (
          <div className="space-y-4">
            {privateTalks.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Private Chants</h2>
                <div className="space-y-2">
                  {privateTalks.map(renderTalk)}
                </div>
              </div>
            )}
            {publicTalks.length > 0 && (
              <div>
                {privateTalks.length > 0 && (
                  <h2 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Public Chants</h2>
                )}
                <div className="space-y-2">
                  {publicTalks.map(renderTalk)}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* My Communities */}
      {!loading && !error && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-foreground">My Groups</h2>
            <Link
              href="/groups"
              className="text-accent hover:text-accent-hover text-xs transition-colors"
            >
              Browse All
            </Link>
          </div>

          {communities.length === 0 ? (
            <div className="text-center py-6 bg-surface/90 backdrop-blur-sm border border-border rounded-lg">
              <p className="text-muted text-xs mb-3">You haven&apos;t joined any groups yet.</p>
              <Link
                href="/groups"
                className="text-accent hover:text-accent-hover text-xs font-medium"
              >
                Discover Groups
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {[...communities].sort((a, b) => {
                if (a.isPublic === b.isPublic) return 0
                return a.isPublic ? 1 : -1
              }).map(c => (
                <Link
                  key={c.id}
                  href={c.role === 'OWNER' || c.role === 'ADMIN' ? `/groups/${c.slug}/settings` : `/groups/${c.slug}`}
                  className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 hover:border-accent transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs text-foreground font-medium truncate">{c.name}</h3>
                    <div className="flex items-center gap-1 shrink-0">
                      {!c.isPublic && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-surface-hover text-muted border border-border">
                          Private
                        </span>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                        {c.role}
                      </span>
                    </div>
                  </div>
                  {c.description && (
                    <p className="text-muted text-xs mt-0.5 line-clamp-2">{c.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted">
                    <span>{c._count.members} members</span>
                    <span>{c._count.deliberations} chants</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My Podiums */}
      {!loading && !error && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-foreground">My Podiums</h2>
            <Link
              href="/podium/new"
              className="text-accent hover:text-accent-hover text-xs transition-colors"
            >
              Write New
            </Link>
          </div>

          {podiums.length === 0 ? (
            <div className="text-center py-6 bg-surface/90 backdrop-blur-sm border border-border rounded-lg">
              <p className="text-muted text-xs mb-3">You haven&apos;t written any podium posts yet.</p>
              <Link
                href="/podium/new"
                className="text-accent hover:text-accent-hover text-xs font-medium"
              >
                Write Your First Post
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {podiums.map(p => (
                <Link
                  key={p.id}
                  href={`/podium/${p.id}`}
                  className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 hover:border-accent transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {p.pinned && (
                          <span className="text-xs bg-warning-bg text-warning px-1 py-0.5 rounded border border-warning shrink-0">Pinned</span>
                        )}
                        <h3 className="text-xs text-foreground font-medium truncate">{p.title}</h3>
                      </div>
                      {p.deliberation && (
                        <p className="text-xs text-muted mt-0.5 truncate">Linked: {p.deliberation.question}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted">
                    <span>{p.views} views</span>
                    <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </FrameLayout>
  )
}
