'use client'

import { useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { FeedItem } from '@/types/feed'
import CountdownTimer from '@/components/CountdownTimer'
import Turnstile from '@/components/Turnstile'

type Props = {
  item: FeedItem
  onAction: () => void
  onExplore: () => void
}

export default function SubmitIdeasCard({ item, onAction, onExplore }: Props) {
  const { data: session } = useSession()
  const router = useRouter()
  const [idea, setIdea] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Initialize submitted state from pre-fetched data
  const [submitted, setSubmitted] = useState(Boolean(item.userSubmittedIdea))
  const [submittedText, setSubmittedText] = useState(item.userSubmittedIdea?.text || '')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)

  const handleCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token)
  }, [])

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken(null)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!idea.trim()) return

    if (!session) {
      router.push('/auth/signin')
      return
    }

    setSubmitting(true)
    try {
      // First, try to join the deliberation (will succeed or already member)
      await fetch(`/api/deliberations/${item.deliberation.id}/join`, {
        method: 'POST',
      })

      // Then submit the idea with captcha token
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
        alert(data.error || 'Failed to submit idea')
      }
    } catch (err) {
      console.error('Submit error:', err)
      alert('Failed to submit idea')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-surface border border-accent rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex justify-between items-center">
        <span className="text-accent font-bold text-sm uppercase tracking-wide">
          Accepting Ideas
        </span>
        <span className="text-sm text-muted font-mono">
          {item.votingTrigger?.type === 'idea_goal' && item.votingTrigger.ideaGoal ? (
            <>{item.votingTrigger.currentIdeas}/{item.votingTrigger.ideaGoal} ideas</>
          ) : item.submissionDeadline ? (
            <CountdownTimer
              deadline={item.submissionDeadline}
              onExpire={onAction}
              compact
            />
          ) : (
            <>Facilitator controlled</>
          )}
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        <Link
          href={`/deliberations/${item.deliberation.id}`}
          className="block text-lg font-semibold text-foreground mb-4 hover:text-accent transition-colors"
        >
          "{item.deliberation.question}"
        </Link>

        {submitted ? (
          <div className="bg-success-bg border border-success rounded-lg p-4">
            <p className="text-success font-medium mb-2">Idea submitted!</p>
            <p className="text-foreground text-sm mb-3 italic">"{submittedText}"</p>

            {/* Voting trigger info */}
            <div className="bg-surface border border-border rounded-lg p-3 mb-3 text-center">
              <p className="text-muted text-xs uppercase tracking-wide mb-1">Voting starts</p>
              {item.votingTrigger?.type === 'idea_goal' && item.votingTrigger.ideaGoal ? (
                <p className="text-foreground text-sm">
                  At {item.votingTrigger.ideaGoal} ideas
                  <span className="text-muted"> ({item.votingTrigger.ideaGoal - item.votingTrigger.currentIdeas} more needed)</span>
                </p>
              ) : item.submissionDeadline ? (
                <span className="text-foreground text-sm">
                  In <CountdownTimer deadline={item.submissionDeadline} onExpire={onAction} compact />
                </span>
              ) : (
                <p className="text-muted text-sm">When creator triggers voting</p>
              )}
            </div>

            <div className="text-center">
              <Link
                href={`/deliberations/${item.deliberation.id}`}
                className="text-accent text-sm hover:underline"
              >
                See all ideas →
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Your idea..."
                className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors"
              />
              <button
                type="submit"
                disabled={submitting || !idea.trim() || !captchaToken}
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {submitting ? '...' : 'Submit'}
              </button>
            </div>
            <Turnstile
              onVerify={handleCaptchaVerify}
              onExpire={handleCaptchaExpire}
              className="flex justify-center"
            />
          </form>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex justify-between items-center text-sm">
        <div className="flex items-center gap-3 text-muted">
          <span>{item.deliberation._count.ideas} ideas • {item.deliberation._count.members} participants</span>
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
