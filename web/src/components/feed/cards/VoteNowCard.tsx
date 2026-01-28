'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { FeedItem } from '@/types/feed'
import CountdownTimer from '@/components/CountdownTimer'

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
  const cell = item.cell!

  // Initialize state from pre-fetched data
  const [voting, setVoting] = useState<string | null>(null)
  const [voted, setVoted] = useState(cell.userHasVoted || false)
  const [votedIdeaId, setVotedIdeaId] = useState<string | null>(cell.userVotedIdeaId || null)
  const [cellResult, setCellResult] = useState<CellResult | null>(null)

  // Poll for cell status after voting
  useEffect(() => {
    if (!voted) return

    const pollStatus = async () => {
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
    }

    pollStatus()
    const interval = setInterval(pollStatus, 3000)
    return () => clearInterval(interval)
  }, [voted, cell.id, cell.participantCount])

  const handleVote = async (ideaId: string) => {
    setVoting(ideaId)
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
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to vote')
      }
    } catch (err) {
      console.error('Vote error:', err)
      alert('Failed to vote')
    } finally {
      setVoting(null)
    }
  }

  const isCompleted = cellResult?.status === 'COMPLETED'
  const currentVotedCount = cellResult?.votedCount ?? cell.votedCount
  const currentParticipantCount = cellResult?.participantCount ?? cell.participantCount
  const deliberationPhase = cellResult?.deliberation?.phase
  const isAccumulating = deliberationPhase === 'ACCUMULATING'
  const isDeliberationComplete = deliberationPhase === 'COMPLETED'
  const champion = cellResult?.champion

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
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex justify-between items-center">
          <span className={`font-bold text-sm uppercase tracking-wide ${headerColor}`}>
            {headerText}
          </span>
          <span className="text-sm text-muted font-mono">
            {showChampion ? 'Final' : `Tier ${cell.tier}`}
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

          {/* Challenge option when in ACCUMULATING phase */}
          {isAccumulating && cellResult.deliberation?.accumulationEnabled && (
            <div className="mt-4 p-3 bg-purple-bg border border-purple rounded-lg text-center">
              <p className="text-purple text-sm font-medium mb-2">Think you have a better idea?</p>
              <button
                onClick={onExplore}
                className="bg-purple hover:bg-purple-hover text-white px-4 py-1.5 rounded text-sm font-semibold transition-colors"
              >
                Submit a Challenger →
              </button>
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
          <div className="flex gap-4">
            <button
              onClick={onExplore}
              className="text-muted hover:text-foreground text-sm transition-colors"
            >
              Comments
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
  const isUrgent = urgency === 'critical' || urgency === 'warning'
  const borderColor = urgency === 'critical' ? 'border-error' : urgency === 'warning' ? 'border-orange' : 'border-warning'
  const headerBg = urgency === 'critical' ? 'bg-error/10' : urgency === 'warning' ? 'bg-orange/10' : ''

  // Show waiting/voting state
  return (
    <div className={`bg-surface border ${borderColor} rounded-xl overflow-hidden ${urgency === 'critical' ? 'ring-2 ring-error/50' : ''}`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b border-border flex justify-between items-center ${headerBg}`}>
        <div className="flex items-center gap-2">
          {urgency === 'critical' && !voted && (
            <span className="text-error animate-pulse text-lg">⚠</span>
          )}
          <span className={`font-bold text-sm uppercase tracking-wide ${urgency === 'critical' ? 'text-error' : urgency === 'warning' ? 'text-orange' : 'text-warning'}`}>
            {voted ? 'Waiting for others' : urgency === 'critical' ? 'Vote Now - Closing Soon!' : 'Vote Now'}
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
          "{item.deliberation.question}"
        </Link>
        {item.deliberation.description && (
          <p className="text-muted text-sm mt-1">{item.deliberation.description}</p>
        )}
        {item.deliberation.organization && (
          <p className="text-muted-light text-xs mt-1">{item.deliberation.organization}</p>
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

                {!voted ? (
                  <button
                    onClick={() => handleVote(idea.id)}
                    disabled={voting !== null}
                    className="bg-warning hover:bg-warning-hover text-black px-4 py-1.5 rounded text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {voting === idea.id ? '...' : 'Vote'}
                  </button>
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
        <div className="flex gap-4">
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
