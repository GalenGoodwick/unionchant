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

interface Champion {
  id: string
  question: string
  completedAt: string | null
  ideas: { text: string }[]
  _count: { members: number }
}

export default function HomeContent({
  metaDeliberation,
  recentIdeas: initialIdeas,
  recentChampions
}: {
  metaDeliberation: MetaDeliberation | null
  recentIdeas: Idea[]
  recentChampions: Champion[]
}) {
  const { data: session } = useSession()
  const [ideas, setIdeas] = useState(initialIdeas)
  const [newIdea, setNewIdea] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [timeRemaining, setTimeRemaining] = useState({ hours: 0, mins: 0, progress: 0 })

  // Update countdown timer
  useEffect(() => {
    if (!metaDeliberation?.submissionEndsAt) return

    const updateTimer = () => {
      const now = Date.now()
      const end = new Date(metaDeliberation.submissionEndsAt!).getTime()
      const total = 20 * 60 * 60 * 1000 // 20 hours total
      const diff = end - now

      if (diff <= 0) {
        setTimeRemaining({ hours: 0, mins: 0, progress: 100 })
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const elapsed = total - diff
      const progress = Math.min(100, (elapsed / total) * 100)

      setTimeRemaining({ hours, mins, progress })
    }

    updateTimer()
    const interval = setInterval(updateTimer, 60000)
    return () => clearInterval(interval)
  }, [metaDeliberation?.submissionEndsAt])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newIdea.trim() || !session || !metaDeliberation) return

    setSubmitting(true)
    setError('')

    try {
      // First join the deliberation
      await fetch(`/api/deliberations/${metaDeliberation.id}/join`, {
        method: 'POST',
      })

      // Then submit the idea
      const res = await fetch(`/api/deliberations/${metaDeliberation.id}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newIdea.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit')
      }

      const idea = await res.json()
      setIdeas(prev => [{ ...idea, author: { name: session.user?.name || 'You' } }, ...prev].slice(0, 10))
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
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Central Question */}
      {metaDeliberation && (
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-foreground mb-4">
            {metaDeliberation.question}
          </h1>

          <div className="text-muted mb-6">
            <span className="font-mono text-lg">{metaDeliberation._count.members}</span> people deliberating
            {metaDeliberation.phase === 'SUBMISSION' && (
              <span className="mx-2">•</span>
            )}
            {metaDeliberation.phase === 'SUBMISSION' && (
              <span className="font-mono text-lg">{metaDeliberation._count.ideas}</span>
            )}
            {metaDeliberation.phase === 'SUBMISSION' && ' ideas so far'}
          </div>

          {/* Progress bar */}
          {metaDeliberation.phase === 'SUBMISSION' && (
            <div className="max-w-md mx-auto mb-6">
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple to-accent transition-all duration-1000"
                  style={{ width: `${timeRemaining.progress}%` }}
                />
              </div>
              <div className="text-sm text-muted mt-2">
                {timeRemaining.hours}h {timeRemaining.mins}m until voting begins
              </div>
            </div>
          )}

          {metaDeliberation.phase === 'VOTING' && (
            <div className="inline-block bg-warning text-white px-4 py-2 rounded-full text-sm font-medium mb-6">
              Voting in progress
            </div>
          )}

          {/* Submit form */}
          {metaDeliberation.phase === 'SUBMISSION' && (
            <form onSubmit={handleSubmit} className="max-w-xl mx-auto">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newIdea}
                  onChange={(e) => setNewIdea(e.target.value)}
                  placeholder={session ? "What should we decide?" : "Sign in to submit an idea"}
                  disabled={!session || submitting}
                  className="flex-1 bg-background border-2 border-border rounded-lg px-4 py-3 text-foreground placeholder-muted focus:outline-none focus:border-purple disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!session || !newIdea.trim() || submitting}
                  className="bg-purple hover:bg-purple-hover disabled:bg-muted disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  {submitting ? '...' : 'Submit'}
                </button>
              </div>
              {error && <p className="text-error text-sm mt-2">{error}</p>}
              {!session && (
                <p className="text-muted text-sm mt-3">
                  <Link href="/auth/signin" className="text-purple hover:underline">Sign in</Link> to participate
                </p>
              )}
            </form>
          )}

          {metaDeliberation.phase === 'VOTING' && (
            <Link
              href={`/deliberations/${metaDeliberation.id}`}
              className="inline-block bg-purple hover:bg-purple-hover text-white px-8 py-3 rounded-lg font-medium transition-colors"
            >
              Join Voting
            </Link>
          )}
        </div>
      )}

      {/* Live Activity Feed */}
      {ideas.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Live</h2>
          </div>
          <div className="bg-background rounded-lg border border-border divide-y divide-border">
            {ideas.map(idea => (
              <div key={idea.id} className="px-4 py-3 flex justify-between items-center">
                <div className="flex-1 min-w-0">
                  <span className="text-purple font-medium">{idea.author?.name || 'Anonymous'}</span>
                  <span className="text-muted mx-2">submitted</span>
                  <span className="text-foreground">&ldquo;{idea.text}&rdquo;</span>
                </div>
                <span className="text-muted text-sm ml-4 shrink-0">{timeAgo(idea.createdAt)}</span>
              </div>
            ))}
          </div>
          {metaDeliberation && (
            <div className="text-center mt-3">
              <Link
                href={`/deliberations/${metaDeliberation.id}`}
                className="text-purple hover:text-purple-hover text-sm"
              >
                View all {metaDeliberation._count.ideas} ideas →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Past Decisions */}
      {recentChampions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide mb-4">Past Decisions</h2>
          <div className="space-y-2">
            {recentChampions.map(champ => (
              <div key={champ.id} className="bg-background rounded-lg border border-border px-4 py-3 flex items-center gap-3">
                <span className="text-xl">🏆</span>
                <div className="flex-1">
                  <span className="text-foreground font-medium">
                    &ldquo;{champ.ideas[0]?.text || champ.question}&rdquo;
                  </span>
                  <span className="text-muted text-sm ml-2">
                    — {champ._count.members} people agreed
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer links */}
      <div className="text-center pt-8 border-t border-border">
        <div className="flex gap-6 justify-center flex-wrap text-sm mb-4">
          <Link href="/demo" className="text-purple hover:text-purple-hover">
            Watch Demo
          </Link>
          <Link href="/how-it-works" className="text-purple hover:text-purple-hover">
            How It Works
          </Link>
          <Link href="/deliberations" className="text-purple hover:text-purple-hover">
            All Deliberations
          </Link>
          <Link href="/whitepaper" className="text-purple hover:text-purple-hover">
            Whitepaper
          </Link>
        </div>
        <p className="text-muted text-sm italic">
          &ldquo;Scale is not achieved by enlarging a conversation. It is achieved by multiplying conversations.&rdquo;
        </p>
      </div>
    </div>
  )
}
