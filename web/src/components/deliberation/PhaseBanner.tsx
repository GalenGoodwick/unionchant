'use client'

import CountdownTimer from '@/components/CountdownTimer'
import type { Deliberation, Idea } from './types'

export default function PhaseBanner({
  deliberation,
  effectivePhase,
  winner,
  defender,
  onExpire,
}: {
  deliberation: Deliberation
  effectivePhase: string
  winner: Idea | undefined
  defender: Idea | undefined
  onExpire: () => void
}) {
  // Submission countdown
  if (deliberation.phase === 'SUBMISSION' && deliberation.submissionEndsAt) {
    return (
      <div className="bg-accent-light rounded-lg p-3 flex justify-between items-center">
        <span className="text-accent text-sm font-medium">Submissions close:</span>
        <CountdownTimer deadline={deliberation.submissionEndsAt} onExpire={onExpire} compact />
      </div>
    )
  }

  // Challenge round banner
  if (deliberation.challengeRound > 0 && deliberation.phase === 'VOTING') {
    return (
      <div className="bg-orange-bg border border-orange rounded-lg p-3">
        <div className="flex justify-between items-center">
          <span className="text-orange font-semibold text-sm">Round {deliberation.challengeRound + 1}</span>
        </div>
        {defender && (
          <div className="mt-2 text-sm">
            <span className="text-muted">Defending: </span>
            <span className="text-foreground">{defender.text}</span>
          </div>
        )}
      </div>
    )
  }

  // Accumulation banner
  if (effectivePhase === 'ACCUMULATING' && winner) {
    return (
      <div className="bg-purple-bg border border-purple rounded-lg p-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-purple font-semibold text-sm">Accepting Challengers</span>
          {deliberation.accumulationEndsAt ? (
            <CountdownTimer deadline={deliberation.accumulationEndsAt} onExpire={onExpire} compact />
          ) : (
            <span className="text-xs text-muted">Facilitator-controlled</span>
          )}
        </div>
        <div className="text-lg font-bold text-foreground">{deliberation.question}</div>
        <div className="mt-2 text-xs text-purple">
          {deliberation.ideas.filter(i => i.status === 'PENDING' && i.isNew).length} challengers waiting
        </div>
      </div>
    )
  }

  return null
}
