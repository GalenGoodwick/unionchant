'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import { FullPageSpinner } from '@/components/Spinner'
import { getDisplayName } from '@/lib/user'

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
      router.push(`/auth/signin?callbackUrl=/communities/${slug}`)
      return
    }
    setJoining(true)
    try {
      const res = await fetch(`/api/communities/${slug}/join`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to join')
      }
      // Refresh page data
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
    const url = `${window.location.origin}/communities/invite/${community.inviteCode}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const phaseColors: Record<string, string> = {
    SUBMISSION: 'bg-blue-500',
    VOTING: 'bg-warning',
    ACCUMULATING: 'bg-purple',
    COMPLETED: 'bg-success',
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
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Community Not Found</h1>
          <p className="text-muted mb-6">{error || 'This community does not exist or you do not have access.'}</p>
          <Link href="/communities" className="text-accent hover:text-accent-hover">
            Browse Communities
          </Link>
        </div>
      </div>
    )
  }

  const isMember = community.userRole !== null
  const isOwnerOrAdmin = community.userRole === 'OWNER' || community.userRole === 'ADMIN'

  // Sort deliberations: owner's deliberations first
  const sortedDelibs = [...community.deliberations].sort((a, b) => {
    const aIsOwner = a.creator.id === community.creatorId
    const bIsOwner = b.creator.id === community.creatorId
    if (aIsOwner && !bIsOwner) return -1
    if (!aIsOwner && bIsOwner) return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/communities" className="text-muted hover:text-foreground text-sm mb-4 inline-block">
          &larr; Back to communities
        </Link>

        {/* Community Header */}
        <div className="bg-surface border border-border rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{community.name}</h1>
              {community.description && (
                <p className="text-muted mt-2">{community.description}</p>
              )}
              <div className="flex items-center gap-4 mt-3 text-sm text-muted">
                <span>{community._count.members} members</span>
                <span>{community._count.deliberations} deliberations</span>
                <span className={`px-2 py-0.5 rounded text-xs ${community.isPublic ? 'bg-success-bg text-success border border-success' : 'bg-error-bg text-error border border-error'}`}>
                  {community.isPublic ? 'Public' : 'Private'}
                </span>
              </div>
              <p className="text-muted-light text-xs mt-2">
                Created by {getDisplayName(community.creator)} on {new Date(community.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex flex-col gap-2 shrink-0">
              {!isMember ? (
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {joining ? 'Joining...' : 'Join Community'}
                </button>
              ) : (
                <>
                  {community.userRole !== 'OWNER' && (
                    <button
                      onClick={handleLeave}
                      disabled={leaving}
                      className="border border-border text-muted hover:text-error hover:border-error px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                      {leaving ? 'Leaving...' : 'Leave'}
                    </button>
                  )}
                  {isOwnerOrAdmin && (
                    <Link
                      href={`/communities/${slug}/settings`}
                      className="border border-border text-muted hover:text-foreground hover:border-foreground px-4 py-2 rounded-lg text-sm text-center transition-colors"
                    >
                      Settings
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Invite link */}
          {isMember && community.inviteCode && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <span className="text-muted text-sm">Invite link:</span>
                <button
                  onClick={copyInviteLink}
                  className="text-accent hover:text-accent-hover text-sm font-mono transition-colors"
                >
                  {copied ? 'Copied!' : `${typeof window !== 'undefined' ? window.location.origin : ''}/communities/invite/${community.inviteCode}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Create deliberation CTA */}
        {isMember && (
          <div className="mb-6">
            <Link
              href={`/deliberations/new?community=${slug}`}
              className="inline-block bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              + New Deliberation
            </Link>
          </div>
        )}

        {/* Deliberations */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">Deliberations</h2>
          {sortedDelibs.length === 0 ? (
            <div className="text-center py-12 bg-surface border border-border rounded-lg">
              <p className="text-muted">No deliberations yet.</p>
              {isMember && (
                <Link
                  href={`/deliberations/new?community=${slug}`}
                  className="inline-block mt-4 text-accent hover:text-accent-hover text-sm"
                >
                  Start the first deliberation
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {sortedDelibs.map(d => (
                <Link
                  key={d.id}
                  href={`/deliberations/${d.id}`}
                  className="block bg-surface border border-border rounded-lg p-4 hover:border-accent transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-foreground font-medium truncate">{d.question}</h3>
                      {d.creator.id === community.creatorId && (
                        <span className="text-xs text-accent mt-0.5 inline-block">Pinned by owner</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded text-white text-xs ${phaseColors[d.phase] || 'bg-muted'}`}>
                        {d.phase}
                      </span>
                      {!d.isPublic && (
                        <span className="px-2 py-0.5 rounded text-xs bg-error-bg text-error border border-error">
                          Community Only
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted">
                    <span>{d._count.members} members</span>
                    <span>{d._count.ideas} ideas</span>
                    <span>by {getDisplayName(d.creator)}</span>
                    <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Members */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Members ({community._count.members})
          </h2>
          <div className="bg-surface border border-border rounded-lg divide-y divide-border">
            {community.members.map(m => (
              <div key={m.id} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  {m.user.image ? (
                    <img src={m.user.image} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm font-medium text-accent">
                      {(m.user.name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="text-foreground text-sm">{getDisplayName(m.user)}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-surface text-muted border border-border">
                  {m.role}
                </span>
              </div>
            ))}
            {community._count.members > community.members.length && (
              <div className="p-3 text-center text-muted text-sm">
                +{community._count.members - community.members.length} more members
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
