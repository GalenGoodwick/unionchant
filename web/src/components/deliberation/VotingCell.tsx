'use client'

import CountdownTimer from '@/components/CountdownTimer'
import { getDisplayName } from '@/lib/user'
import CellDiscussion from './CellDiscussion'
import type { Cell } from './types'

export default function VotingCell({
  cell,
  onVote,
  voting,
  onRefresh
}: {
  cell: Cell
  onVote: (cellId: string, ideaId: string) => void
  voting: string | null
  onRefresh: () => void
}) {
  const hasVoted = cell.votes.length > 0
  const votedIdeaId = cell.votes[0]?.ideaId
  const isActive = cell.status === 'VOTING' && !hasVoted
  const isFinalizing = cell.status === 'VOTING' && !!cell.finalizesAt
  const canChangeVote = isFinalizing && hasVoted

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
            hasVoted ? 'bg-accent-light text-accent' :
            'bg-warning-bg text-warning'
          }`}>
            {isFinalizing ? 'Finalizing' : hasVoted && cell.status === 'VOTING' ? 'Voted' : cell.status}
          </span>
        </div>
      </div>

      {isFinalizing && (
        <p className="text-xs text-accent mb-2">All votes in — you can change your vote before it finalizes.</p>
      )}

      <div className="space-y-1.5">
        {cell.ideas.map(({ idea }) => {
          const isVoted = votedIdeaId === idea.id
          const isWinner = idea.status === 'ADVANCING' || idea.status === 'WINNER'
          const isEliminated = idea.status === 'ELIMINATED'

          return (
            <div
              key={idea.id}
              className={`p-2 rounded flex justify-between items-center text-sm ${
                isWinner ? 'bg-success-bg border border-success' :
                isEliminated ? 'bg-surface text-muted' :
                isVoted ? 'bg-accent-light border border-accent' :
                'bg-background border border-border'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className={`truncate ${isEliminated ? 'text-muted' : 'text-foreground'}`}>{idea.text}</p>
                <p className="text-xs text-muted">{getDisplayName(idea.author)}</p>
              </div>

              <div className="flex items-center gap-2 ml-2">
                {cell.status === 'COMPLETED' && (
                  <span className="text-muted text-xs font-mono">{idea.totalVotes}v</span>
                )}

                {cell.status === 'VOTING' && !hasVoted && (
                  <button
                    onClick={() => onVote(cell.id, idea.id)}
                    disabled={voting === idea.id}
                    className="bg-warning hover:bg-warning-hover text-black px-3 py-1 rounded text-xs font-medium"
                  >
                    {voting === idea.id ? '...' : 'Vote'}
                  </button>
                )}

                {canChangeVote && !isVoted && (
                  <button
                    onClick={() => onVote(cell.id, idea.id)}
                    disabled={voting === idea.id}
                    className="bg-accent hover:bg-accent-hover text-white px-3 py-1 rounded text-xs font-medium"
                  >
                    {voting === idea.id ? '...' : 'Change'}
                  </button>
                )}

                {isVoted && <span className="text-accent text-xs">✓</span>}
                {isWinner && <span className="text-success text-xs">↑</span>}
              </div>
            </div>
          )
        })}
      </div>

      <CellDiscussion
        cellId={cell.id}
        isParticipant={true}
        ideas={cell.ideas.map(ci => ({ id: ci.idea.id, text: ci.idea.text }))}
      />
    </div>
  )
}
