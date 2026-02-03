'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import ShareMenu from '@/components/ShareMenu'
import { FullPageSpinner } from '@/components/Spinner'
import { getDisplayName } from '@/lib/user'
import { phaseLabel } from '@/lib/labels'

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED'

type Member = {
  id: string
  role: string
  joinedAt: string
  user: { id: string; name: string | null; image: string | null; status: UserStatus }
}

type Deliberation = {
  id: string
  question: string
  description: string | null
  phase: string
  isPublic: boolean
  currentTier: number
  createdAt: string
  creator: { id: string; name: string | null; status: UserStatus }
  _count: { members: number; ideas: number }
}

type Community = {
  id: string
  name: string
  slug: string
  description: string | null
  isPublic: boolean
  inviteCode: string | null
  creatorId: string
  creator: { id: string; name: string | null; image: string | null; status: UserStatus }
  createdAt: string
  userRole: string | null
  members: Member[]
  deliberations: Deliberation[]
  _count: { members: number; deliberations: number }
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

export default function CommunityPageClient() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [community, setCommunity] = useState<Community | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/communities/${slug}`)
      .then(res => {
        if (!res.ok) throw new Error('Community not found')
        return res.json()
      })
      .then(data => setCommunity(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [slug])

  const handleJoin = async () => {
    if (!session) {
      router.push(`/auth/signin?callbackUrl=/groups/${slug}`)
      return
    }
    setJoining(true)
    try {
      const res = await fetch(`/api/communities/${slug}/join`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to join')
      }
      const updated = await fetch(`/api/communities/${slug}`).then(r => r.json())
      setCommunity(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setJoining(false)
    }
  }

  const handleLeave = async () => {
    setLeaving(true)
    try {
      const res = await fetch(`/api/communities/${slug}/leave`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to leave')
      }
      const updated = await fetch(`/api/communities/${slug}`).then(r => r.json())
      setCommunity(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave')
    } finally {
      setLeaving(false)
    }
  }

  const copyInviteLink = () => {
    if (!community?.inviteCode) return
    const url = `${window.location.origin}/groups/invite/${community.inviteCode}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const phaseColors: Record<string, string> = {
    SUBMISSION: 'bg-accent-light text-accent',
    VOTING: 'bg-warning-bg text-warning',
    ACCUMULATING: 'bg-purple-bg text-purple',
    COMPLETED: 'bg-success-bg text-success',
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <FullPageSpinner />
      </div>
    )
  }

  if (error || !community) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-xl mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Group Not Found</h1>
          <p className="text-muted mb-6">{error || 'This group does not exist or you do not have access.'}</p>
          <Link href="/groups" className="text-accent hover:text-accent-hover">
            Browse Groups
          </Link>
        </div>
      </div>
    )
  }

  const isMember = community.userRole !== null
  const isOwnerOrAdmin = community.userRole === 'OWNER' || community.userRole === 'ADMIN'
  const activeTalks = community.deliberations.filter(d => d.phase !== 'COMPLETED')
  const completedTalks = community.deliberations.filter(d => d.phase === 'COMPLETED')

  // Sort: owner's deliberations first, then by date
  const sortedActive = [...activeTalks].sort((a, b) => {
    const aIsOwner = a.creator.id === community.creatorId
    const bIsOwner = b.creator.id === community.creatorId
    if (aIsOwner && !bIsOwner) return -1
    if (!aIsOwner && bIsOwner) return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-xl mx-auto px-4 py-4">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <Link href="/groups" className="text-muted hover:text-foreground text-sm">
            ← Back
          </Link>
          {isOwnerOrAdmin && (
            <Link
              href={`/groups/${slug}/settings`}
              className="border border-border hover:border-accent text-foreground px-3 py-1.5 rounded text-sm flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Link>
          )}
        </div>

        {/* Banner */}
        <div className="bg-surface border border-border rounded-xl p-6 mb-4 text-center">
          <h1 className="text-xl font-bold text-foreground mb-2">{community.name}</h1>
          {community.description && (
            <p className="text-muted text-sm leading-relaxed max-w-md mx-auto">{community.description}</p>
          )}
          {!community.isPublic && (
            <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-surface-hover text-muted border border-border">
              Private
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-surface border border-border rounded-xl p-3 text-center">
            <div className="text-xl font-bold font-mono text-foreground">{community._count.members}</div>
            <div className="text-xs text-muted">Members</div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-3 text-center">
            <div className="text-xl font-bold font-mono text-foreground">{activeTalks.length}</div>
            <div className="text-xs text-muted">Active</div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-3 text-center">
            <div className="text-xl font-bold font-mono text-foreground">{completedTalks.length}</div>
            <div className="text-xs text-muted">Priorities</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mb-6">
          {!isMember ? (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="flex-1 bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {joining ? 'Joining...' : 'Join Group'}
            </button>
          ) : (
            <>
              <button
                onClick={copyInviteLink}
                disabled={!community.inviteCode}
                className="flex-1 flex items-center justify-center gap-1.5 bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              >
                <span>+</span>
                {copied ? 'Copied!' : 'Invite'}
              </button>
              <ShareMenu url={`/groups/${slug}`} text={community.name} />
            </>
          )}
          {isMember && community.userRole !== 'OWNER' && (
            <button
              onClick={handleLeave}
              disabled={leaving}
              className="border border-border text-muted hover:text-error hover:border-error px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
            >
              {leaving ? '...' : 'Leave'}
            </button>
          )}
        </div>

        {/* New Talk CTA */}
        {isMember && (
          <Link
            href={`/talks/new?community=${slug}`}
            className="block text-center bg-surface border border-border hover:border-accent rounded-xl p-3 text-sm text-accent font-medium transition-colors mb-6"
          >
            + New Talk in this Group
          </Link>
        )}

        {/* Active questions */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">Active questions</h2>
          {sortedActive.length === 0 ? (
            <div className="text-center py-8 bg-surface border border-border rounded-xl">
              <p className="text-muted text-sm">No active talks yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedActive.map(d => (
                <Link
                  key={d.id}
                  href={`/talks/${d.id}`}
                  className="block bg-surface border border-border rounded-xl p-4 hover:border-accent transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${phaseColors[d.phase] || 'bg-surface text-muted'}`}>
                      {phaseLabel(d.phase)}
                    </span>
                    {d.currentTier > 0 && (
                      <span className="text-xs text-muted">Tier {d.currentTier}</span>
                    )}
                    {!d.isPublic && (
                      <span className="px-2 py-0.5 rounded text-xs bg-surface-hover text-muted border border-border">
                        Group Only
                      </span>
                    )}
                  </div>
                  <h3 className="text-foreground font-medium text-sm">{d.question}</h3>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
                    <span>{d._count.members} participants</span>
                    <span>{d._count.ideas} ideas</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Completed */}
        {completedTalks.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-foreground mb-3">Priorities</h2>
            <div className="space-y-2">
              {completedTalks.map(d => (
                <Link
                  key={d.id}
                  href={`/talks/${d.id}`}
                  className="block bg-surface border border-border rounded-xl p-4 hover:border-success transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-success-bg text-success">
                      {phaseLabel(d.phase)}
                    </span>
                  </div>
                  <h3 className="text-foreground font-medium text-sm">{d.question}</h3>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
                    <span>{d._count.members} participants</span>
                    <span>{d._count.ideas} ideas</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Members */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Members</h2>
          <div className="bg-surface border border-border rounded-xl divide-y divide-border">
            {community.members.map(m => (
              <Link
                key={m.id}
                href={`/user/${m.user.id}`}
                className="flex items-center justify-between p-3 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  {m.user.image ? (
                    <img src={m.user.image} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm font-medium text-accent">
                      {(m.user.name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <span className="text-foreground text-sm">{getDisplayName(m.user)}</span>
                    <p className="text-xs text-muted">Joined {timeAgo(m.joinedAt)}</p>
                  </div>
                </div>
                {(m.role === 'OWNER' || m.role === 'ADMIN') && (
                  <span className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent">
                    {m.role === 'OWNER' ? 'Owner' : 'Admin'}
                  </span>
                )}
              </Link>
            ))}
            {community._count.members > community.members.length && (
              <div className="p-3 text-center">
                <span className="text-xs text-accent">View all {community._count.members} members →</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
