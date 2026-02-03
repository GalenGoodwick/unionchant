'use client'

import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import CountdownTimer from '@/components/CountdownTimer'
import { getDisplayName } from '@/lib/user'
import Header from '@/components/Header'
import ShareMenu from '@/components/ShareMenu'
import { FullPageSpinner } from '@/components/Spinner'
import { useToast } from '@/components/Toast'
import FollowButton from '@/components/FollowButton'
import ReportButton from '@/components/ReportButton'
import { phaseLabel } from '@/lib/labels'

type UserStatus = 'ACTIVE' | 'BANNED' | 'DELETED'

type Idea = {
  id: string
  text: string
  status: string
  tier: number
  totalVotes: number
  losses: number
  isNew: boolean
  author: { id: string; name: string | null; status?: UserStatus }
}

type CellIdea = {
  ideaId: string
  idea: Idea
}

type Participant = {
  userId: string
  status: string
  user: { id: string; name: string | null; image: string | null; status?: UserStatus }
}

type Vote = {
  id: string
  ideaId: string
  isSecondVote: boolean
}

type Comment = {
  id: string
  text: string
  createdAt: string
  user: { id: string; name: string | null; image: string | null; status?: UserStatus }
}

type Cell = {
  id: string
  tier: number
  status: string
  votingDeadline: string | null
  finalizesAt: string | null
  ideas: CellIdea[]
  participants: Participant[]
  votes: Vote[]
}

type Deliberation = {
  id: string
  question: string
  description: string | null
  organization: string | null
  phase: string
  currentTier: number
  isPublic: boolean
  creatorId: string
  createdAt: string
  submissionEndsAt: string | null
  accumulationEndsAt: string | null
  challengeRound: number
  accumulationEnabled: boolean
  championId: string | null
  ideaGoal: number | null
  creator: { id: string; name: string | null; status?: UserStatus }
  ideas: Idea[]
  _count: { members: number }
  isMember?: boolean
  isCreator?: boolean
  inviteCode?: string
  userSubmittedIdea?: { id: string; text: string } | null
  userSubmittedChallenger?: { id: string; text: string } | null
}

type Prediction = {
  id: string
  tierPredictedAt: number
  predictedIdeaId: string
  predictedIdea: { id: string; text: string }
  wonImmediate: boolean | null
  ideaBecameChampion: boolean | null
  enteredForVoting: boolean
  resolvedAt: string | null
  createdAt: string
}

type TierInfo = {
  tier: number
  isBatch: boolean
  isComplete: boolean
  stats: {
    totalCells: number
    completedCells: number
    totalParticipants: number
    totalVotesCast: number
    totalVotesExpected: number
    votingProgress: number
  }
  ideas: { id: string; text: string; status: string; author: { name: string | null } }[]
  batchGroups?: { batch: number; ideas: { id: string; text: string; status: string; author: { name: string | null } }[] }[]
  liveTally?: { ideaId: string; text: string; voteCount: number }[]
  cells: {
    id: string
    batch: number
    status: string
    participantCount: number
    votedCount: number
    votingDeadline?: string | null
    ideas?: { id: string; text: string; status: string; voteCount?: number; author: { name: string | null } }[]
    winner?: { id: string; text: string; author: string }
  }[]
}

// Collapsible Section Component
function Section({
  title,
  badge,
  children,
  defaultOpen = true,
  variant = 'default'
}: {
  title: string
  badge?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  variant?: 'default' | 'warning' | 'success' | 'purple' | 'orange'
}) {
  const [open, setOpen] = useState(defaultOpen)

  const variantStyles = {
    default: 'border-border',
    warning: 'border-warning bg-warning-bg',
    success: 'border-success bg-success-bg',
    purple: 'border-purple bg-purple-bg',
    orange: 'border-orange bg-orange-bg',
  }

  return (
    <div className={`rounded-xl border ${variantStyles[variant]} mb-4 overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex justify-between items-center text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{title}</span>
          {badge}
        </div>
        <svg
          className={`w-5 h-5 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

// Compact Stats Row
function StatsRow({ items }: { items: { label: string; value: string | number; color?: string }[] }) {
  return (
    <div className="flex gap-4 text-sm">
      {items.map((item, i) => (
        <div key={i}>
          <span className="text-muted">{item.label}: </span>
          <span className={`font-mono font-medium ${item.color || 'text-foreground'}`}>{item.value}</span>
        </div>
      ))}
    </div>
  )
}

// Champion Box - Always visible, shows TBD until winner, with runner-ups
function ChampionBox({ winner, phase, ideas, creatorId, currentUserId }: { winner: Idea | undefined; phase: string; ideas: Idea[]; creatorId: string; currentUserId?: string }) {
  const hasWinner = !!winner
  // Only show accumulating state if we actually have a champion
  // This prevents flickering during phase transitions
  const isAccumulating = phase === 'ACCUMULATING' && hasWinner

  // Runner-ups: ideas that competed in final tier, sorted by votes, excluding the winner
  const runnerUps = hasWinner
    ? ideas
        .filter(i => i.id !== winner.id && i.totalVotes > 0 && (i.status === 'ELIMINATED' || i.status === 'ADVANCING'))
        .sort((a, b) => b.totalVotes - a.totalVotes)
    : []

  return (
    <div className={`rounded-xl p-4 mb-4 border-2 transition-all ${
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
              ? isAccumulating ? 'CURRENT PRIORITY' : 'PRIORITY'
              : 'PRIORITY TBD'}
          </div>
          <div className={`font-medium ${hasWinner ? 'text-foreground' : 'text-muted'}`}>
            {hasWinner ? winner.text : 'Talk in progress...'}
          </div>
          {hasWinner && winner.author && (
            <div className={`text-sm ${isAccumulating ? 'text-purple' : 'text-success'}`}>
              {getDisplayName(winner.author)} · {winner.totalVotes} votes
            </div>
          )}
          {hasWinner && currentUserId && currentUserId !== winner.author.id && (
            <div className="flex items-center gap-2 mt-2">
              <FollowButton userId={winner.author.id} initialFollowing={false} followLabel="Follow Winner" followingLabel="Winner Followed" />
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
            {runnerUps.map((idea, i) => (
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

// Tier Funnel - Visual tournament bracket
function TierFunnel({
  currentTier,
  totalIdeas,
  phase,
  ideas
}: {
  currentTier: number
  totalIdeas: number
  phase: string
  ideas: Idea[]
}) {
  // Build tier structure from ACTUAL idea data
  // Each idea's 'tier' field = the highest tier it participated in
  const tiers: { tier: number; ideas: number; advancing: number; status: 'completed' | 'active' | 'pending'; isFinalShowdown: boolean }[] = []

  // Count ideas at each tier level based on their tier field
  // tier=1 means eliminated at tier 1, tier=2 means reached tier 2, etc.
  for (let t = 1; t <= currentTier; t++) {
    // Ideas at this tier = ideas with tier >= t (participated in at least tier t)
    // For tier 1, count all non-pending ideas
    const ideasAtThisTier = t === 1
      ? ideas.filter(i => i.status !== 'PENDING' && i.status !== 'SUBMITTED').length || totalIdeas
      : ideas.filter(i => i.tier >= t).length

    // Ideas that advanced FROM this tier:
    // - For completed tiers: count ideas that reached tier t+1
    // - For current tier: count ideas with ADVANCING or WINNER status
    let advancingFromThisTier: number
    if (t < currentTier) {
      // Completed tier: advancing = ideas that made it to next tier
      advancingFromThisTier = ideas.filter(i => i.tier >= t + 1).length
    } else {
      // Current tier: advancing = ideas marked as advancing or winner
      advancingFromThisTier = ideas.filter(i => i.status === 'ADVANCING' || i.status === 'WINNER').length
    }

    const status: 'completed' | 'active' | 'pending' = t < currentTier ? 'completed' : t === currentTier ? 'active' : 'pending'

    // Final showdown = ≤5 ideas, tier > 1, and this is the CURRENT active tier
    // Don't show final showdown for completed tiers or during mid-transition
    const isFinalShowdown = t > 1 && ideasAtThisTier <= 5 && ideasAtThisTier > 0 && t === currentTier && status === 'active'

    if (ideasAtThisTier > 0 || t === 1) {
      tiers.push({
        tier: t,
        ideas: ideasAtThisTier,
        advancing: advancingFromThisTier,
        status,
        isFinalShowdown
      })
    }
  }

  // Handle champion/winner
  const winner = ideas.find(i => i.status === 'WINNER')
  if (winner && tiers.length > 0) {
    const lastTier = tiers[tiers.length - 1]
    if (lastTier.status === 'active') {
      // Current tier produced winner - mark as completed
      lastTier.status = 'completed'
      lastTier.advancing = 1
    }
  }

  if (tiers.length === 0) return null

  return (
    <div className="bg-background rounded-xl border border-border p-4 mb-4">
      <h3 className="text-sm font-medium text-muted mb-3">Tournament Progress</h3>
      <div className="space-y-2">
        {tiers.map((t, i, arr) => (
          <div key={t.tier} className="relative">
            <div className={`flex items-center gap-3 p-2 rounded-lg transition-all ${
              t.status === 'active' ? 'bg-warning-bg border border-warning' :
              t.status === 'completed' ? 'bg-success-bg border border-success' :
              'bg-surface border border-border'
            }`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                t.status === 'active' ? 'bg-warning text-white' :
                t.status === 'completed' ? 'bg-success text-white' :
                'bg-border text-muted'
              }`}>
                {t.tier}
              </div>
              <div className="flex-1">
                <div className="text-sm text-foreground font-medium">
                  Tier {t.tier} {t.isFinalShowdown && <span className="text-purple text-xs ml-1">(Final Showdown)</span>}
                </div>
                <div className="text-xs text-muted">
                  {t.ideas} idea{t.ideas !== 1 ? 's' : ''} {t.status === 'completed' && t.advancing > 0 ? `→ ${t.advancing} advancing` : ''}
                </div>
              </div>
              {t.status === 'completed' && (
                <svg className="w-5 h-5 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {t.status === 'active' && (
                <div className="w-5 h-5 border-2 border-warning border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            {i < arr.length - 1 && (
              <div className="absolute left-5 top-full w-0.5 h-2 bg-border" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Extended comment type with upvote info
type CommentWithUpvote = Comment & {
  upvoteCount?: number
  userHasUpvoted?: boolean
  reachTier?: number
  isUpPollinated?: boolean
  sourceTier?: number
  linkedIdea?: { id: string; text: string } | null
}

// Discussion component for a cell
function CellDiscussion({ cellId, isParticipant, ideas }: {
  cellId: string
  isParticipant: boolean
  ideas?: { id: string; text: string }[]
}) {
  const { showToast } = useToast()
  const [localComments, setLocalComments] = useState<CommentWithUpvote[]>([])
  const [upPollinatedComments, setUpPollinatedComments] = useState<CommentWithUpvote[]>([])
  const [newComment, setNewComment] = useState('')
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [upvoting, setUpvoting] = useState<string | null>(null)

  const fetchComments = async () => {
    try {
      const res = await fetch(`/api/cells/${cellId}/comments`)
      if (res.ok) {
        const data = await res.json()
        // Handle both old flat array and new structured response
        if (Array.isArray(data)) {
          setLocalComments(data)
          setUpPollinatedComments([])
        } else {
          setLocalComments(data.local || [])
          setUpPollinatedComments(data.upPollinated || [])
        }
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err)
    } finally {
      setLoading(false)
    }
  }

  const comments = [...localComments, ...upPollinatedComments]
  const totalCount = comments.length

  useEffect(() => {
    fetchComments()
    const interval = setInterval(fetchComments, 10000)
    return () => clearInterval(interval)
  }, [cellId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || !isParticipant) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/cells/${cellId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newComment,
          ideaId: selectedIdeaId || undefined,
        }),
      })
      if (res.ok) {
        setNewComment('')
        setSelectedIdeaId(null)
        fetchComments()
      } else {
        const data = await res.json()
        console.error('Comment failed:', data.error)
        showToast(data.error || 'Failed to post comment', 'error')
      }
    } catch (err) {
      console.error('Comment error:', err)
      showToast('Failed to post comment', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpvote = async (commentId: string) => {
    setUpvoting(commentId)
    try {
      const res = await fetch(`/api/comments/${commentId}/upvote`, {
        method: 'POST',
      })
      if (res.ok) {
        fetchComments()
      }
    } catch (err) {
      console.error('Failed to upvote:', err)
    } finally {
      setUpvoting(null)
    }
  }

  const timeAgo = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-muted hover:text-foreground text-sm"
      >
        <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Discussion ({totalCount})
        {upPollinatedComments.length > 0 && (
          <span className="text-purple text-xs">+{upPollinatedComments.length} from other cells</span>
        )}
      </button>

      {expanded && (
        <div className="mt-2">
          {/* Up-pollinated comments section */}
          {upPollinatedComments.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-purple mb-1.5">From other cells in this batch:</p>
              <div className="space-y-1.5">
                {upPollinatedComments.slice(0, 3).map(c => (
                  <div key={c.id} className="bg-purple-bg border-l-2 border-purple rounded p-2 text-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-purple">{getDisplayName(c.user)}</span>
                          <span className="text-xs text-muted">T{c.sourceTier}</span>
                          {c.reachTier && c.reachTier > 1 && (
                            <span className="text-purple text-xs">reached T{c.reachTier}</span>
                          )}
                        </div>
                        <p className="text-foreground text-sm">{c.text}</p>
                      </div>
                      <span className="text-xs text-purple font-mono">{c.upvoteCount || 0}↑</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Local comments */}
          <div className="space-y-2 max-h-40 overflow-y-auto mb-2">
            {loading ? (
              <p className="text-muted text-sm">Loading...</p>
            ) : localComments.length === 0 ? (
              <p className="text-muted text-sm">No messages yet in this cell</p>
            ) : (
              localComments.map(c => (
                <div key={c.id} className="bg-surface rounded p-2 text-sm">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-accent">{getDisplayName(c.user)}</span>
                        <span className="text-muted text-xs">{timeAgo(c.createdAt)}</span>
                        {c.reachTier && c.reachTier > 1 && (
                          <span className="text-purple text-xs">↑T{c.reachTier}</span>
                        )}
                      </div>
                      {c.linkedIdea && (
                        <p className="text-xs text-warning truncate">
                          Re: {c.linkedIdea.text.slice(0, 50)}{c.linkedIdea.text.length > 50 ? '...' : ''}
                        </p>
                      )}
                      <p className="text-foreground">{c.text}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {/* Upvote button */}
                      <button
                        onClick={() => handleUpvote(c.id)}
                        disabled={upvoting === c.id || c.userHasUpvoted}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                          c.userHasUpvoted
                            ? 'bg-purple-bg text-purple'
                            : 'bg-surface hover:bg-purple-bg text-muted hover:text-purple'
                        }`}
                        title={c.userHasUpvoted ? 'You upvoted this' : 'Upvote to help this comment reach more people'}
                      >
                        <svg className="w-3 h-3" fill={c.userHasUpvoted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                        </svg>
                        <span className="font-mono">{c.upvoteCount || 0}</span>
                      </button>
                      <ReportButton targetType="COMMENT" targetId={c.id} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {isParticipant && (
            <div className="space-y-2">
              {/* Idea chips - tap to link comment */}
              {ideas && ideas.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ideas.map(idea => (
                    <button
                      key={idea.id}
                      type="button"
                      onClick={() => setSelectedIdeaId(selectedIdeaId === idea.id ? null : idea.id)}
                      className={`text-xs px-2 py-1 rounded border transition-colors truncate max-w-[150px] ${
                        selectedIdeaId === idea.id
                          ? 'bg-warning-bg border-warning text-warning'
                          : 'bg-background border-border text-muted hover:border-warning hover:text-warning'
                      }`}
                      title={idea.text}
                    >
                      {idea.text.slice(0, 25)}{idea.text.length > 25 ? '...' : ''}
                    </button>
                  ))}
                </div>
              )}
              {selectedIdeaId && (
                <p className="text-xs text-warning">Replying to idea (top comments will follow winning ideas)</p>
              )}
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="text"
                  placeholder={selectedIdeaId ? "Comment on this idea..." : "Message..."}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  maxLength={2000}
                  className="flex-1 bg-background rounded border border-border px-3 py-1.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={submitting || !newComment.trim()}
                  className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
                >
                  {submitting ? '...' : 'Send'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Compact Voting Cell
function VotingCell({
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
    <div className={`rounded-xl border p-3 ${isActive ? 'border-warning bg-warning-bg' : isFinalizing ? 'border-accent bg-accent-light' : 'border-border'}`}>
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

// Tier Progress Panel - shows all cells in the current tier
function TierProgressPanel({ deliberationId, currentTier, onRefresh }: { deliberationId: string; currentTier: number; onRefresh: () => void }) {
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCell, setSelectedCell] = useState<TierInfo['cells'][0] | null>(null)

  useEffect(() => {
    const fetchTierInfo = async () => {
      try {
        const res = await fetch(`/api/deliberations/${deliberationId}/tiers/${currentTier}`)
        if (res.ok) setTierInfo(await res.json())
      } catch (err) {
        console.error('Failed to fetch tier info:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTierInfo()
    const interval = setInterval(fetchTierInfo, 5000)
    return () => clearInterval(interval)
  }, [deliberationId, currentTier])

  if (loading || !tierInfo) return null

  const { stats, cells, ideas, liveTally, isBatch, batchGroups } = tierInfo
  const isFinalShowdown = isBatch && ideas && ideas.length <= 5 && cells.length > 0

  return (
    <Section
      title={isFinalShowdown ? `Final Showdown - Tier ${currentTier}` : `Tier ${currentTier} Progress`}
      badge={
        <span className={`text-xs px-2 py-0.5 rounded font-mono ${
          isFinalShowdown ? 'bg-purple text-white' : 'bg-warning text-black'
        }`}>
          {stats.completedCells}/{stats.totalCells} cells
        </span>
      }
      variant={isFinalShowdown ? 'purple' : 'warning'}
      defaultOpen={true}
    >
      {/* Final showdown banner */}
      {isFinalShowdown && (
        <div className="bg-purple-bg border border-purple rounded-xl p-3 mb-4 text-center">
          <div className="text-purple font-semibold text-sm">All {stats.totalCells} cells voting on the same {ideas?.length} ideas!</div>
          <div className="text-xs text-muted mt-1">Cross-cell tallying determines the priority</div>
        </div>
      )}

      {/* Overall progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>{stats.totalVotesCast} of {stats.totalVotesExpected} votes cast</span>
          <span>{stats.votingProgress}%</span>
        </div>
        <div className="w-full bg-background rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${isFinalShowdown ? 'bg-purple' : 'bg-warning'}`}
            style={{ width: `${stats.votingProgress}%` }}
          />
        </div>
      </div>

      {/* Live vote tally for batches */}
      {isBatch && liveTally && liveTally.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-muted uppercase tracking-wide mb-2">
            {isFinalShowdown ? 'Live Final Tally' : 'Live Vote Tally'}
          </p>
          <div className="space-y-1">
            {liveTally.map((item, index) => {
              const maxVotes = Math.max(...liveTally.map(i => i.voteCount), 1)
              const percentage = maxVotes > 0 ? (item.voteCount / maxVotes) * 100 : 0
              const isLeading = index === 0 && item.voteCount > 0
              return (
                <div key={item.ideaId} className="relative">
                  <div
                    className={`absolute inset-y-0 left-0 rounded ${
                      isLeading ? (isFinalShowdown ? 'bg-purple-bg' : 'bg-warning-bg') : 'bg-surface'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                  <div className="relative flex justify-between items-center p-2 text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isLeading && <span className="text-success">●</span>}
                      <span className="text-foreground truncate">{item.text}</span>
                    </div>
                    <span className={`font-mono ml-2 ${
                      isLeading ? (isFinalShowdown ? 'text-purple font-bold' : 'text-warning font-bold') : 'text-muted'
                    }`}>
                      {item.voteCount}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Cell grid */}
      <div className="mb-2">
        {(() => {
          // Group cells by batch
          const batches = new Map<number, typeof cells>()
          for (const cell of cells) {
            const b = cell.batch ?? 0
            if (!batches.has(b)) batches.set(b, [])
            batches.get(b)!.push(cell)
          }
          const batchEntries = [...batches.entries()].sort((a, b) => a[0] - b[0])
          const hasMultipleBatches = batchEntries.length > 1

          if (isBatch || !hasMultipleBatches) {
            // Final showdown or single batch — flat layout
            return (
              <>
                <p className="text-xs text-muted uppercase tracking-wide mb-2">
                  {isFinalShowdown ? 'All Cells (voting on same ideas)' : hasMultipleBatches ? 'Batches (each with unique ideas)' : 'Cells'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cells.map((cell, index) => {
                    const isComplete = cell.status === 'COMPLETED'
                    return (
                      <button
                        key={cell.id}
                        onClick={() => setSelectedCell(cell)}
                        className={`w-10 h-10 rounded flex flex-col items-center justify-center text-[10px] font-mono transition-all cursor-pointer hover:ring-2 hover:ring-accent ${
                          isComplete
                            ? 'bg-success-bg border border-success text-success'
                            : 'bg-surface border border-border text-muted'
                        }`}
                        title={`Cell ${index + 1}: ${cell.votedCount}/${cell.participantCount} voted`}
                      >
                        <span>{cell.votedCount}/{cell.participantCount}</span>
                        {isComplete && <span>✓</span>}
                      </button>
                    )
                  })}
                </div>
              </>
            )
          }

          // Multiple batches — grouped layout
          return (
            <>
              <p className="text-xs text-muted uppercase tracking-wide mb-2">
                Batches (each with unique ideas)
              </p>
              <div className="space-y-2">
                {batchEntries.map(([batchNum, batchCells]) => (
                  <div key={batchNum} className="border-l-2 border-accent/30 pl-3">
                    <div className="text-xs text-accent mb-1 flex items-center gap-2">
                      <span className="font-medium">Batch {batchNum + 1}</span>
                      <span className="text-muted">({batchCells.length} cells, {batchCells.reduce((s, c) => s + c.participantCount, 0)} people)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {batchCells.map((cell, index) => {
                        const isComplete = cell.status === 'COMPLETED'
                        return (
                          <button
                            key={cell.id}
                            onClick={() => setSelectedCell(cell)}
                            className={`w-10 h-10 rounded flex flex-col items-center justify-center text-[10px] font-mono transition-all cursor-pointer hover:ring-2 hover:ring-accent ${
                              isComplete
                                ? 'bg-success-bg border border-success text-success'
                                : 'bg-surface border border-border text-muted'
                            }`}
                            title={`Batch ${batchNum + 1}, Cell ${index + 1}: ${cell.votedCount}/${cell.participantCount} voted`}
                          >
                            <span>{cell.votedCount}/{cell.participantCount}</span>
                            {isComplete && <span>✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        })()}
      </div>

      {/* Ideas in tier — grouped by batch when multiple batches exist */}
      {!isBatch && ideas && ideas.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted uppercase tracking-wide mb-2">Ideas Competing ({ideas.length})</p>
          {batchGroups && batchGroups.length > 1 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {batchGroups.map(group => (
                <div key={group.batch}>
                  <p className="text-xs text-muted font-medium mb-1">Batch {group.batch + 1} ({group.ideas.length} ideas)</p>
                  <div className="space-y-1">
                    {group.ideas.map(idea => (
                      <div
                        key={idea.id}
                        className={`p-2 rounded text-xs ${
                          idea.status === 'ADVANCING' ? 'bg-success-bg border border-success' :
                          idea.status === 'ELIMINATED' ? 'bg-surface text-muted' :
                          'bg-background border border-border'
                        }`}
                      >
                        <p className="text-foreground truncate">{idea.text}</p>
                        <p className="text-muted text-xs">{idea.author?.name || 'Anonymous'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {ideas.map(idea => (
                <div
                  key={idea.id}
                  className={`p-2 rounded text-xs ${
                    idea.status === 'ADVANCING' ? 'bg-success-bg border border-success' :
                    idea.status === 'ELIMINATED' ? 'bg-surface text-muted' :
                    'bg-background border border-border'
                  }`}
                >
                  <p className="text-foreground truncate">{idea.text}</p>
                  <p className="text-muted text-xs">{idea.author?.name || 'Anonymous'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cell Detail Modal */}
      {selectedCell && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCell(null)}>
          <div className="bg-surface rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-bold">Cell Details</h3>
              <button onClick={() => setSelectedCell(null)} className="text-muted hover:text-foreground">✕</button>
            </div>
            <div className="p-4 space-y-4">
              {/* Status */}
              <div className="flex justify-between items-center">
                <span className="text-muted">Status</span>
                <span className={selectedCell.status === 'COMPLETED' ? 'text-success font-medium' : 'text-warning font-medium'}>
                  {selectedCell.status === 'COMPLETED' ? 'Completed' : 'Voting'}
                </span>
              </div>
              {/* Votes */}
              <div className="flex justify-between items-center">
                <span className="text-muted">Votes</span>
                <span className="font-mono">{selectedCell.votedCount}/{selectedCell.participantCount}</span>
              </div>
              {/* Winner if completed */}
              {selectedCell.status === 'COMPLETED' && selectedCell.winner && (
                <div className="bg-success-bg border border-success rounded-xl p-3">
                  <p className="text-success text-xs font-semibold uppercase mb-1">Winner</p>
                  <p className="text-foreground">{selectedCell.winner.text}</p>
                  <p className="text-muted text-sm">by {selectedCell.winner.author}</p>
                </div>
              )}
              {/* Ideas */}
              <div>
                <p className="text-muted text-xs uppercase mb-2">Ideas in this cell</p>
                <div className="space-y-2">
                  {selectedCell.ideas?.map(idea => (
                    <div key={idea.id} className={`p-2 rounded border ${
                      selectedCell.winner?.id === idea.id ? 'bg-success-bg border-success' : 'bg-background border-border'
                    }`}>
                      <p className="text-foreground text-sm">{idea.text}</p>
                      <div className="flex justify-between text-xs text-muted mt-1">
                        <span>by {idea.author?.name || 'Anonymous'}</span>
                        {idea.voteCount !== undefined && <span>{idea.voteCount} votes</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-3 text-xs text-muted">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-surface border border-border"></div>
          <span>Voting</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-success-bg border border-success"></div>
          <span>Complete</span>
        </div>
        <span className="ml-auto">{stats.totalParticipants} participants</span>
      </div>
    </Section>
  )
}

// Predictions Component (archived but kept for reference)
function PredictionsPanel({ deliberationId, currentTier }: { deliberationId: string; currentTier: number }) {
  const { data: session } = useSession()
  const router = useRouter()
  const { showToast } = useToast()
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [predicting, setPredicting] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tierRes, predRes] = await Promise.all([
          fetch(`/api/deliberations/${deliberationId}/tiers/${currentTier}`),
          session ? fetch(`/api/predictions?deliberationId=${deliberationId}`) : null
        ])

        if (tierRes.ok) setTierInfo(await tierRes.json())
        if (predRes?.ok) {
          const data = await predRes.json()
          setPredictions(data.predictions || [])
        }
      } catch (err) {
        console.error('Failed to fetch:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [deliberationId, currentTier, session])

  const handlePredict = async (ideaId: string) => {
    if (!session) {
      router.push('/auth/signin')
      return
    }
    setPredicting(ideaId)
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliberationId, predictedIdeaId: ideaId, tier: currentTier }),
      })
      if (res.ok) {
        const predRes = await fetch(`/api/predictions?deliberationId=${deliberationId}`)
        if (predRes.ok) {
          const data = await predRes.json()
          setPredictions(data.predictions || [])
        }
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to predict', 'error')
      }
    } finally {
      setPredicting(null)
    }
  }

  if (loading || !tierInfo) return null

  const currentPred = predictions.find(p => p.tierPredictedAt === currentTier)

  return (
    <Section
      title="Predict Winner"
      badge={
        <span className="text-xs bg-purple text-white px-2 py-0.5 rounded">
          {tierInfo.stats.votingProgress}% voted
        </span>
      }
      variant="purple"
      defaultOpen={true}
    >
      <div className="w-full bg-background rounded-full h-1.5 mb-3">
        <div className="bg-purple h-1.5 rounded-full transition-all" style={{ width: `${tierInfo.stats.votingProgress}%` }} />
      </div>

      <div className="space-y-1.5">
        {(tierInfo.liveTally || tierInfo.ideas).map((item) => {
          const idea = 'voteCount' in item ? { ...item, id: item.ideaId } : item
          const voteCount = 'voteCount' in item ? item.voteCount : undefined
          const isPredicted = currentPred?.predictedIdeaId === idea.id

          return (
            <div
              key={idea.id}
              className={`p-2 rounded flex justify-between items-center text-sm ${
                isPredicted ? 'bg-purple text-white' : 'bg-background border border-border'
              }`}
            >
              <div className="flex-1">
                <p className={isPredicted ? 'text-white' : 'text-foreground'}>{idea.text}</p>
                {voteCount !== undefined && (
                  <span className={`text-xs font-mono ${isPredicted ? 'text-purple-light' : 'text-muted'}`}>
                    {voteCount} votes
                  </span>
                )}
              </div>

              {isPredicted ? (
                <span className="text-xs bg-purple-hover px-2 py-0.5 rounded">Your pick</span>
              ) : !currentPred ? (
                <button
                  onClick={() => handlePredict(idea.id)}
                  disabled={predicting === idea.id}
                  className="bg-purple hover:bg-purple-hover text-white px-3 py-1 rounded text-xs"
                >
                  {predicting === idea.id ? '...' : 'Pick'}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      {predictions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-purple-border">
          <p className="text-xs text-purple mb-2">Your predictions:</p>
          <div className="space-y-1">
            {predictions.map(p => (
              <div key={p.id} className="flex justify-between text-xs">
                <span className="text-foreground truncate flex-1">{p.predictedIdea.text}</span>
                <span className={
                  p.resolvedAt === null ? 'text-purple' :
                  p.wonImmediate || p.ideaBecameChampion ? 'text-success' : 'text-error'
                }>
                  {p.resolvedAt === null ? 'T' + p.tierPredictedAt :
                   p.ideaBecameChampion ? '🏆' : p.wonImmediate ? '✓' : '✗'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

// History types
type HistoryIdea = { id: string; text: string; author: string; votes: number; isWinner: boolean; status: string }
type HistoryCell = { id: string; tier: number; completedAt: string; ideas: HistoryIdea[]; totalVotes: number }
type VotingHistory = {
  challengeRound: number
  currentChampion: { id: string; text: string; author: { name: string } } | null
  tiers: Record<number, HistoryCell[]>
  totalCells: number
}

function HistoryPanel({ deliberationId }: { deliberationId: string }) {
  const [history, setHistory] = useState<VotingHistory | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/deliberations/${deliberationId}/history`)
        if (res.ok) setHistory(await res.json())
      } catch (err) {
        console.error('Failed to fetch history:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [deliberationId])

  if (loading) return null

  // Show message if no completed cells yet
  if (!history || history.totalCells === 0) {
    return (
      <Section title="Voting History" defaultOpen={false}>
        <p className="text-muted text-sm">No completed voting rounds yet.</p>
      </Section>
    )
  }

  const tiers = Object.keys(history.tiers).map(Number).sort((a, b) => a - b)

  return (
    <Section
      title="History"
      badge={<span className="text-xs text-muted font-mono">{history.totalCells} cells</span>}
      defaultOpen={false}
    >
      {tiers.map(tier => (
        <div key={tier} className="mb-3">
          <p className="text-sm font-medium text-foreground mb-1">Tier {tier}</p>
          {history.tiers[tier].map(cell => (
            <div key={cell.id} className="bg-surface rounded p-2 mb-1">
              {cell.ideas.sort((a, b) => b.votes - a.votes).map(idea => (
                <div key={idea.id} className={`flex justify-between text-xs py-0.5 ${
                  idea.isWinner ? 'text-success' : 'text-muted'
                }`}>
                  <span className="truncate flex-1">{idea.text}</span>
                  <span className="font-mono ml-2">{idea.votes}{idea.isWinner && ' ✓'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </Section>
  )
}

// Comments Panel - shows all comments organized by tier/cell with up-pollinated highlights
type DelibComment = {
  id: string
  text: string
  createdAt: string
  upvoteCount: number
  reachTier: number
  isUpPollinated?: boolean
  sourceTier?: number
  userHasUpvoted: boolean
  user: { id: string; name: string | null; image: string | null }
}

type CommentsTier = {
  tier: number
  cells: {
    cellId: string
    status: string
    comments: DelibComment[]
  }[]
}

type CommentsData = {
  tiers: CommentsTier[]
  upPollinated: DelibComment[]
  totalComments: number
  currentTier: number
}

function CommentsPanel({ deliberationId }: { deliberationId: string }) {
  const [data, setData] = useState<CommentsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchComments = async () => {
      try {
        const res = await fetch(`/api/deliberations/${deliberationId}/comments`)
        if (res.ok) setData(await res.json())
      } catch (err) {
        console.error('Failed to fetch comments:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchComments()
  }, [deliberationId])

  if (loading) return null

  if (!data || data.totalComments === 0) {
    return (
      <Section title="Discussion" defaultOpen={false}>
        <p className="text-muted text-sm">No comments yet.</p>
      </Section>
    )
  }

  return (
    <Section
      title="Discussion"
      badge={<span className="text-xs text-muted font-mono">{data.totalComments} comments</span>}
      defaultOpen={false}
    >
      {/* Up-pollinated comments section */}
      {data.upPollinated.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-purple text-sm font-medium">Top Comments</span>
            <span className="text-xs text-muted">(up-pollinated from earlier tiers)</span>
          </div>
          <div className="space-y-2">
            {data.upPollinated.slice(0, 5).map(comment => (
              <div key={comment.id} className="bg-purple-bg border border-purple rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <p className="text-foreground text-sm">{comment.text}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                      <span>{comment.user.name || 'Anonymous'}</span>
                      <span>from Tier {comment.sourceTier}</span>
                      <span className="text-purple">reached Tier {comment.reachTier}</span>
                      <span>{comment.upvoteCount} upvotes</span>
                      <ReportButton targetType="COMMENT" targetId={comment.id} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments by tier */}
      {data.tiers.map(tierData => (
        <div key={tierData.tier} className="mb-4">
          <p className="text-sm font-medium text-foreground mb-2">Tier {tierData.tier}</p>
          <div className="space-y-2">
            {tierData.cells.map((cell, cellIndex) => (
              <div key={cell.cellId} className="bg-surface rounded-xl p-2">
                <p className="text-xs text-muted mb-1">
                  Cell {cellIndex + 1} ({cell.comments.length} comments)
                </p>
                <div className="space-y-1.5">
                  {cell.comments.slice(0, 5).map(comment => (
                    <div key={comment.id} className={`p-2 rounded text-sm ${
                      comment.isUpPollinated ? 'bg-purple-bg border-l-2 border-purple' : 'bg-background'
                    }`}>
                      <p className="text-foreground">{comment.text}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                        <span>{comment.user.name || 'Anonymous'}</span>
                        {comment.upvoteCount > 0 && (
                          <span className="text-orange">{comment.upvoteCount} upvotes</span>
                        )}
                        {comment.isUpPollinated && (
                          <span className="text-purple">reached Tier {comment.reachTier}</span>
                        )}
                        <ReportButton targetType="COMMENT" targetId={comment.id} />
                      </div>
                    </div>
                  ))}
                  {cell.comments.length > 5 && (
                    <p className="text-xs text-muted text-center">
                      +{cell.comments.length - 5} more comments
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Section>
  )
}

// Main Page Component
export default function DeliberationPageClient() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const { showToast } = useToast()
  const [deliberation, setDeliberation] = useState<Deliberation | null>(null)
  const [cells, setCells] = useState<Cell[]>([])
  const [loading, setLoading] = useState(true)
  const [newIdea, setNewIdea] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [joining, setJoining] = useState(false)
  const [startingVote, setStartingVote] = useState(false)
  const [startingChallenge, setStartingChallenge] = useState(false)
  const [voting, setVoting] = useState<string | null>(null)
  const [enteringVoting, setEnteringVoting] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [cellsLoaded, setCellsLoaded] = useState(false)
  const [inviteEmails, setInviteEmails] = useState('')
  const [sendingInvites, setSendingInvites] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ sent: number; failed: number } | null>(null)
  const [copiedInviteLink, setCopiedInviteLink] = useState(false)

  const id = params.id as string

  const fetchDeliberation = async () => {
    try {
      const res = await fetch(`/api/deliberations/${id}`)
      if (!res.ok) {
        if (res.status === 404) {
          showToast('This talk no longer exists or has been removed.', 'error')
          router.push('/talks')
        }
        return
      }
      setDeliberation(await res.json())
    } catch {
      showToast('Could not load this talk. It may have moved or ended.', 'error')
      router.push('/talks')
    } finally {
      setLoading(false)
    }
  }

  const fetchCells = async () => {
    if (!session) return
    try {
      const res = await fetch(`/api/deliberations/${id}/cells`)
      if (res.ok) {
        setCells(await res.json())
        setCellsLoaded(true)
      }
    } catch (err) {
      console.error('Failed to fetch cells:', err)
    }
  }

  useEffect(() => { fetchDeliberation() }, [id])

  useEffect(() => {
    if (deliberation?.phase === 'VOTING') {
      const interval = setInterval(() => {
        fetchDeliberation()
        fetchCells()
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [deliberation?.phase])

  useEffect(() => {
    if (deliberation?.phase === 'VOTING' || deliberation?.phase === 'COMPLETED') {
      fetchCells()
    }
  }, [deliberation?.phase, session])

  const handleJoin = async () => {
    if (!session) { router.push('/auth/signin'); return }
    setJoining(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/join`, { method: 'POST' })
      if (res.ok) fetchDeliberation()
    } finally {
      setJoining(false)
    }
  }

  const handleSubmitIdea = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newIdea.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newIdea }),
      })
      if (res.ok) { setNewIdea(''); fetchDeliberation() }
    } finally {
      setSubmitting(false)
    }
  }

  const handleStartVoting = async () => {
    setStartingVote(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/start-voting`, { method: 'POST' })
      if (res.ok) { fetchDeliberation(); fetchCells() }
      else { const d = await res.json(); showToast(d.error || 'Failed', 'error') }
    } finally {
      setStartingVote(false)
    }
  }

  const handleStartChallenge = async () => {
    setStartingChallenge(true)
    try {
      const res = await fetch(`/api/deliberations/${id}/start-challenge`, { method: 'POST' })
      if (res.ok) { fetchDeliberation(); fetchCells() }
      else { const d = await res.json(); showToast(d.error || 'Failed', 'error') }
    } finally {
      setStartingChallenge(false)
    }
  }

  const handleEnterVoting = async () => {
    if (!session) { router.push('/auth/signin'); return }
    setEnteringVoting(true)
    try {
      // First join the deliberation if not a member
      await fetch(`/api/deliberations/${id}/join`, { method: 'POST' })
      // Then enter voting to get assigned to a cell
      const res = await fetch(`/api/deliberations/${id}/enter`, { method: 'POST' })
      if (res.ok) {
        fetchCells()
        fetchDeliberation()
      } else {
        const data = await res.json()
        showToast(data.error || 'No spots available', 'error')
      }
    } catch (err) {
      console.error('Enter voting error:', err)
      showToast('Failed to join voting', 'error')
    } finally {
      setEnteringVoting(false)
    }
  }

  const handleVote = async (cellId: string, ideaId: string) => {
    setVoting(ideaId)
    try {
      const res = await fetch(`/api/cells/${cellId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId }),
      })
      if (res.ok) { fetchCells(); fetchDeliberation() }
      else { const d = await res.json(); showToast(d.error || 'Failed', 'error') }
    } finally {
      setVoting(null)
    }
  }

  const handleRefresh = () => {
    fetchCells()
    fetchDeliberation()
  }

  const handleAction = async (action: string, endpoint: string) => {
    setActionLoading(action)
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      if (res.ok) {
        fetchDeliberation()
        fetchCells()
      } else {
        const data = await res.json()
        showToast(data.error || 'Action failed', 'error')
      }
    } catch {
      showToast('Action failed', 'error')
    } finally {
      setActionLoading('')
    }
  }

  const handleSendInvites = async (e: React.FormEvent) => {
    e.preventDefault()
    const emails = inviteEmails.split(/[,\n]/).map(e => e.trim()).filter(Boolean)
    if (emails.length === 0) return
    setSendingInvites(true)
    setInviteResult(null)
    try {
      const res = await fetch(`/api/deliberations/${id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      })
      if (res.ok) {
        const data = await res.json()
        setInviteResult({ sent: data.sent, failed: data.failed })
        setInviteEmails('')
      } else {
        const data = await res.json()
        showToast(data.error || 'Failed to send invites', 'error')
      }
    } finally {
      setSendingInvites(false)
    }
  }

  const handleCopyInviteLink = () => {
    if (deliberation?.inviteCode) {
      const baseUrl = window.location.origin
      navigator.clipboard.writeText(`${baseUrl}/invite/${deliberation.inviteCode}`)
      setCopiedInviteLink(true)
      setTimeout(() => setCopiedInviteLink(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <FullPageSpinner />
      </div>
    )
  }

  if (!deliberation) return null

  // Find winner by status or by championId (during ACCUMULATING, champion might have different status)
  const winner = deliberation.ideas.find(i => i.status === 'WINNER')
    || (deliberation.championId ? deliberation.ideas.find(i => i.id === deliberation.championId) : undefined)
  const defender = deliberation.ideas.find(i => i.status === 'DEFENDING')
  // Cells where user can still vote (VOTING status, hasn't voted yet, current tier only)
  const activeCells = cells.filter(
    c => c.status === 'VOTING' && c.votes.length === 0 && c.tier === deliberation.currentTier
  )
  // Cells where user has voted or cell is completed
  const votedCells = cells.filter(c => c.status !== 'VOTING' || c.votes.length > 0)
  // Check if user has any cells in current tier (whether voted or not)
  const currentTierCells = cells.filter(c => c.tier === deliberation.currentTier)
  const hasVotedInCurrentTier = currentTierCells.some(c => c.votes.length > 0)
  const isInCurrentTier = currentTierCells.length > 0
  const isCreator = deliberation.isCreator || false

  // Calculate effective phase to prevent flickering during transitions
  // ACCUMULATING should only show if we have a champion, otherwise show VOTING
  const effectivePhase = (deliberation.phase === 'ACCUMULATING' && !winner)
    ? 'VOTING'
    : deliberation.phase

  const phaseColor = {
    SUBMISSION: 'text-accent',
    VOTING: 'text-warning',
    COMPLETED: 'text-success',
    ACCUMULATING: 'text-purple',
  }[effectivePhase] || 'text-muted'

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-xl mx-auto px-4 py-4">
        {/* Back link */}
        <Link href="/feed" className="text-muted hover:text-foreground text-sm mb-3 inline-block">
          ← Back
        </Link>

        {/* Header */}
        <div className="mb-4">
          <div className="flex justify-between items-start gap-2 mb-2">
            <h1 className="text-xl font-bold text-foreground leading-tight">{deliberation.question}</h1>
            <div className="flex gap-1.5 shrink-0 items-center">
              <span className={`text-xs font-semibold px-2 py-1 rounded ${phaseColor} bg-surface`}>
                {effectivePhase}
              </span>
              <span className={`text-xs font-semibold px-2 py-1 rounded ${deliberation.isPublic ? 'text-success bg-success-bg' : 'text-error bg-error-bg'}`}>
                {deliberation.isPublic ? 'Public' : 'Private'}
              </span>
              <ReportButton targetType="DELIBERATION" targetId={deliberation.id} />
            </div>
          </div>

          {deliberation.description && (
            <p className="text-muted text-sm mb-2">{deliberation.description}</p>
          )}

          {deliberation.organization && (
            <p className="text-muted text-sm mb-2">
              <span className="text-foreground font-medium">{deliberation.organization}</span>
            </p>
          )}

          <StatsRow items={[
            { label: 'Tier', value: deliberation.currentTier, color: 'text-accent' },
            { label: 'Ideas', value: deliberation.ideas.length },
            { label: 'Members', value: deliberation._count.members },
          ]} />

          {/* Voting trigger info */}
          <div className="text-xs text-muted mt-1">
            {deliberation.ideaGoal ? (
              <span>Voting starts at {deliberation.ideaGoal} ideas ({deliberation.ideas.length}/{deliberation.ideaGoal})</span>
            ) : deliberation.submissionEndsAt ? (
              <span>Voting starts: {new Date(deliberation.submissionEndsAt).toLocaleString()}</span>
            ) : deliberation.phase === 'SUBMISSION' ? (
              <span>Voting starts: facilitator-controlled</span>
            ) : null}
          </div>
        </div>

        {/* Champion Box - Always visible */}
        <ChampionBox winner={winner} phase={effectivePhase} ideas={deliberation.ideas} creatorId={deliberation.creatorId} currentUserId={session?.user?.id} />

        {/* Phase-specific banners */}
        {deliberation.phase === 'SUBMISSION' && deliberation.submissionEndsAt && (
          <div className="bg-accent-light rounded-xl p-3 mb-4 flex justify-between items-center">
            <span className="text-accent text-sm font-medium">Submissions close:</span>
            <CountdownTimer deadline={deliberation.submissionEndsAt} onExpire={fetchDeliberation} compact />
          </div>
        )}

        {deliberation.challengeRound > 0 && deliberation.phase === 'VOTING' && (
          <div className="bg-orange-bg border border-orange rounded-xl p-3 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-orange font-semibold text-sm">Round {deliberation.challengeRound}</span>
            </div>
            {defender && (
              <div className="mt-2 text-sm">
                <span className="text-muted">Defending: </span>
                <span className="text-foreground">{defender.text}</span>
              </div>
            )}
          </div>
        )}

        {effectivePhase === 'ACCUMULATING' && winner && (
          <div className="bg-purple-bg border border-purple rounded-xl p-3 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-purple font-semibold text-sm">Accepting Challengers</span>
              {deliberation.accumulationEndsAt && (
                <CountdownTimer deadline={deliberation.accumulationEndsAt} onExpire={fetchDeliberation} compact />
              )}
            </div>
            <div className="text-sm">
              <span className="text-muted">Priority: </span>
              <span className="text-foreground">{winner.text}</span>
            </div>
            <div className="mt-2 text-xs text-purple">
              {deliberation.ideas.filter(i => i.status === 'PENDING' && i.isNew).length} challengers waiting
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap mb-4">
          {session && !deliberation.isMember && deliberation.phase === 'SUBMISSION' && (
            <button onClick={handleJoin} disabled={joining} className="bg-success hover:bg-success-hover text-white px-4 py-2 rounded text-sm font-medium">
              {joining ? '...' : 'Join'}
            </button>
          )}

          {!session && (
            <Link href="/auth/signin" className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm font-medium">
              Sign in
            </Link>
          )}

          <ShareMenu
            url={`/talks/${deliberation.id}`}
            text={deliberation.question}
          />

          {/* Export dropdown */}
          <div className="relative group">
            <button className="border border-border hover:border-muted text-foreground px-4 py-2 rounded text-sm">
              Export
            </button>
            <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <a
                href={`/api/deliberations/${deliberation.id}/export?format=pdf`}
                download
                className="block px-4 py-2 text-sm text-foreground hover:bg-surface whitespace-nowrap"
              >
                Download PDF
              </a>
              <a
                href={`/api/deliberations/${deliberation.id}/export?format=csv`}
                download
                className="block px-4 py-2 text-sm text-foreground hover:bg-surface whitespace-nowrap"
              >
                Download CSV
              </a>
              <a
                href={`/api/deliberations/${deliberation.id}/export?format=json`}
                download
                className="block px-4 py-2 text-sm text-foreground hover:bg-surface whitespace-nowrap"
              >
                Download JSON
              </a>
            </div>
          </div>
        </div>

        {/* Submit Idea Form */}
        {deliberation.isMember && deliberation.phase === 'SUBMISSION' && (
          deliberation.userSubmittedIdea ? (
            <div className="bg-success-bg border border-success rounded-xl p-3 mb-4">
              <p className="text-success font-medium text-sm mb-1">Your idea submitted:</p>
              <p className="text-foreground text-sm italic">"{deliberation.userSubmittedIdea.text}"</p>
            </div>
          ) : (
            <form onSubmit={handleSubmitIdea} className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Your idea..."
                  value={newIdea}
                  onChange={(e) => setNewIdea(e.target.value)}
                  maxLength={500}
                  className="flex-1 bg-surface border border-border rounded px-3 py-2 text-foreground placeholder-muted text-sm focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={submitting || !newIdea.trim()}
                  className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                >
                  {submitting ? '...' : 'Submit'}
                </button>
              </div>
              {newIdea.length > 400 && (
                <p className={`text-xs mt-1 text-right ${newIdea.length >= 500 ? 'text-error' : 'text-muted'}`}>
                  {newIdea.length}/500
                </p>
              )}
            </form>
          )
        )}

        {/* Submit Challenger Form */}
        {deliberation.isMember && (effectivePhase === 'VOTING' || effectivePhase === 'ACCUMULATING') && (
          deliberation.userSubmittedChallenger ? (
            <div className="bg-purple-bg border border-purple rounded-xl p-3 mb-4">
              <p className="text-purple font-medium text-sm mb-1">Your challenger submitted:</p>
              <p className="text-foreground text-sm italic">"{deliberation.userSubmittedChallenger.text}"</p>
            </div>
          ) : (
            <form onSubmit={handleSubmitIdea} className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Submit challenger..."
                  value={newIdea}
                  onChange={(e) => setNewIdea(e.target.value)}
                  maxLength={500}
                  className="flex-1 bg-surface border border-border rounded px-3 py-2 text-foreground placeholder-muted text-sm focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={submitting || !newIdea.trim()}
                  className="bg-purple hover:bg-purple-hover text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                >
                  {submitting ? '...' : 'Submit'}
                </button>
              </div>
              {newIdea.length > 400 && (
                <p className={`text-xs mt-1 text-right ${newIdea.length >= 500 ? 'text-error' : 'text-muted'}`}>
                  {newIdea.length}/500
                </p>
              )}
            </form>
          )
        )}

        {/* Active Voting Cells */}
        {activeCells.length > 0 && (
          <Section
            title="Vote Now"
            badge={<span className="w-2 h-2 bg-warning rounded-full animate-pulse" />}
            variant="warning"
          >
            <div className="space-y-3">
              {activeCells.map(cell => (
                <VotingCell key={cell.id} cell={cell} onVote={handleVote} voting={voting} onRefresh={handleRefresh} />
              ))}
            </div>
          </Section>
        )}

        {/* Join Voting - when in VOTING phase but not yet in current tier */}
        {deliberation.phase === 'VOTING' && cellsLoaded && activeCells.length === 0 && !isInCurrentTier && session && (
          <Section
            title="Join Voting"
            badge={<span className="w-2 h-2 bg-warning rounded-full animate-pulse" />}
            variant="warning"
          >
            <div className="text-center py-4">
              <p className="text-muted mb-4">
                Voting is in progress at Tier {deliberation.currentTier}.
                {deliberation.challengeRound > 0 && ` (Round ${deliberation.challengeRound})`}
              </p>
              <button
                onClick={handleEnterVoting}
                disabled={enteringVoting}
                className="bg-warning hover:bg-warning-hover text-black px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {enteringVoting ? 'Joining...' : 'Join & Vote'}
              </button>
              <p className="text-xs text-muted mt-2">You'll be assigned to an available voting cell</p>
            </div>
          </Section>
        )}

        {/* Already voted in current tier */}
        {deliberation.phase === 'VOTING' && hasVotedInCurrentTier && activeCells.length === 0 && session && (
          <Section
            title="Vote Submitted"
            badge={
              <span className="text-success">
                {currentTierCells.filter(c => c.votes.length > 0).length > 1
                  ? `${currentTierCells.filter(c => c.votes.length > 0).length} votes ✓`
                  : '✓'}
              </span>
            }
            variant="default"
          >
            <div className="text-center py-4">
              <p className="text-success font-medium mb-2">
                {currentTierCells.filter(c => c.votes.length > 0).length > 1
                  ? `You've voted in ${currentTierCells.filter(c => c.votes.length > 0).length} cells in Tier ${deliberation.currentTier}!`
                  : `You've voted in Tier ${deliberation.currentTier}!`}
              </p>
              <p className="text-muted text-sm">Waiting for other voters to complete this tier...</p>
            </div>
          </Section>
        )}

        {/* Tier Funnel - visual tournament bracket */}
        {(deliberation.phase === 'VOTING' || deliberation.phase === 'COMPLETED') && (
          <TierFunnel
            currentTier={deliberation.currentTier}
            totalIdeas={deliberation.ideas.length}
            phase={deliberation.phase}
            ideas={deliberation.ideas}
          />
        )}

        {/* Tier & Cell Progress - during voting */}
        {deliberation.phase === 'VOTING' && (
          <TierProgressPanel
            deliberationId={id}
            currentTier={deliberation.currentTier}
            onRefresh={handleRefresh}
          />
        )}

        {/* Previous/Completed Cells */}
        {votedCells.length > 0 && (
          <Section
            title="Your Cells"
            badge={votedCells.length > 1 ? <span className="text-xs text-muted font-mono">{votedCells.length} cells</span> : undefined}
            defaultOpen={activeCells.length === 0}
          >
            <div className="space-y-3">
              {votedCells.map((cell, index) => {
                // Label cells in the same tier (1st vote, 2nd vote, etc.)
                const sameTierCells = votedCells.filter(c => c.tier === cell.tier)
                const cellIndex = sameTierCells.indexOf(cell)
                const showLabel = sameTierCells.length > 1

                return (
                  <div key={cell.id}>
                    {showLabel && (
                      <div className="text-xs text-accent font-medium mb-1">
                        {cellIndex === 0 ? 'Primary vote' : `Extra vote ${cellIndex}`} - Tier {cell.tier}
                      </div>
                    )}
                    <VotingCell cell={cell} onVote={handleVote} voting={voting} onRefresh={handleRefresh} />
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* History */}
        <HistoryPanel deliberationId={id} key={`history-${deliberation.phase}-${deliberation.challengeRound}`} />

        {/* Discussion / Comments */}
        <CommentsPanel deliberationId={id} key={`comments-${deliberation.phase}-${deliberation.challengeRound}`} />

        {/* Ideas by Status - breakdown like admin panel */}
        {deliberation.ideas.length > 0 && (deliberation.phase === 'VOTING' || deliberation.phase === 'COMPLETED' || deliberation.phase === 'ACCUMULATING') && (
          <Section
            title="Ideas Breakdown"
            badge={<span className="text-xs text-muted font-mono">{deliberation.ideas.length} total</span>}
            defaultOpen={false}
          >
            <div className="grid grid-cols-2 gap-4">
              {/* By Status */}
              <div className="space-y-1">
                <div className="text-xs text-muted uppercase tracking-wide mb-2">By Status</div>
                {['PENDING', 'IN_VOTING', 'ADVANCING', 'WINNER', 'ELIMINATED', 'DEFENDING', 'BENCHED', 'RETIRED'].map(status => {
                  const count = deliberation.ideas.filter(i => i.status === status).length
                  if (count === 0) return null
                  const color = {
                    WINNER: 'text-success',
                    ADVANCING: 'text-accent',
                    IN_VOTING: 'text-warning',
                    DEFENDING: 'text-orange',
                    ELIMINATED: 'text-error',
                  }[status] || 'text-muted'
                  return (
                    <div key={status} className="flex justify-between items-center text-sm">
                      <span className={color}>{status}</span>
                      <span className="font-mono text-foreground">{count}</span>
                    </div>
                  )
                })}
              </div>

              {/* By Tier Reached */}
              <div className="space-y-1">
                <div className="text-xs text-muted uppercase tracking-wide mb-2">By Tier Reached</div>
                {(() => {
                  const maxTier = Math.max(...deliberation.ideas.map(i => i.tier), 0)
                  return Array.from({ length: maxTier + 1 }, (_, tier) => {
                    const count = deliberation.ideas.filter(i => i.tier === tier).length
                    if (count === 0 && tier > 0) return null
                    return (
                      <div key={tier} className="flex justify-between items-center text-sm">
                        <span className="text-foreground">Tier {tier}</span>
                        <span className="font-mono text-foreground">{count}</span>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          </Section>
        )}

        {/* All Ideas */}
        <Section
          title="All Ideas"
          badge={<span className="text-xs text-muted font-mono">{deliberation.ideas.length}</span>}
          defaultOpen={deliberation.phase === 'SUBMISSION'}
        >
          {deliberation.ideas.length === 0 ? (
            <p className="text-muted text-sm">No ideas yet</p>
          ) : (
            <div className="space-y-1.5">
              {deliberation.ideas.map(idea => {
                const statusColor = {
                  WINNER: 'border-success bg-success-bg',
                  DEFENDING: 'border-orange bg-orange-bg',
                  ADVANCING: 'border-accent bg-accent-light',
                  IN_VOTING: 'border-warning bg-warning-bg',
                  ELIMINATED: 'border-border bg-surface opacity-60',
                  RETIRED: 'border-border bg-surface opacity-40',
                  BENCHED: 'border-border bg-surface',
                  PENDING: 'border-border bg-background',
                }[idea.status] || 'border-border bg-background'

                return (
                  <div key={idea.id} className={`p-2 rounded border text-sm ${statusColor}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground">{idea.text}</p>
                        <p className="text-xs text-muted">{getDisplayName(idea.author)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs font-medium ${
                          idea.status === 'WINNER' ? 'text-success' :
                          idea.status === 'DEFENDING' ? 'text-orange' :
                          idea.status === 'ADVANCING' ? 'text-accent' :
                          idea.status === 'IN_VOTING' ? 'text-warning' :
                          'text-muted'
                        }`}>
                          {idea.status}
                        </span>
                        {idea.totalVotes > 0 && (
                          <p className="text-xs text-muted font-mono">{idea.totalVotes}v</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
