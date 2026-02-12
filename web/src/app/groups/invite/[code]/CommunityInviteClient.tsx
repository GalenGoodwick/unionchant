'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getDisplayName } from '@/lib/user'
import FrameLayout from '@/components/FrameLayout'

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
      router.push(`/auth/signin?callbackUrl=/groups/invite/${code}`)
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
      router.push(`/groups/${data.communitySlug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join')
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <FrameLayout active="groups">
        <div className="flex items-center justify-center py-16">
          <div className="text-muted text-xs">Loading...</div>
        </div>
      </FrameLayout>
    )
  }

  if (error || !community) {
    return (
      <FrameLayout active="groups">
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <h1 className="text-sm font-bold text-foreground mb-2">Invalid Invite</h1>
            <p className="text-xs text-muted mb-4">{error || 'This invite link is invalid or has expired.'}</p>
            <Link href="/groups" className="text-accent hover:text-accent-hover text-xs">
              Browse Groups
            </Link>
          </div>
        </div>
      </FrameLayout>
    )
  }

  return (
    <FrameLayout active="groups">
      <div className="flex items-center justify-center py-12">
        <div className="w-full">
          <div className="bg-surface/90 backdrop-blur-sm rounded-lg p-6 border border-border text-center">
            <div className="text-accent text-xs font-medium mb-1.5">
              You&apos;ve been invited to join
            </div>

            <h1 className="text-sm font-bold text-foreground mb-3">
              {community.name}
            </h1>

            {community.description && (
              <p className="text-xs text-muted mb-4">{community.description}</p>
            )}

            <div className="flex justify-center gap-4 text-xs text-muted mb-4">
              <span className="font-mono">{community._count.members} members</span>
              <span className="font-mono">{community._count.deliberations} chants</span>
            </div>

            <div className="text-muted-light text-[10px] mb-4">
              Created by {getDisplayName(community.creator)}
            </div>

            {status === 'loading' ? (
              <div className="text-muted text-xs">Loading...</div>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full bg-accent hover:bg-accent-hover text-white py-2.5 px-4 rounded-lg font-semibold text-xs transition-colors disabled:opacity-50"
              >
                {joining ? 'Joining...' : session ? 'Join Group' : 'Sign in to Join'}
              </button>
            )}

            <p className="text-muted-light text-[10px] mt-3">
              By joining, you&apos;ll be part of this group and its chants
            </p>
          </div>
        </div>
      </div>
    </FrameLayout>
  )
}
