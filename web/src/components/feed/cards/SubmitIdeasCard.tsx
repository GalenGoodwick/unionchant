'use client'

import { useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { FeedItem } from '@/types/feed'
import CountdownTimer from '@/components/CountdownTimer'
import ShareMenu from '@/components/ShareMenu'
import Turnstile from '@/components/Turnstile'
import { useToast } from '@/components/Toast'

type Props = {
  item: FeedItem
  onAction: () => void
  onExplore: () => void
  onSubmitted?: (text: string) => void
}

export default function SubmitIdeasCard({ item, onAction, onExplore, onSubmitted }: Props) {
  const { showToast } = useToast()
  const { data: session } = useSession()
  const router = useRouter()
  const [idea, setIdea] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Initialize submitted state from pre-fetched data
  const [submitted, setSubmitted] = useState(Boolean(item.userSubmittedIdea))
  const [submittedText, setSubmittedText] = useState(item.userSubmittedIdea?.text || '')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [showCaptchaModal, setShowCaptchaModal] = useState(false)

  // Check if submission deadline has passed
  const isExpired = item.submissionDeadline ? new Date(item.submissionDeadline) < new Date() : false

  const handleCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token)
  }, [])

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken(null)
  }, [])

  const doSubmit = async (token: string | null) => {
    setSubmitting(true)
    setShowCaptchaModal(false)
    try {
      // First, try to join the deliberation (will succeed or already member)
      await fetch(`/api/deliberations/${item.deliberation.id}/join`, {
        method: 'POST',
      })

      // Then submit the idea with captcha token
      const res = await fetch(`/api/deliberations/${item.deliberation.id}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: idea, captchaToken: token }),
      })

      if (res.ok) {
        onSubmitted?.(idea)
        setSubmittedText(idea)
        setIdea('')
        setSubmitted(true)
        onAction()
      } else {
        const data = await res.json()
        // If captcha required, show modal
        if (data.error?.includes('CAPTCHA')) {
          setShowCaptchaModal(true)
        } else {
          showToast(data.error || 'Failed to submit idea', 'error')
        }
      }
    } catch (err) {
      console.error('Submit error:', err)
      showToast('Failed to submit idea', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!idea.trim()) return

    if (!session) {
      router.push('/auth/signin')
      return
    }

    // Try to submit - server will check if user is already verified
    doSubmit(captchaToken)
  }

  const handleCaptchaSuccess = (token: string) => {
    setCaptchaToken(token)
    doSubmit(token)
  }

  return (
    <div className={`bg-surface border ${isExpired ? 'border-border' : 'border-accent'} rounded-xl overflow-hidden`}>
      {/* Creator / Community meta */}
      {(item.deliberation.creator || item.community) && (
        <div className="px-4 py-2 text-xs text-muted">
          {item.deliberation.creator && <>Created by <Link href={`/user/${item.deliberation.creator.id}`} className="text-accent hover:text-accent-hover">{item.deliberation.creator.name}</Link></>}
          {item.deliberation.creator && item.community && ' · '}
          {item.community && <Link href={`/communities/${item.community.slug}`} className="text-accent hover:text-accent-hover">{item.community.name}</Link>}
        </div>
      )}
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex justify-between items-center">
        <span className={`font-bold text-sm uppercase tracking-wide ${isExpired ? 'text-muted' : 'text-accent'}`}>
          {isExpired ? 'Submission Closed' : 'Accepting Ideas'}
        </span>
        <span className="text-sm text-muted font-mono">
          {item.votingTrigger?.type === 'idea_goal' && item.votingTrigger.ideaGoal ? (
            <>Idea Goal {item.votingTrigger.currentIdeas}/{item.votingTrigger.ideaGoal}</>
          ) : item.submissionDeadline ? (
            <>Timed (<CountdownTimer
              deadline={item.submissionDeadline}
              onExpire={onAction}
              compact
            />)</>
          ) : (
            <>Facilitator controlled</>
          )}
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
        <div className="mb-4" />

        {submitted ? (
          <div className="bg-success-bg border border-success rounded-lg p-4">
            <p className="text-success font-medium mb-2">Idea submitted!</p>
            <p className="text-foreground text-sm mb-3 italic">"{submittedText}"</p>

            {/* Voting trigger info */}
            <div className="bg-surface border border-border rounded-lg p-3 mb-3 text-center">
              <p className="text-muted text-xs uppercase tracking-wide mb-1">Voting starts</p>
              {item.votingTrigger?.type === 'idea_goal' && item.votingTrigger.ideaGoal ? (
                <p className="text-foreground text-sm">
                  Idea Goal {item.votingTrigger.currentIdeas}/{item.votingTrigger.ideaGoal}
                  <span className="text-muted"> ({item.votingTrigger.ideaGoal - item.votingTrigger.currentIdeas} more needed)</span>
                </p>
              ) : item.submissionDeadline ? (
                <span className="text-foreground text-sm">
                  Timed (<CountdownTimer deadline={item.submissionDeadline} onExpire={onAction} compact />)
                </span>
              ) : (
                <p className="text-muted text-sm">Facilitator controlled</p>
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
        ) : isExpired ? (
          <div className="bg-surface border border-border rounded-lg p-4 text-center">
            <p className="text-muted font-medium mb-2">Submission period ended</p>
            <p className="text-muted text-sm">Voting will begin soon</p>
          </div>
        ) : (
          <>
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
                  disabled={submitting || !idea.trim()}
                  className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {submitting ? '...' : 'Submit'}
                </button>
              </div>
            </form>

            {/* Captcha Modal */}
            {showCaptchaModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCaptchaModal(false)}>
                <div className="bg-surface border border-border rounded-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
                  <h3 className="text-foreground font-semibold mb-4 text-center">Quick verification</h3>
                  <Turnstile
                    onVerify={handleCaptchaSuccess}
                    onExpire={handleCaptchaExpire}
                    className="flex justify-center"
                  />
                  <button
                    onClick={() => setShowCaptchaModal(false)}
                    className="mt-4 w-full text-muted text-sm hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
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
        <div className="flex items-center gap-4">
          <button
            onClick={onExplore}
            className="text-muted hover:text-foreground transition-colors"
          >
            Discuss
          </button>
          <ShareMenu
            url={`/deliberations/${item.deliberation.id}`}
            text={item.deliberation.question}
            variant="icon"
              dropUp
          />
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
