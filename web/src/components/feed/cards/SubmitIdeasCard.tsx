'use client'

import { useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { FeedItem } from '@/types/feed'
import CountdownTimer from '@/components/CountdownTimer'
import Turnstile from '@/components/Turnstile'
import { useToast } from '@/components/Toast'
import CardShell from './CardShell'

type Props = {
  item: FeedItem
  onAction: () => void
  onExplore: () => void
  onSubmitted?: (text: string) => void
  onDismiss?: () => void
}

export default function SubmitIdeasCard({ item, onAction, onSubmitted, onDismiss }: Props) {
  const { showToast } = useToast()
  const { data: session } = useSession()
  const router = useRouter()
  const [idea, setIdea] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(Boolean(item.userSubmittedIdea))
  const [submittedText, setSubmittedText] = useState(item.userSubmittedIdea?.text || '')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [showCaptchaModal, setShowCaptchaModal] = useState(false)
  const [ideaCount, setIdeaCount] = useState(item.votingTrigger?.currentIdeas ?? item.deliberation._count.ideas)

  const isExpired = item.submissionDeadline ? new Date(item.submissionDeadline) < new Date() : false

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken(null)
  }, [])

  const doSubmit = async (token: string | null) => {
    setSubmitting(true)
    setShowCaptchaModal(false)
    try {
      await fetch(`/api/deliberations/${item.deliberation.id}/join`, {
        method: 'POST',
      })

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
        setIdeaCount(prev => prev + 1)
        onAction()
      } else {
        const data = await res.json()
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

    doSubmit(captchaToken)
  }

  const handleCaptchaSuccess = (token: string) => {
    setCaptchaToken(token)
    doSubmit(token)
  }

  const headerRight = item.votingTrigger?.type === 'idea_goal' && item.votingTrigger.ideaGoal ? (
    <>Idea Goal {ideaCount}/{item.votingTrigger.ideaGoal}</>
  ) : item.submissionDeadline ? (
    <>Timed <CountdownTimer deadline={item.submissionDeadline} onExpire={onAction} compact /></>
  ) : (
    <>Facilitator controlled</>
  )

  return (
    <CardShell
      item={item}
      borderColor={isExpired ? 'border-border' : 'border-accent'}
      headerLabel={isExpired ? 'Submission Closed' : 'Accepting Ideas'}
      headerLabelColor={isExpired ? 'text-muted' : 'text-accent'}
      headerRight={headerRight}
      subheader={isExpired ? undefined : 'Share your idea for this question'}
      onDismiss={onDismiss}
      statsLeft={<span>{ideaCount} ideas • {item.deliberation._count.members} participants</span>}
    >
      {submitted ? (
        <div className="bg-success-bg border border-success rounded-lg p-4 text-center">
          <p className="text-success font-medium mb-1">Idea submitted!</p>
          <p className="text-foreground text-sm mb-3 italic">&quot;{submittedText}&quot;</p>

          <div className="text-muted text-xs mb-3">
            {item.votingTrigger?.type === 'idea_goal' && item.votingTrigger.ideaGoal ? (
              <span>Voting starts at {item.votingTrigger.ideaGoal} ideas ({ideaCount}/{item.votingTrigger.ideaGoal})</span>
            ) : item.submissionDeadline ? (
              <span>Voting starts in <CountdownTimer deadline={item.submissionDeadline} onExpire={onAction} compact /></span>
            ) : (
              <span>Voting starts when facilitator is ready</span>
            )}
          </div>

          <Link
            href={`/deliberations/${item.deliberation.id}`}
            className="text-accent text-sm hover:underline"
          >
            See all ideas →
          </Link>
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
    </CardShell>
  )
}
