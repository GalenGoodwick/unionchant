'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getDisplayName } from '@/lib/user'

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED'

type Community = {
  id: string
  name: string
  slug: string
  description: string | null
  isPublic: boolean
  creator: { name: string | null; status: UserStatus }
  _count: { members: number; deliberations: number }
}

export default function CommunityInviteClient() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const code = params.code as string

  const [community, setCommunity] = useState<Community | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/communities/invite/${code}`)
      .then(res => {
        if (!res.ok) throw new Error('Invalid invite link')
        return res.json()
      })
      .then(data => setCommunity(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [code])

  const handleJoin = async () => {
    if (!session) {
      router.push(`/auth/signin?callbackUrl=/communities/invite/${code}`)
      return
    }

    setJoining(true)
    try {
      const res = await fetch(`/api/communities/invite/${code}/join`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to join')
      }

      const data = await res.json()
      router.push(`/communities/${data.communitySlug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join')
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    )
  }

  if (error || !community) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Invalid Invite</h1>
          <p className="text-muted mb-6">{error || 'This invite link is invalid or has expired.'}</p>
          <Link href="/communities" className="text-accent hover:text-accent-hover">
            Browse Communities
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-background rounded-lg p-8 border border-border text-center">
          <div className="text-accent text-sm font-medium mb-2">
            You&apos;ve been invited to join
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-4">
            {community.name}
          </h1>

          {community.description && (
            <p className="text-muted mb-6">{community.description}</p>
          )}

          <div className="flex justify-center gap-4 text-sm text-muted mb-6">
            <span className="font-mono">{community._count.members} members</span>
            <span className="font-mono">{community._count.deliberations} deliberations</span>
          </div>

          <div className="text-muted-light text-sm mb-6">
            Created by {getDisplayName(community.creator)}
          </div>

          {status === 'loading' ? (
            <div className="text-muted">Loading...</div>
          ) : (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full bg-accent hover:bg-accent-hover text-white py-3 px-6 rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {joining ? 'Joining...' : session ? 'Join Community' : 'Sign in to Join'}
            </button>
          )}

          <p className="text-muted-light text-xs mt-4">
            By joining, you&apos;ll be part of this community and its deliberations
          </p>
        </div>
      </div>
    </div>
  )
}
