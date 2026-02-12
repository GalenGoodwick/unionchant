'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getDisplayName } from '@/lib/user'
import FrameLayout from '@/components/FrameLayout'

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED'

type Deliberation = {
  id: string
  question: string
  description: string | null
  phase: string
  isPublic: boolean
  creator: { name: string | null; status?: UserStatus }
  _count: { members: number; ideas: number }
}

export default function InvitePageClient() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const code = params.code as string

  const [deliberation, setDeliberation] = useState<Deliberation | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/invite/${code}`)
      .then(res => {
        if (!res.ok) throw new Error('Invalid invite link')
        return res.json()
      })
      .then(data => {
        setDeliberation(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [code])

  const handleJoin = async () => {
    if (!session) {
      router.push(`/auth/signin?callbackUrl=/invite/${code}`)
      return
    }

    setJoining(true)
    try {
      const res = await fetch(`/api/invite/${code}/join`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to join')
      }

      const data = await res.json()
      router.push(`/chants/${data.deliberationId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join')
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <FrameLayout>
        <div className="flex items-center justify-center py-16">
          <div className="text-muted text-xs animate-pulse">Loading...</div>
        </div>
      </FrameLayout>
    )
  }

  if (error || !deliberation) {
    return (
      <FrameLayout>
        <div className="text-center py-12">
          <h1 className="text-sm font-bold text-foreground mb-2">Invalid Invite</h1>
          <p className="text-xs text-muted mb-4">{error || 'This invite link is invalid or has expired.'}</p>
          <Link href="/chants" className="text-accent hover:text-accent-hover text-xs">
            Browse chants
          </Link>
        </div>
      </FrameLayout>
    )
  }

  const phaseLabels: Record<string, string> = {
    SUBMISSION: 'Accepting Ideas',
    VOTING: 'Voting in Progress',
    COMPLETED: 'Completed',
    ACCUMULATING: 'Accumulating',
  }

  const phaseStyles: Record<string, string> = {
    SUBMISSION: 'bg-accent text-white',
    VOTING: 'bg-warning text-white',
    COMPLETED: 'bg-success text-white',
    ACCUMULATING: 'bg-purple text-white',
  }

  return (
    <FrameLayout>
      <div className="flex items-center justify-center py-8">
        <div className="w-full">
          <div className="bg-surface/90 backdrop-blur-sm rounded-lg border border-border p-6 text-center">
            <div className="text-accent text-xs font-medium mb-2">
              You&apos;ve been invited to join
            </div>

            <h1 className="text-sm font-bold text-foreground mb-3">
              {deliberation.question}
            </h1>

            {deliberation.description && (
              <p className="text-xs text-muted mb-4">{deliberation.description}</p>
            )}

            <div className="flex justify-center gap-3 text-xs text-muted mb-3">
              <span className="font-mono">{deliberation._count.members} participants</span>
              <span className="font-mono">{deliberation._count.ideas} ideas</span>
            </div>

            <div className="mb-4">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${phaseStyles[deliberation.phase] || 'bg-surface text-muted'}`}>
                {phaseLabels[deliberation.phase]}
              </span>
            </div>

            <div className="text-muted text-[10px] mb-4">
              Created by {getDisplayName(deliberation.creator)}
            </div>

            {status === 'loading' ? (
              <div className="text-muted text-xs">Loading...</div>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full bg-accent hover:bg-accent-hover text-white py-2.5 px-4 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {joining ? 'Joining...' : session ? 'Join Chant' : 'Sign in to Join'}
              </button>
            )}

            <p className="text-muted text-[10px] mt-3">
              By joining, you&apos;ll be able to submit ideas and vote
            </p>
          </div>
        </div>
      </div>
    </FrameLayout>
  )
}
