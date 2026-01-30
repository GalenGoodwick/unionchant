'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

interface MetaDeliberation {
  id: string
  question: string
  phase: string
  submissionEndsAt: string | null
  _count: {
    ideas: number
    members: number
  }
}

interface Idea {
  id: string
  text: string
  createdAt: string
  author: {
    name: string | null
  }
}

export default function MetaDeliberationEmbed({
  deliberation
}: {
  deliberation: MetaDeliberation
}) {
  const { data: session } = useSession()
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [newIdea, setNewIdea] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [timeRemaining, setTimeRemaining] = useState('')

  // Fetch recent ideas
  useEffect(() => {
    fetch(`/api/deliberations/${deliberation.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.ideas) {
          setIdeas(data.ideas.slice(0, 5))
        }
      })
      .catch(console.error)
  }, [deliberation.id])

  // Update countdown timer
  useEffect(() => {
    if (!deliberation.submissionEndsAt) return

    const updateTimer = () => {
      const diff = new Date(deliberation.submissionEndsAt!).getTime() - Date.now()
      if (diff <= 0) {
        setTimeRemaining('Ended')
        return
      }
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      setTimeRemaining(`${hours}h ${mins}m remaining`)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 60000)
    return () => clearInterval(interval)
  }, [deliberation.submissionEndsAt])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newIdea.trim() || !session) return

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch(`/api/deliberations/${deliberation.id}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newIdea.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit')
      }

      const idea = await res.json()
      setIdeas(prev => [idea, ...prev].slice(0, 5))
      setNewIdea('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit idea')
    } finally {
      setSubmitting(false)
    }
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <div className="bg-background rounded-lg border-2 border-purple overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple to-accent p-4 sm:p-6">
        <div className="flex justify-between items-start flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <span className="text-white/80 font-semibold text-sm uppercase tracking-wide">
              Today&apos;s Question
            </span>
          </div>
          {timeRemaining && (
            <span className="text-white/80 text-sm flex items-center gap-1">
              <span>⏱️</span> {timeRemaining}
            </span>
          )}
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mt-2">
          {deliberation.question}
        </h2>
        <div className="flex flex-wrap gap-3 mt-3 text-sm text-white/70">
          <span>{deliberation._count.ideas} ideas</span>
          <span>•</span>
          <span>{deliberation._count.members} participants</span>
          <span>•</span>
          <span className={`font-medium ${
            deliberation.phase === 'SUBMISSION' ? 'text-green-300' : 'text-yellow-300'
          }`}>
            {deliberation.phase === 'SUBMISSION' ? 'Accepting Ideas' : 'Voting Now'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">
        {/* Submission Form */}
        {deliberation.phase === 'SUBMISSION' && (
          <div className="mb-6">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={newIdea}
                onChange={(e) => setNewIdea(e.target.value)}
                placeholder={session ? 'What topic should we deliberate on?' : 'Sign in to submit an idea'}
                disabled={!session || submitting}
                className="flex-1 bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted focus:outline-none focus:border-purple disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!session || !newIdea.trim() || submitting}
                className="bg-purple hover:bg-purple-hover disabled:bg-muted disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                {submitting ? '...' : 'Submit'}
              </button>
            </form>
            {error && <p className="text-error text-sm mt-2">{error}</p>}
            {!session && (
              <p className="text-muted text-sm mt-2">
                <Link href="/auth/signin" className="text-purple hover:underline">Sign in</Link> to submit ideas and participate
              </p>
            )}
          </div>
        )}

        {/* Recent Ideas */}
        {ideas.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted mb-3">
              {deliberation.phase === 'SUBMISSION' ? 'Recent ideas:' : 'Ideas competing:'}
            </h3>
            <div className="space-y-2">
              {ideas.map(idea => (
                <div key={idea.id} className="flex justify-between items-center bg-surface rounded-lg px-4 py-3 border border-border">
                  <span className="text-foreground">{idea.text}</span>
                  <span className="text-muted text-sm whitespace-nowrap ml-4">
                    {idea.author?.name || 'Anonymous'} • {timeAgo(idea.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* View All Link */}
        <div className="mt-4 text-center">
          <Link
            href={`/deliberations/${deliberation.id}`}
            className="text-purple hover:text-purple-hover font-medium inline-flex items-center gap-1"
          >
            {deliberation.phase === 'VOTING' ? 'Go to voting' : `View all ${deliberation._count.ideas} ideas`}
            <span>→</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
