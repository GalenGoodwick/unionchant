'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { FeedItem } from '@/types/feed'
import CountdownTimer from '@/components/CountdownTimer'
import ShareMenu from '@/components/ShareMenu'
import Spinner from '@/components/Spinner'
import { useToast } from '@/components/Toast'

function CellIdeasCollapsible({ ideas, winnerId, votedIdeaId, tier }: {
  ideas: { id: string; text: string; author: string }[]
  winnerId: string | null
  votedIdeaId: string | null
  tier: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-muted hover:text-foreground transition-colors flex items-center gap-1"
      >
        <span className="text-xs">{open ? '▼' : '▶'}</span>
        <span>Ideas ({ideas.length})</span>
      </button>
      {open && (
        <div className="space-y-1.5 mt-2">
          {ideas.map((idea) => {
            const isWinner = idea.id === winnerId
            const isYourVote = idea.id === votedIdeaId

            return (
              <div
                key={idea.id}
                className={`p-2 rounded-lg text-sm flex items-center gap-2 ${
                  isWinner
                    ? 'bg-success-bg border border-success'
                    : isYourVote
                    ? 'bg-warning-bg border border-warning'
                    : 'bg-background border border-border opacity-60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-foreground truncate">{idea.text}</p>
                  <p className="text-xs text-muted">by {idea.author}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  {isWinner && <span className="text-success font-medium">Winner</span>}
                  {isYourVote && <span className="text-warning font-medium">Your vote</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

type Props = {
  item: FeedItem
  onAction: () => void
  onExplore: () => void
  onVoted?: () => void
  onDismiss?: () => void
}

type CellResult = {
  status: 'VOTING' | 'COMPLETED'
  winner?: { id: string; text: string; author: string }
  champion?: { id: string; text: string; author: string }
  votedCount: number
  participantCount: number
  secondVotesEnabled?: boolean
  secondVoteDeadline?: string | null
  deliberation?: {
    id: string
    phase: string
    accumulationEnabled: boolean
  }
}

export default function VoteNowCard({ item, onAction, onExplore, onVoted, onDismiss }: Props) {
  const { showToast } = useToast()
  const { data: session } = useSession()
  const router = useRouter()
  const cell = item.cell!

  // Initialize state from pre-fetched data
  const [voting, setVoting] = useState<string | null>(null)
  const [voted, setVoted] = useState(cell.userHasVoted || false)
  const [votedIdeaId, setVotedIdeaId] = useState<string | null>(cell.userVotedIdeaId || null)
  const [cellResult, setCellResult] = useState<CellResult | null>(null)

  // Challenger submission state
  const [challengerText, setChallengerText] = useState('')
  const [submittingChallenger, setSubmittingChallenger] = useState(false)
  const [challengerSubmitted, setChallengerSubmitted] = useState(Boolean(item.userSubmittedIdea))

  // Submit challenger idea
  const handleSubmitChallenger = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!challengerText.trim()) return
    if (!session) { router.push('/auth/signin'); return }

    setSubmittingChallenger(true)
    try {
      await fetch(`/api/deliberations/${item.deliberation.id}/join`, { method: 'POST' })
      const res = await fetch(`/api/deliberations/${item.deliberation.id}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: challengerText }),
      })
      if (res.ok) {
        setChallengerSubmitted(true)
        setChallengerText('')
        onAction()
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to submit challenger', 'error')
      }
    } catch (err) {
      console.error('Submit challenger error:', err)
      showToast('Failed to submit challenger', 'error')
    } finally {
      setSubmittingChallenger(false)
    }
  }

  // Check if cell is already completed on initial render
  const isInitiallyCompleted = cell.status === 'COMPLETED'

  // Poll for cell status after voting OR if cell is already completed
  const pollStatus = useCallback(async () => {
    // Don't poll when tab hidden
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

    try {
      const res = await fetch(`/api/cells/${cell.id}`)
      if (res.ok) {
        const data = await res.json()
        setCellResult({
          status: data.status,
          winner: data.winner,
          champion: data.champion,
          votedCount: data.votedCount || 0,
          participantCount: data.participantCount || cell.participantCount,
          secondVotesEnabled: data.secondVotesEnabled,
          secondVoteDeadline: data.secondVoteDeadline,
          deliberation: data.deliberation,
        })
      }
    } catch (err) {
      console.error('Failed to fetch cell status:', err)
    }
  }, [cell.id, cell.participantCount])

  useEffect(() => {
    if (!voted && !isInitiallyCompleted) return

    pollStatus()
    const interval = setInterval(pollStatus, 3000)

    // Re-fetch when tab becomes visible
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') pollStatus()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [voted, isInitiallyCompleted, pollStatus])

  const [isProcessing, setIsProcessing] = useState(false)

  const handleVote = async (ideaId: string) => {
    setVoting(ideaId)
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/cells/${cell.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId }),
      })

      if (res.ok) {
        onVoted?.() // Tell feed to preserve this card
        setVoted(true)
        setVotedIdeaId(ideaId)
        onAction() // Trigger feed refresh
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to vote', 'error')
      }
    } catch (err) {
      console.error('Vote error:', err)
      showToast('Failed to vote', 'error')
    } finally {
      setVoting(null)
      setIsProcessing(false)
    }
  }

  const isCompleted = cellResult?.status === 'COMPLETED' || isInitiallyCompleted
  const currentVotedCount = cellResult?.votedCount ?? cell.votedCount
  const currentParticipantCount = cellResult?.participantCount ?? cell.participantCount
  const deliberationPhase = cellResult?.deliberation?.phase
  const isAccumulating = deliberationPhase === 'ACCUMULATING'
  const isDeliberationComplete = deliberationPhase === 'COMPLETED'
  const champion = cellResult?.champion

  // Check if voting deadline has passed
  const isExpired = cell.votingDeadline ? new Date(cell.votingDeadline) < new Date() : false

  // Show loading state while fetching results for completed cells
  if (isInitiallyCompleted && !cellResult) {
    return (
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <span className="font-bold text-sm uppercase tracking-wide text-muted">Loading results</span>
        </div>
        <div className="p-4">
          <p className="text-lg font-semibold text-foreground">&quot;{item.deliberation.question}&quot;</p>
          <div className="mt-4 flex justify-center">
            <Spinner size="sm" />
          </div>
        </div>
      </div>
    )
  }

  // Show completed state only when cell is done and we have results
  if (isCompleted && cellResult?.winner) {
    const yourPick = cell.ideas.find(i => i.id === votedIdeaId)
    const didWin = votedIdeaId === cellResult.winner.id

    // Determine display based on deliberation phase
    const showChampion = (isAccumulating || isDeliberationComplete) && champion
    const headerText = showChampion
      ? (isDeliberationComplete ? '👑 Champion Crowned!' : '👑 New Champion!')
      : (didWin ? '🎉 Your Pick Won!' : 'Voting Complete')
    const headerColor = showChampion
      ? 'text-success'
      : (didWin ? 'text-success' : 'text-muted')
    const borderColor = showChampion || didWin ? 'border-success' : 'border-border'

    return (
      <div className={`bg-surface border ${borderColor} rounded-xl overflow-hidden`}>
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
          <span className={`font-bold text-sm uppercase tracking-wide ${headerColor}`}>
            {headerText}
          </span>
          <span className="text-sm text-muted font-mono">
            {showChampion ? `Final · Tier ${cell.tier}` : `Tier ${cell.tier}`}
          </span>
        </div>

        {/* Body */}
        <div className="p-4">
          <Link
            href={`/deliberations/${item.deliberation.id}`}
            className="block text-lg font-semibold text-foreground hover:text-accent transition-colors"
          >
            &quot;{item.deliberation.question}&quot;
          </Link>
          {item.deliberation.description && (
            <p className="text-muted text-sm mt-1">{item.deliberation.description}</p>
          )}
          <div className="mb-4" />

          {/* Champion display (when deliberation is ACCUMULATING or COMPLETED) */}
          {showChampion && (
            <div className="bg-success-bg border border-success rounded-lg p-4 mb-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl">👑</span>
                <div>
                  <div className="text-success text-xs font-semibold uppercase tracking-wide mb-1">
                    {isDeliberationComplete ? 'Final Champion' : 'Champion'}
                  </div>
                  <p className="text-foreground font-medium">{champion.text}</p>
                  <p className="text-muted text-sm">by {champion.author}</p>
                </div>
              </div>
            </div>
          )}

          {/* Cell winner (when more tiers to go) */}
          {!showChampion && (
            <div className="bg-success-bg border border-success rounded-lg p-4 mb-3">
              <div className="text-success text-xs font-semibold uppercase tracking-wide mb-1">
                Winner → Advancing
              </div>
              <p className="text-foreground font-medium">{cellResult.winner.text}</p>
              <p className="text-muted text-sm">by {cellResult.winner.author}</p>
            </div>
          )}

          {/* Your pick if different */}
          {!didWin && yourPick && (
            <div className="bg-surface border border-border rounded-lg p-3 opacity-60">
              <div className="text-muted text-xs uppercase tracking-wide mb-1">Your Pick</div>
              <p className="text-foreground text-sm">{yourPick.text}</p>
            </div>
          )}

          {/* Collapsible: All ideas in this cell */}
          <CellIdeasCollapsible
            ideas={cell.ideas}
            winnerId={cellResult.winner?.id || null}
            votedIdeaId={votedIdeaId}
            tier={cell.tier}
          />

          {/* Challenge option when in ACCUMULATING phase */}
          {isAccumulating && cellResult.deliberation?.accumulationEnabled && (
            <div className="mt-4 p-3 bg-purple-bg border border-purple rounded-lg">
              {challengerSubmitted ? (
                <p className="text-purple text-sm font-medium text-center">Challenger submitted!</p>
              ) : (
                <>
                  <p className="text-purple text-sm font-medium mb-2 text-center">Think you have a better idea?</p>
                  <form onSubmit={handleSubmitChallenger} className="flex gap-2">
                    <input
                      type="text"
                      value={challengerText}
                      onChange={(e) => setChallengerText(e.target.value)}
                      placeholder="Your challenger idea..."
                      className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-foreground placeholder-muted focus:outline-none focus:border-purple text-sm"
                    />
                    <button
                      type="submit"
                      disabled={submittingChallenger || !challengerText.trim()}
                      className="bg-purple hover:bg-purple-hover text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {submittingChallenger ? '...' : 'Challenge'}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex justify-between items-center">
          {onDismiss ? (
            <button
              onClick={onDismiss}
              className="text-muted hover:text-foreground text-sm transition-colors"
            >
              Dismiss
            </button>
          ) : <span />}
          <div className="flex items-center gap-4">
            <ShareMenu
              url={`/deliberations/${item.deliberation.id}`}
              text={item.deliberation.question}
              variant="icon"
              dropUp
            />
            <button
              onClick={onExplore}
              className="text-muted hover:text-foreground text-sm transition-colors"
            >
              Discuss
            </button>
            <Link
              href={`/deliberations/${item.deliberation.id}`}
              className="text-accent hover:text-accent-hover text-sm transition-colors"
            >
              Full page →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Determine urgency styling
  const urgency = cell.urgency || 'normal'
  const borderColor = isExpired ? 'border-border' : urgency === 'critical' ? 'border-error' : urgency === 'warning' ? 'border-orange' : 'border-warning'
  const headerBg = isExpired ? '' : urgency === 'critical' ? 'bg-error/10' : urgency === 'warning' ? 'bg-orange/10' : ''

  // Show waiting/voting state
  return (
    <div className={`bg-surface border ${borderColor} rounded-xl overflow-hidden ${urgency === 'critical' && !isExpired ? 'ring-2 ring-error/50' : ''} relative`}>
      {/* Loading overlay */}
      {isProcessing && (
        <div className="absolute inset-0 bg-surface/80 flex items-center justify-center z-10 rounded-xl">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-warning border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-muted text-sm">Submitting vote...</p>
          </div>
        </div>
      )}
      {/* Creator / Community meta */}
      {(item.deliberation.creator || item.community) && (
        <div className="px-4 py-2 text-xs text-muted">
          {item.deliberation.creator && <>Created by <Link href={`/user/${item.deliberation.creator.id}`} className="text-accent hover:text-accent-hover">{item.deliberation.creator.name}</Link></>}
          {item.deliberation.creator && item.community && ' · '}
          {item.community && <Link href={`/communities/${item.community.slug}`} className="text-accent hover:text-accent-hover">{item.community.name}</Link>}
        </div>
      )}
      {/* Header */}
      <div className={`px-4 py-3 border-b border-border flex justify-between items-center ${headerBg}`}>
        <div className="flex items-center gap-2">
          {urgency === 'critical' && !voted && !isExpired && (
            <span className="text-error animate-pulse text-lg">⚠</span>
          )}
          <span className={`font-bold text-sm uppercase tracking-wide ${isExpired ? 'text-muted' : urgency === 'critical' ? 'text-error' : urgency === 'warning' ? 'text-orange' : 'text-warning'}`}>
            {isExpired ? 'Voting Ended' : voted ? 'Waiting for others' : urgency === 'critical' ? 'Vote Now - Closing Soon!' : 'Vote Now'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted font-mono">
          <span>Tier {cell.tier}</span>
          {cell.votingDeadline && (
            <>
              <span>•</span>
              <span className={urgency === 'critical' ? 'text-error font-bold' : urgency === 'warning' ? 'text-orange' : ''}>
                <CountdownTimer
                  deadline={cell.votingDeadline}
                  onExpire={onAction}
                  compact
                />
              </span>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <Link
          href={`/deliberations/${item.deliberation.id}`}
          className="block text-lg font-semibold text-foreground hover:text-accent transition-colors"
        >
          &quot;{item.deliberation.question}&quot;
        </Link>
        {item.deliberation.description && (
          <p className="text-muted text-sm mt-1">{item.deliberation.description}</p>
        )}
        <div className="mb-4" />

        {/* Ideas */}
        <div className="space-y-2">
          {cell.ideas.map((idea) => {
            const isCurrentVote = votedIdeaId === idea.id
            const canChange = voted && !isCurrentVote

            return (
              <div
                key={idea.id}
                className={`p-3 rounded-lg flex justify-between items-center transition-all ${
                  isCurrentVote
                    ? 'bg-success-bg border border-success'
                    : 'bg-background border border-border hover:border-warning'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-foreground truncate">{idea.text}</p>
                  <p className="text-xs text-muted">by {idea.author}</p>
                </div>

                {!voted && !isExpired ? (
                  <button
                    onClick={() => handleVote(idea.id)}
                    disabled={voting !== null}
                    className="bg-warning hover:bg-warning-hover text-black px-4 py-1.5 rounded text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {voting === idea.id ? '...' : 'Vote'}
                  </button>
                ) : !voted && isExpired ? (
                  <span className="text-muted text-sm">Ended</span>
                ) : isCurrentVote ? (
                  <span className="text-success text-sm font-medium">Your Vote</span>
                ) : canChange ? (
                  <button
                    onClick={() => handleVote(idea.id)}
                    disabled={voting !== null}
                    className="text-muted hover:text-warning text-sm transition-colors disabled:opacity-50"
                  >
                    {voting === idea.id ? '...' : 'Change'}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Waiting indicator */}
        {voted && (
          <div className="mt-4 text-center text-muted text-sm">
            <span className="animate-pulse">Waiting for {currentParticipantCount - currentVotedCount} more vote{currentParticipantCount - currentVotedCount !== 1 ? 's' : ''}...</span>
            <p className="text-xs mt-1">You can change your vote until voting ends</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex justify-between items-center text-sm">
        <div className="flex items-center gap-3 text-muted">
          <span>{currentVotedCount}/{currentParticipantCount} voted</span>
          {item.deliberation.views > 0 && (
            <span className="flex items-center gap-1">
              <span>👁</span> {item.deliberation.views}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <ShareMenu
            url={`/deliberations/${item.deliberation.id}`}
            text={item.deliberation.question}
            variant="icon"
              dropUp
          />
          <button
            onClick={onExplore}
            className="text-muted hover:text-foreground transition-colors"
          >
            Discuss
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
