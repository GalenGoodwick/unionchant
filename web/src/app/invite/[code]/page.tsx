'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type Deliberation = {
  id: string
  question: string
  description: string | null
  phase: string
  isPublic: boolean
  creator: { name: string | null }
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
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    )
  }

  if (error || !deliberation) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Invalid Invite</h1>
          <p className="text-slate-400 mb-6">{error || 'This invite link is invalid or has expired.'}</p>
          <Link href="/" className="text-indigo-400 hover:text-indigo-300">
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 text-center">
          <div className="text-indigo-400 text-sm font-medium mb-2">
            You&apos;ve been invited to join
          </div>

          <h1 className="text-2xl font-bold text-white mb-4">
            {deliberation.question}
          </h1>

          {deliberation.description && (
            <p className="text-slate-400 mb-6">{deliberation.description}</p>
          )}

          <div className="flex justify-center gap-4 text-sm text-slate-500 mb-6">
            <span>{deliberation._count.members} participants</span>
            <span>{deliberation._count.ideas} ideas</span>
            <span>{phaseLabels[deliberation.phase]}</span>
          </div>

          <div className="text-slate-500 text-sm mb-6">
            Created by {deliberation.creator.name || 'Anonymous'}
          </div>

          {status === 'loading' ? (
            <div className="text-slate-400">Loading...</div>
          ) : (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {joining ? 'Joining...' : session ? 'Join Deliberation' : 'Sign in to Join'}
            </button>
          )}

          <p className="text-slate-500 text-xs mt-4">
            By joining, you&apos;ll be able to submit ideas and vote
          </p>
        </div>
      </div>
    </div>
  )
}
