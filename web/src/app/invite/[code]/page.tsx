'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getDisplayName } from '@/lib/user'

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

export default function InvitePage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const code = params.code as string

  const [deliberation, setDeliberation] = useState<Deliberation | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Fetch deliberation by invite code
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
      // Redirect to sign in, then back here
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
      router.push(`/deliberations/${data.deliberationId}`)
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

  if (error || !deliberation) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Invalid Invite</h1>
          <p className="text-muted mb-6">{error || 'This invite link is invalid or has expired.'}</p>
          <Link href="/" className="text-accent hover:text-accent-hover">
            Go to homepage
          </Link>
        </div>
      </div>
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
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-background rounded-lg p-8 border border-border text-center">
          <div className="text-accent text-sm font-medium mb-2">
            You&apos;ve been invited to join
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-4">
            {deliberation.question}
          </h1>

          {deliberation.description && (
            <p className="text-muted mb-6">{deliberation.description}</p>
          )}

          <div className="flex justify-center gap-4 text-sm text-muted mb-4">
            <span className="font-mono">{deliberation._count.members} participants</span>
            <span className="font-mono">{deliberation._count.ideas} ideas</span>
          </div>

          <div className="mb-6">
            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${phaseStyles[deliberation.phase] || 'bg-surface text-muted'}`}>
              {phaseLabels[deliberation.phase]}
            </span>
          </div>

          <div className="text-muted-light text-sm mb-6">
            Created by {getDisplayName(deliberation.creator)}
          </div>

          {status === 'loading' ? (
            <div className="text-muted">Loading...</div>
          ) : (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full bg-accent hover:bg-accent-hover text-white py-3 px-6 rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {joining ? 'Joining...' : session ? 'Join Deliberation' : 'Sign in to Join'}
            </button>
          )}

          <p className="text-muted-light text-xs mt-4">
            By joining, you&apos;ll be able to submit ideas and vote
          </p>
        </div>
      </div>
    </div>
  )
}
