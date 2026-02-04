'use client'

import { useState, useCallback, useEffect } from 'react'
import CountdownTimer from '@/components/CountdownTimer'
import { getDisplayName } from '@/lib/user'
import CellDiscussion from './CellDiscussion'
import type { Cell } from './types'

type TopComment = {
  id: string
  text: string
  userName: string
  upvoteCount: number
}

export default function VotingCell({
  cell,
  onVote,
  voting,
  onRefresh
}: {
  cell: Cell
  onVote: (cellId: string, allocations: { ideaId: string; points: number }[]) => void
  voting: string | null
  onRefresh: () => void
}) {
  const hasVoted = cell.votes.length > 0
  const isActive = cell.status === 'VOTING' && !hasVoted
  const isFinalizing = cell.status === 'VOTING' && !!cell.finalizesAt
  const canChangeVote = isFinalizing && hasVoted

  // Build initial XP state from existing votes (for change mode)
  const existingAllocation: Record<string, number> = {}
  if (hasVoted) {
    cell.votes.forEach(v => {
      existingAllocation[v.ideaId] = (existingAllocation[v.ideaId] || 0) + v.xpPoints
    })
  }

  const [xp, setXP] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState(false)

  // Top up-pollinated comment per idea
  const [topComments, setTopComments] = useState<Record<string, TopComment>>({})

  // Fetch top comment per idea from cell comments
  useEffect(() => {
    const fetchTopComments = async () => {
      try {
        const res = await fetch(`/api/cells/${cell.id}/comments`)
        if (!res.ok) return
        const data = await res.json()
        const all = [...(data.local || []), ...(data.upPollinated || [])]
        const byIdea: Record<string, TopComment> = {}
        for (const c of all) {
          if (!c.ideaId || (c.upvoteCount || 0) === 0) continue
          const existing = byIdea[c.ideaId]
          if (!existing || (c.upvoteCount || 0) > existing.upvoteCount) {
            byIdea[c.ideaId] = {
              id: c.id,
              text: c.text,
              userName: c.user?.name || 'Anonymous',
              upvoteCount: c.upvoteCount || 0,
            }
          }
        }
        setTopComments(byIdea)
      } catch { /* ignore */ }
    }
    fetchTopComments()
  }, [cell.id])

  // Compute effective XP — only count valid idea keys
  const validKeys = new Set<string>()
  cell.ideas.forEach(ci => validKeys.add(ci.idea.id))
  const totalSpent = Object.entries(xp)
    .filter(([key]) => validKeys.has(key))
    .reduce((sum, [, v]) => sum + (isNaN(v) ? 0 : v), 0)
  const remaining = 10 - totalSpent

  const setSlider = useCallback((ideaId: string, value: number) => {
    setXP(prev => {
      const safeValue = isNaN(value) ? 0 : Math.round(value)
      const otherTotal = Object.entries(prev).reduce(
        (sum, [id, v]) => sum + (id === ideaId ? 0 : (isNaN(v) ? 0 : v)), 0
      )
      const maxAllowed = Math.max(0, 10 - otherTotal)
      const clamped = Math.max(0, Math.min(maxAllowed, safeValue))
      const next = { ...prev, [ideaId]: clamped }
      if (next[ideaId] === 0) delete next[ideaId]
      return next
    })
  }, [])

  const handleSubmit = () => {
    const allocations = Object.entries(xp)
      .filter(([, points]) => points > 0)
      .map(([ideaId, points]) => ({ ideaId, points }))
    if (allocations.length === 0 || remaining !== 0) return
    onVote(cell.id, allocations)
  }

  const startEditing = () => {
    setXP(existingAllocation)
    setEditing(true)
  }

  const showStepper = (isActive && !hasVoted) || editing

  return (
    <div className={`rounded-lg border p-3 ${isActive ? 'border-warning bg-warning-bg' : isFinalizing ? 'border-accent bg-accent-light' : 'border-border'}`}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">Tier {cell.tier}</span>
          {isActive && <span className="w-2 h-2 bg-warning rounded-full animate-pulse" />}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {cell.status === 'VOTING' && cell.votingDeadline && !isFinalizing && (
            <CountdownTimer deadline={cell.votingDeadline} onExpire={onRefresh} compact />
          )}
          {isFinalizing && cell.finalizesAt && (
            <CountdownTimer deadline={cell.finalizesAt} onExpire={onRefresh} compact label="Finalizing" />
          )}
          <span className={`px-2 py-0.5 rounded text-xs ${
            cell.status === 'COMPLETED' ? 'bg-success-bg text-success' :
            isFinalizing ? 'bg-accent-light text-accent' :
            hasVoted && !editing ? 'bg-accent-light text-accent' :
            'bg-warning-bg text-warning'
          }`}>
            {isFinalizing ? 'Finalizing' : hasVoted && !editing && cell.status === 'VOTING' ? 'Voted' : cell.status}
          </span>
        </div>
      </div>

      {isFinalizing && !editing && (
        <p className="text-xs text-accent mb-2">All votes in — you can change your Vote Points before it finalizes.</p>
      )}

      {/* XP remaining header */}
      {showStepper && (
        <div className={`text-center text-sm font-medium mb-2 ${remaining === 0 ? 'text-success' : 'text-warning'}`}>
          {remaining === 0 ? 'All 10 Vote Points allocated' : `${remaining} VP remaining`}
        </div>
      )}

      <div className="space-y-1.5">
        {cell.ideas.map(({ idea }) => {
          const isWinner = idea.status === 'ADVANCING' || idea.status === 'WINNER'
          const isEliminated = idea.status === 'ELIMINATED'
          const allocated = xp[idea.id] || 0
          const votedXP = existingAllocation[idea.id] || 0
          const topComment = topComments[idea.id]

          return (
            <div key={idea.id} className={`p-2 rounded text-sm transition-all ${
              isWinner ? 'bg-success-bg border border-success' :
              isEliminated ? 'bg-surface text-muted border border-border' :
              allocated > 0 ? 'bg-accent-light border-2 border-accent' :
              votedXP > 0 && !editing ? 'bg-accent-light border border-accent' :
              'bg-background border border-border'
            }`}>
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className={isEliminated ? 'text-muted' : 'text-foreground'}>{idea.text}</p>
                  <p className="text-xs text-muted mt-0.5">{getDisplayName(idea.author)}</p>
                </div>
                <div className="flex items-center gap-1.5 ml-1 shrink-0">
                  {cell.status === 'COMPLETED' && (
                    <span className="text-muted text-xs font-mono">{idea.totalXP} VP</span>
                  )}
                  {showStepper && allocated > 0 && (
                    <span className="text-accent text-xs font-mono font-bold">{allocated}</span>
                  )}
                  {hasVoted && !editing && cell.status === 'VOTING' && votedXP > 0 && (
                    <span className="text-accent text-xs font-mono">{votedXP} VP</span>
                  )}
                  {isWinner && <span className="text-success text-xs">&#8593;</span>}
                </div>
              </div>

              {/* Top up-pollinated comment */}
              {topComment && (
                <div className="mt-1.5 pt-1.5 border-t border-purple/20 bg-purple-bg/30 rounded px-1.5 py-1">
                  <p className="text-xs text-foreground/80">{topComment.text}</p>
                  <p className="text-[10px] text-purple mt-0.5">
                    {topComment.userName} &middot; {topComment.upvoteCount} upvote{topComment.upvoteCount !== 1 ? 's' : ''}
                  </p>
                </div>
              )}

              {/* XP slider */}
              {showStepper && !isEliminated && (
                <div className="mt-2 pt-1.5 border-t border-border/50 flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={allocated}
                    onChange={e => setSlider(idea.id, parseInt(e.target.value) || 0)}
                    aria-label={`Vote points for: ${idea.text.slice(0, 50)}`}
                    className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-border [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-md"
                  />
                  <span className="text-xs font-mono text-accent w-4 text-right">{allocated}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Submit / Change buttons */}
      {showStepper && (
        <button
          onClick={handleSubmit}
          disabled={remaining !== 0 || voting === cell.id}
          aria-label={editing ? 'Update your vote' : 'Submit your vote'}
          className="w-full mt-3 py-2 rounded-lg bg-warning hover:bg-warning-hover text-black text-sm font-medium disabled:opacity-40 transition-colors"
        >
          {voting === cell.id ? 'Submitting...' : editing ? 'Update Vote' : 'Submit Vote'}
        </button>
      )}

      {canChangeVote && !editing && (
        <button
          onClick={startEditing}
          className="w-full mt-2 py-1.5 rounded-lg border border-accent text-accent text-sm font-medium hover:bg-accent-light transition-colors"
        >
          Change Vote
        </button>
      )}

      <CellDiscussion
        cellId={cell.id}
        isParticipant={true}
        ideas={cell.ideas.map(ci => ({ id: ci.idea.id, text: ci.idea.text }))}
      />
    </div>
  )
}
