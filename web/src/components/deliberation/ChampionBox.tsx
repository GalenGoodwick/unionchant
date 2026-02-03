'use client'

import { getDisplayName } from '@/lib/user'
import FollowButton from '@/components/FollowButton'
import type { Idea } from './types'

export default function ChampionBox({ winner, phase, ideas, creatorId, currentUserId, followedUserIds = [] }: {
  winner: Idea | undefined
  phase: string
  ideas: Idea[]
  creatorId: string
  currentUserId?: string
  followedUserIds?: string[]
}) {
  const hasWinner = !!winner
  const isAccumulating = phase === 'ACCUMULATING' && hasWinner

  const runnerUps = hasWinner
    ? ideas
        .filter(i => i.id !== winner.id && i.totalVotes > 0 && (i.status === 'ELIMINATED' || i.status === 'ADVANCING'))
        .sort((a, b) => b.totalVotes - a.totalVotes)
    : []

  return (
    <div className={`rounded-lg p-4 mb-4 border-2 transition-all ${
      hasWinner
        ? isAccumulating
          ? 'bg-purple-bg border-purple'
          : 'bg-success-bg border-success'
        : 'bg-surface border-border'
    }`}>
      <div className="flex items-center gap-3">
        <div className="text-3xl">{hasWinner ? '🏆' : '❓'}</div>
        <div className="flex-1">
          <div className={`text-xs font-semibold mb-0.5 ${
            hasWinner
              ? isAccumulating ? 'text-purple' : 'text-success'
              : 'text-muted'
          }`}>
            {hasWinner
              ? isAccumulating ? 'CURRENT CHAMPION' : 'CHAMPION'
              : 'CHAMPION TBD'}
          </div>
          <div className={`font-medium ${hasWinner ? 'text-foreground' : 'text-muted'}`}>
            {hasWinner ? winner.text : 'Deliberation in progress...'}
          </div>
          {hasWinner && winner.author && (
            <div className="mt-1">
              <div className="flex items-center gap-2">
                <span className={`text-sm ${isAccumulating ? 'text-purple' : 'text-success'}`}>
                  {getDisplayName(winner.author)}
                </span>
                {currentUserId === winner.author.id ? (
                  <span className="text-xs text-muted">(You are the winner)</span>
                ) : (
                  <FollowButton userId={winner.author.id} initialFollowing={followedUserIds.includes(winner.author.id)} followLabel="Follow Winner" followingLabel="Winner Followed" />
                )}
              </div>
              <div className="text-xs text-muted">{winner.totalVotes} votes</div>
            </div>
          )}
          {isAccumulating && hasWinner && (
            <div className="text-xs text-muted mt-1">Accepting challengers...</div>
          )}
        </div>
      </div>

      {hasWinner && runnerUps.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="text-xs font-semibold text-muted mb-2">RUNNER-UPS</div>
          <div className="space-y-1.5">
            {runnerUps.slice(0, 5).map((idea, i) => (
              <div key={idea.id} className="flex items-start gap-2 text-sm">
                <span className="text-muted font-mono text-xs mt-0.5">{i + 2}.</span>
                <div className="flex-1 min-w-0">
                  <span className="text-foreground">{idea.text}</span>
                  <span className="text-muted text-xs ml-1.5">
                    {idea.author ? getDisplayName(idea.author) : 'Anonymous'} · {idea.totalVotes} votes
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
