'use client'

import { useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { FeedItem } from '@/types/feed'
import Turnstile from '@/components/Turnstile'

type Props = {
  item: FeedItem
  onAction: () => void
  onExplore: () => void
}

export default function ChampionCard({ item, onAction, onExplore }: Props) {
  const { data: session } = useSession()
  const router = useRouter()
  const [idea, setIdea] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Initialize submitted state from pre-fetched data
  const [submitted, setSubmitted] = useState(Boolean(item.userSubmittedIdea))
  const [submittedText, setSubmittedText] = useState(item.userSubmittedIdea?.text || '')
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const handleCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token)
  }, [])

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken(null)
  }, [])

  // Determine card state
  const isChallenge = item.type === 'challenge' // VOTING phase with challengeRound > 0
  const isAccumulating = item.type === 'champion' // ACCUMULATING phase - can submit challengers
  const spotsRemaining = item.tierInfo?.spotsRemaining ?? 0
  const canJoinVote = isChallenge && spotsRemaining > 0

  const handleSubmitChallenger = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!idea.trim()) return

    if (!session) {
      router.push('/auth/signin')
      return
    }

    setSubmitting(true)
    try {
      // Auto-join first
      await fetch(`/api/deliberations/${item.deliberation.id}/join`, {
        method: 'POST',
      })

      const res = await fetch(`/api/deliberations/${item.deliberation.id}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: idea, captchaToken }),
      })

      if (res.ok) {
        setSubmittedText(idea)
        setIdea('')
        setSubmitted(true)
        onAction()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to submit challenger')
      }
    } catch (err) {
      console.error('Submit error:', err)
      alert('Failed to submit challenger')
    } finally {
      setSubmitting(false)
    }
  }

  const handleJoinAndVote = async () => {
    if (!session) {
      router.push('/auth/signin')
      return
    }

    setJoining(true)
    try {
      await fetch(`/api/deliberations/${item.deliberation.id}/join`, { method: 'POST' })
      const res = await fetch(`/api/deliberations/${item.deliberation.id}/enter`, { method: 'POST' })

      if (res.ok) {
        setJoined(true)
        onAction()
      } else {
        const data = await res.json()
        alert(data.error || 'No spots available')
      }
    } catch (err) {
      console.error('Join error:', err)
      alert('Failed to join')
    } finally {
      setJoining(false)
    }
  }

  // Border color based on state
  const borderColor = isChallenge ? 'border-orange' : 'border-success'
  const headerBg = isChallenge ? 'text-orange' : 'text-success'
  const championBg = isChallenge ? 'bg-orange-bg border-orange' : 'bg-success-bg border-success'

  return (
    <div className={`bg-surface border ${borderColor} rounded-xl overflow-hidden`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex justify-between items-center">
        <span className={`${headerBg} font-bold text-sm uppercase tracking-wide`}>
          {isChallenge ? `Challenge Round #${item.deliberation.challengeRound}` : 'Champion'}
        </span>
        <span className="text-sm text-muted font-mono">
          {isChallenge ? (
            `Tier ${item.deliberation.currentTier}`
          ) : item.challengersCount !== undefined && item.challengersCount > 0 ? (
            `${item.challengersCount} challenger${item.challengersCount !== 1 ? 's' : ''} waiting`
          ) : null}
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        <Link
          href={`/deliberations/${item.deliberation.id}`}
          className="block text-lg font-semibold text-foreground hover:text-accent transition-colors"
        >
          "{item.deliberation.question}"
        </Link>
        {item.deliberation.description && (
          <p className="text-muted text-sm mt-1">{item.deliberation.description}</p>
        )}
        {item.deliberation.organization && (
          <p className="text-muted-light text-xs mt-1">{item.deliberation.organization}</p>
        )}
        <div className="mb-4" />

        {/* Champion display */}
        {item.champion && (
          <div className={`${championBg} border rounded-lg p-4 mb-4`}>
            {isChallenge && (
              <div className={`${headerBg} text-xs font-semibold uppercase tracking-wide mb-2`}>
                Defending Champion
              </div>
            )}
            <div className="flex items-start gap-3">
              <span className="text-2xl">{isChallenge ? '🔄' : '👑'}</span>
              <div>
                <p className="text-foreground font-medium">{item.champion.text}</p>
                <p className={`${headerBg} text-sm`}>
                  by {item.champion.author} • {item.champion.totalVotes} votes
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Submit challenger form - only during ACCUMULATING phase (not during VOTING/challenge rounds) */}
        {isAccumulating && !submitted && (
          <div className="space-y-3">
            <form onSubmit={handleSubmitChallenger} className="flex gap-2">
              <input
                type="text"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Submit a challenger..."
                className={`flex-1 bg-background border border-border rounded-lg px-4 py-2 text-foreground placeholder-muted focus:outline-none focus:${borderColor} transition-colors`}
              />
              <button
                type="submit"
                disabled={submitting || !idea.trim() || !captchaToken}
                className={`${isChallenge ? 'bg-orange hover:bg-orange-hover' : 'bg-purple hover:bg-purple-hover'} text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50`}
              >
                {submitting ? '...' : 'Challenge'}
              </button>
            </form>
            <Turnstile
              onVerify={handleCaptchaVerify}
              onExpire={handleCaptchaExpire}
              className="flex justify-center"
            />
          </div>
        )}

        {/* Submitted confirmation - only show during ACCUMULATING phase */}
        {isAccumulating && submitted && (
          <div className="bg-purple-bg border border-purple rounded-lg p-4">
            <p className="text-purple font-medium mb-1 text-center">Challenger submitted!</p>
            {submittedText && (
              <p className="text-foreground text-sm italic text-center mb-3">"{submittedText}"</p>
            )}
            {/* Challenge round info */}
            <div className="bg-surface border border-border rounded-lg p-3 text-center">
              <p className="text-muted text-xs uppercase tracking-wide mb-1">Challenge round starts</p>
              <p className="text-foreground text-sm">
                {item.challengersCount !== undefined && item.challengersCount > 0 ? (
                  <>{item.challengersCount + 1} challengers waiting</>
                ) : (
                  <>Your challenger is first in line</>
                )}
              </p>
              <p className="text-muted text-xs mt-1">Creator will start the round when ready</p>
            </div>
          </div>
        )}

        {/* Join & Vote option - only during active challenge rounds */}
        {isChallenge && !submitted && (
          joined ? (
            <div className="mt-4 p-3 bg-success-bg border border-success rounded-lg text-center">
              <p className="text-success font-medium mb-2">You're in!</p>
              <button
                onClick={onExplore}
                className="bg-warning hover:bg-warning-hover text-black px-4 py-1.5 rounded text-sm font-semibold transition-colors"
              >
                Go Vote Now →
              </button>
            </div>
          ) : canJoinVote ? (
            <div className="mt-4 p-3 bg-warning-bg border border-warning rounded-lg flex justify-between items-center">
              <span className="text-foreground text-sm">
                {spotsRemaining} spot{spotsRemaining !== 1 ? 's' : ''} left to vote
              </span>
              <button
                onClick={handleJoinAndVote}
                disabled={joining}
                className="bg-warning hover:bg-warning-hover text-black px-4 py-1.5 rounded text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {joining ? '...' : 'Join & Vote'}
              </button>
            </div>
          ) : null
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex justify-between items-center text-sm">
        <div className="flex items-center gap-3 text-muted">
          <span>
            {isChallenge
              ? `${item.deliberation._count.ideas} ideas competing`
              : `${item.deliberation._count.members} participants`
            }
          </span>
          {item.deliberation.views > 0 && (
            <span className="flex items-center gap-1">
              <span>👁</span> {item.deliberation.views}
            </span>
          )}
        </div>
        <div className="flex gap-4">
          <button
            onClick={onExplore}
            className="text-muted hover:text-foreground transition-colors"
          >
            Comments
          </button>
          <Link
            href={`/deliberations/${item.deliberation.id}`}
            className="text-accent hover:text-accent-hover transition-colors"
          >
            Full page →
          </Link>
        </div>
      </div>
    </div>
  )
}
