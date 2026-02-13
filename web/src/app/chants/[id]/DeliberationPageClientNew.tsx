'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import ShareMenu from '@/components/ShareMenu'
import { FullPageSpinner } from '@/components/Spinner'
import CountdownTimer from '@/components/CountdownTimer'
import FollowButton from '@/components/FollowButton'
import { useDeliberation } from '@/hooks/useDeliberation'
import { useCollectiveChat } from '@/app/providers'
import { getDisplayName } from '@/lib/user'

import ProgressTrail from '@/components/deliberation/ProgressTrail'
import type { ProgressNode } from '@/components/deliberation/ProgressTrail'
import IdeaCard from '@/components/deliberation/IdeaCard'
import JourneyTimeline from '@/components/deliberation/JourneyTimeline'
import type { TimelineEntry } from '@/components/deliberation/JourneyTimeline'
import CellMembersBar from '@/components/deliberation/CellMembersBar'
import VotingCell from '@/components/deliberation/VotingCell'
import WinnerCard from '@/components/deliberation/WinnerCard'
import DefenderCard from '@/components/deliberation/DefenderCard'
import StatsRow from '@/components/deliberation/StatsRow'
import FirstVisitTooltip from '@/components/FirstVisitTooltip'
import DiscordClaimBanner from '@/components/DiscordClaimBanner'
import FlaggedBadge from '@/components/FlaggedBadge'
import CommentsPanel from '@/components/deliberation/CommentsPanel'
import type { Deliberation, Cell, Idea } from '@/components/deliberation/types'

// ─── Collective Chat Link ───

function CollectiveChatLink({ createdAt }: { createdAt: string }) {
  const { toggleChat, chatOpen } = useCollectiveChat()
  const time = new Date(createdAt).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <button
      onClick={() => { if (!chatOpen) toggleChat() }}
      className="flex items-center gap-1.5 text-xs text-gold hover:text-gold-hover transition-colors mb-2"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="12" r="7" strokeDasharray="2 3" />
        <circle cx="12" cy="12" r="11" strokeDasharray="1.5 3" />
      </svg>
      <span>See in Collective Chat &middot; {time}</span>
    </button>
  )
}

// ─── Helpers ───

function buildProgressNodes(delib: Deliberation, effectivePhase: string): ProgressNode[] {
  const nodes: ProgressNode[] = []
  const phase = effectivePhase
  const tier = delib.currentTier

  // Submit node
  if (phase === 'SUBMISSION') {
    nodes.push({ label: 'Submit', status: 'current', color: 'accent' })
  } else {
    nodes.push({ label: 'Submit', status: 'done' })
  }

  // Tier nodes
  for (let t = 1; t <= tier; t++) {
    if (t < tier) {
      nodes.push({ label: `T${t}`, status: 'done' })
    } else if (phase === 'VOTING') {
      nodes.push({ label: `T${t}`, status: 'current', color: delib.challengeRound > 0 ? 'orange' : 'warning' })
    } else if (phase === 'ACCUMULATING') {
      nodes.push({ label: `T${t}`, status: 'done' })
    } else if (phase === 'COMPLETED') {
      nodes.push({ label: `T${t}`, status: 'done' })
    } else {
      nodes.push({ label: `T${t}`, status: 'current' })
    }
  }

  // Accumulating node (if applicable)
  if (delib.accumulationEnabled && phase === 'ACCUMULATING') {
    nodes.push({ label: 'Priority', status: 'current', color: 'purple' })
  } else if (delib.accumulationEnabled && delib.challengeRound > 0) {
    nodes.push({ label: 'Priority', status: 'done' })
  }

  // Challenge node
  if (delib.challengeRound > 0 && phase === 'VOTING') {
    nodes.push({ label: `R${delib.challengeRound + 1}`, status: 'current', color: 'orange' })
  }

  return nodes
}

function buildJourneyEntries(
  delib: Deliberation,
  effectivePhase: string,
  cells: Cell[],
  winner: Idea | undefined,
  currentUserId?: string,
): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  // Submission
  const userIdea = delib.userSubmittedIdea
  entries.push({
    label: 'Submission Phase',
    description: `${delib.ideas.length} ideas submitted`,
    personalNote: userIdea ? `Your idea: "${userIdea.text.slice(0, 60)}${userIdea.text.length > 60 ? '...' : ''}"` : undefined,
    status: effectivePhase === 'SUBMISSION' ? 'current' : 'done',
    color: 'accent',
  })

  // Tier entries
  for (let t = 1; t <= delib.currentTier; t++) {
    const tierCells = cells.filter(c => c.tier === t)
    const isCurrentTier = t === delib.currentTier && effectivePhase === 'VOTING'
    const userCell = currentUserId
      ? tierCells.find(c => c.participants.some(p => p.userId === currentUserId))
      : undefined
    const wasInTier = !!userCell
    const voted = userCell?.votes.length ? userCell.votes.length > 0 : false
    const tierDone = t < delib.currentTier || (t === delib.currentTier && effectivePhase !== 'VOTING')

    // Determine status: if tier is past and user wasn't in it, mark as skipped
    let status: 'done' | 'current' | 'upcoming' | 'skipped'
    let personalNote: string | undefined
    if (isCurrentTier) {
      status = 'current'
      if (wasInTier && voted) personalNote = 'You voted — waiting for results'
      else if (wasInTier) personalNote = 'Your turn to vote'
      else personalNote = 'You can join this tier'
    } else if (tierDone && wasInTier) {
      status = 'done'
      personalNote = voted ? 'You voted in this tier' : 'You were assigned but didn\'t vote'
    } else if (tierDone && !wasInTier) {
      status = 'skipped'
      personalNote = 'You weren\'t in this tier'
    } else {
      status = 'upcoming'
    }

    entries.push({
      label: `Tier ${t} Voting`,
      description: tierCells.length > 0 ? `${tierCells.length} cell${tierCells.length > 1 ? 's' : ''}` : undefined,
      personalNote,
      status,
      color: delib.challengeRound > 0 && isCurrentTier ? 'orange' : 'warning',
    })
  }

  // Accumulating
  if (delib.accumulationEnabled && (effectivePhase === 'ACCUMULATING' || delib.challengeRound > 0)) {
    entries.push({
      label: 'Accepting New Ideas',
      description: winner ? `Priority: "${winner.text.slice(0, 40)}..."` : 'Waiting for priority',
      status: effectivePhase === 'ACCUMULATING' ? 'current' : 'done',
      color: 'purple',
      personalNote: effectivePhase === 'ACCUMULATING' ? 'Now accepting challenger ideas' : undefined,
    })
  }

  // Challenge
  if (delib.challengeRound > 0 && effectivePhase === 'VOTING') {
    entries.push({
      label: `Round ${delib.challengeRound + 1}`,
      description: 'Challenge vote in progress',
      status: 'current',
      color: 'orange',
    })
  }

  return entries
}

// ─── Phase Bodies ───

function JoinBody({ d, onSwitchTab }: { d: ReturnType<typeof useDeliberation>; onSwitchTab: (tab: string) => void }) {
  const delib = d.deliberation!
  const allIdeas = delib.ideas.filter(i => i.status === 'PENDING' || i.status === 'IN_VOTING' || i.status === 'ADVANCING' || i.status === 'WINNER')
  const phaseLabel = delib.phase === 'SUBMISSION' ? 'Accepting ideas'
    : delib.phase === 'VOTING' ? `Voting — Tier ${delib.currentTier}`
    : delib.phase === 'ACCUMULATING' ? 'Accepting new ideas'
    : delib.phase === 'COMPLETED' ? 'Completed' : delib.phase

  return (
    <div className="space-y-4">
      {/* Description */}
      {delib.description && (
        <p className="text-muted text-sm leading-relaxed">{delib.description}</p>
      )}

      {/* Phase + Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface rounded-lg p-3 text-center">
          <div className="text-2xl font-bold font-mono text-foreground">{delib._count.members}</div>
          <div className="text-xs text-muted">Members</div>
        </div>
        <div className="bg-surface rounded-lg p-3 text-center">
          <div className="text-2xl font-bold font-mono text-foreground">{allIdeas.length}</div>
          <div className="text-xs text-muted">Ideas</div>
        </div>
        <div className="bg-surface rounded-lg p-3 text-center">
          <div className="text-sm font-semibold text-accent">{phaseLabel}</div>
          <div className="text-xs text-muted">Status</div>
        </div>
      </div>

      {/* Ideas preview */}
      {allIdeas.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">Ideas ({allIdeas.length})</h3>
          <div className="space-y-2">
            {allIdeas.slice(0, 5).map(idea => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
            {allIdeas.length > 5 && (
              <p className="text-xs text-muted text-center py-1">+{allIdeas.length - 5} more ideas</p>
            )}
          </div>
        </div>
      )}

      {/* Join action */}
      {!d.session ? (
        <Link href="/auth/signin" className="block text-center bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-lg text-sm font-medium">
          Sign in to join
        </Link>
      ) : !delib.isMember ? (
        <button
          onClick={d.handleJoin}
          disabled={d.joining}
          className="w-full bg-success hover:bg-success-hover text-white px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {d.joining ? 'Joining...' : 'Join This Chant'}
        </button>
      ) : (
        <div className="bg-success-bg border border-success rounded-[10px] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-success font-medium text-sm">You&apos;re a member</span>
            </div>
            <button
              onClick={() => onSwitchTab(d.effectivePhase === 'SUBMISSION' ? 'submit' : 'vote')}
              className="text-success text-xs font-semibold hover:underline"
            >
              Go to {d.effectivePhase === 'SUBMISSION' ? 'Submit' : 'Vote'} →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SubmissionBody({ d }: { d: ReturnType<typeof useDeliberation> }) {
  const delib = d.deliberation!
  const pendingIdeas = delib.ideas.filter(i => i.status === 'PENDING' || i.status === 'IN_VOTING')

  return (
    <div className="space-y-4">
      {/* Big stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface rounded-lg p-3 text-center">
          <div className="text-2xl font-bold font-mono text-foreground">{delib._count.members}</div>
          <div className="text-xs text-muted">Joined</div>
        </div>
        <div className="bg-surface rounded-lg p-3 text-center">
          <div className="text-2xl font-bold font-mono text-foreground">{delib.ideas.length}</div>
          <div className="text-xs text-muted">Ideas</div>
        </div>
        <div className="bg-surface rounded-lg p-3 text-center">
          <div className="text-2xl font-bold font-mono text-accent">
            {delib.submissionEndsAt ? (
              <CountdownTimer deadline={delib.submissionEndsAt} onExpire={d.handleRefresh} compact />
            ) : (
              '---'
            )}
          </div>
          <div className="text-xs text-muted">Remaining</div>
        </div>
      </div>

      {/* Submit idea form */}
      {delib.isMember && (
        delib.userSubmittedIdea ? (
          <div className="bg-success-bg border border-success rounded-[10px] p-4">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-success font-medium text-sm">Your idea submitted</span>
            </div>
            <p className="text-foreground text-sm italic">"{delib.userSubmittedIdea.text}"</p>
          </div>
        ) : (
          <form onSubmit={d.handleSubmitIdea} className="bg-surface border border-border rounded-[10px] p-4">
            <label className="text-sm font-medium text-foreground mb-2 block">Submit your idea</label>
            <textarea
              placeholder="What's your answer to this question?"
              value={d.newIdea}
              onChange={(e) => d.setNewIdea(e.target.value)}
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted text-sm focus:outline-none focus:border-accent resize-none"
            />
            <button
              type="submit"
              disabled={d.submitting || !d.newIdea.trim()}
              className="mt-2 w-full bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {d.submitting ? 'Submitting...' : 'Submit Idea'}
            </button>
          </form>
        )
      )}

      {/* Ideas list */}
      {pendingIdeas.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">Ideas so far ({pendingIdeas.length})</h3>
          <div className="space-y-2">
            {pendingIdeas.map(idea => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                meta={idea.totalXP > 0 ? `${idea.totalXP} VP` : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function VotingBody({ d }: { d: ReturnType<typeof useDeliberation> }) {
  const delib = d.deliberation!
  const journeyEntries = buildJourneyEntries(delib, d.effectivePhase, d.cells, d.winner, d.session?.user?.id)

  // For continuous flow: add click actions to tier entries
  if (delib.continuousFlow && d.session) {
    for (const entry of journeyEntries) {
      if (!entry.label.startsWith('Tier')) continue
      if (entry.status === 'skipped') {
        entry.actionLabel = 'Join & Vote'
        entry.onAction = d.handleEnterVoting
      } else if (entry.status === 'current') {
        entry.actionLabel = 'Vote now'
        entry.onAction = () => document.getElementById('voting-area')?.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }

  // Use active cell (unvoted) OR most recently voted cell — so ideas stay visible after voting
  const activeCell = d.activeCells[0]
  // For continuous flow: look across all cells, not just current tier
  const votedCell = delib.continuousFlow
    ? d.cells.find(c => c.votes.length > 0 && c.status === 'VOTING')
    : d.currentTierCells.find(c => c.votes.length > 0 && c.status === 'VOTING')
  const displayCell = activeCell || votedCell

  // Continuous flow: show ALL active cells (one per tier) simultaneously
  // Regular mode: show single cell at current tier
  const activeCells = delib.continuousFlow ? d.activeCells : (displayCell ? [displayCell] : [])
  const hasNoCells = d.cellsLoaded && d.cells.length === 0

  return (
    <div className="space-y-4">
      {/* Continuous flow: Join + Submit UI when user has no cells */}
      {delib.continuousFlow && hasNoCells && d.session && (
        <>
          <div className="bg-warning-bg border border-warning rounded-[10px] p-4 text-center">
            <p className="text-warning text-sm font-medium mb-1">Voting is live across {delib.currentTier} tier{delib.currentTier > 1 ? 's' : ''}</p>
            <p className="text-muted text-xs mb-3">Join to get assigned to cells at each tier</p>
            <button
              onClick={d.handleEnterVoting}
              disabled={d.enteringVoting}
              className="bg-warning hover:bg-warning-hover text-black px-6 py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {d.enteringVoting ? 'Joining...' : 'Join & Vote'}
            </button>
          </div>
          {!delib.userSubmittedIdea && (
            <form onSubmit={d.handleSubmitIdea} className="bg-surface border border-border rounded-[10px] p-4">
              <label className="text-sm font-medium text-foreground mb-2 block">Or submit your own idea first</label>
              <textarea
                placeholder="What's your answer to this question?"
                value={d.newIdea}
                onChange={(e) => d.setNewIdea(e.target.value)}
                rows={3}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted text-sm focus:outline-none focus:border-accent resize-none"
              />
              <button
                type="submit"
                disabled={d.submitting || !d.newIdea.trim()}
                className="mt-2 w-full bg-accent hover:bg-accent-hover text-white px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {d.submitting ? 'Submitting...' : 'Submit Idea'}
              </button>
            </form>
          )}
        </>
      )}

      {/* Multi-cell voting stack */}
      <div id="voting-area" />
      {activeCells.length > 0 ? (
        activeCells.map(cell => (
          <div key={cell.id} className="space-y-3">
            {/* Tier label for continuous flow */}
            {delib.continuousFlow && activeCells.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-warning bg-warning-bg px-2 py-0.5 rounded">
                  Tier {cell.tier}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            <CellMembersBar
              participants={cell.participants}
              votes={cell.votes}
              currentUserId={d.session?.user?.id}
            />
            <VotingCell cell={cell} onVote={d.handleVote} voting={d.voting} onRefresh={d.handleRefresh} currentTier={cell.tier} />
          </div>
        ))
      ) : !delib.continuousFlow && d.cellsLoaded && !d.isInCurrentTier && d.session ? (
        <div className="bg-warning-bg border border-warning rounded-[10px] p-4 text-center">
          <p className="text-muted text-sm mb-3">Voting in progress at Tier {delib.currentTier}</p>
          <button
            onClick={d.handleEnterVoting}
            disabled={d.enteringVoting}
            className="bg-warning hover:bg-warning-hover text-black px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {d.enteringVoting ? 'Joining...' : 'Join & Vote'}
          </button>
          <p className="text-xs text-muted mt-2">You'll be assigned to an available cell</p>
        </div>
      ) : null}

      {/* Journey timeline */}
      {journeyEntries.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Your Journey</h3>
          <JourneyTimeline entries={journeyEntries} />
        </div>
      )}
    </div>
  )
}

function AccumulatingBody({ d }: { d: ReturnType<typeof useDeliberation> }) {
  const delib = d.deliberation!
  const challengers = delib.ideas.filter(i => i.status === 'PENDING' && i.isNew)
  const journeyEntries = buildJourneyEntries(delib, d.effectivePhase, d.cells, d.winner, d.session?.user?.id)

  return (
    <div className="space-y-4">
      {/* Winner card */}
      {d.winner && (
        <WinnerCard
          winner={d.winner}
          voteStats={`${d.winner.totalXP} VP`}
        />
      )}

      {/* Challenger form */}
      {delib.isMember && (
        delib.userSubmittedChallenger ? (
          <div className="bg-purple-bg border border-purple rounded-[10px] p-4">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-purple font-medium text-sm">Your challenger submitted</span>
            </div>
            <p className="text-foreground text-sm italic">"{delib.userSubmittedChallenger.text}"</p>
          </div>
        ) : (
          <form onSubmit={d.handleSubmitIdea} className="bg-purple-bg border border-purple rounded-[10px] p-4">
            <label className="text-sm font-medium text-purple mb-2 block">Submit a Challenger</label>
            <textarea
              placeholder="Got a better idea? Challenge the current priority..."
              value={d.newIdea}
              onChange={(e) => d.setNewIdea(e.target.value)}
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted text-sm focus:outline-none focus:border-purple resize-none"
            />
            <button
              type="submit"
              disabled={d.submitting || !d.newIdea.trim()}
              className="mt-2 w-full bg-purple hover:bg-purple-hover text-white px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {d.submitting ? 'Submitting...' : 'Submit Challenger'}
            </button>
          </form>
        )
      )}

      {/* Challengers list */}
      <div>
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-foreground">Challengers waiting ({challengers.length})</h3>
        </div>
        {challengers.length > 0 ? (
          <div className="space-y-2">
            {challengers.map(idea => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>
        ) : (
          <p className="text-muted text-sm">No challengers yet — be the first!</p>
        )}
      </div>

      {/* Accumulation countdown */}
      {delib.accumulationEndsAt && (
        <div className="bg-purple-bg border border-purple rounded-lg p-3 flex justify-between items-center">
          <span className="text-purple text-sm font-medium">Accepting ideas until:</span>
          <CountdownTimer deadline={delib.accumulationEndsAt} onExpire={d.handleRefresh} compact />
        </div>
      )}

      {/* Journey timeline */}
      {journeyEntries.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Your Journey</h3>
          <JourneyTimeline entries={journeyEntries} />
        </div>
      )}

      {/* Creator: start challenge */}
      {d.isCreator && challengers.length > 0 && (
        <button
          onClick={d.handleStartChallenge}
          disabled={d.startingChallenge}
          className="w-full bg-orange hover:bg-orange-hover text-white px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {d.startingChallenge ? 'Starting...' : 'Start Round 2'}
        </button>
      )}
    </div>
  )
}

function ChallengeBody({ d }: { d: ReturnType<typeof useDeliberation> }) {
  const delib = d.deliberation!

  // Same displayCell pattern: keep cell visible after voting
  const activeCell = d.activeCells[0]
  const votedCurrentTierCell = d.currentTierCells.find(c => c.votes.length > 0 && c.status === 'VOTING')
  const displayCell = activeCell || votedCurrentTierCell

  // Final showdown: defender is in the cell and ≤5 total ideas in voting
  const ideasInVoting = delib.ideas.filter(i => i.status === 'IN_VOTING' || i.status === 'DEFENDING')
  const isFinalShowdown = ideasInVoting.length <= 5

  return (
    <div className="space-y-4">
      {/* Defender card — display only (Vote Point allocation happens in VotingCell) */}
      {d.defender && (
        <DefenderCard
          defender={d.defender}
          isFinalShowdown={isFinalShowdown}
        />
      )}

      {/* Voting cell — Vote Point allocation UI */}
      {displayCell ? (
        <VotingCell cell={displayCell} onVote={d.handleVote} voting={d.voting} onRefresh={d.handleRefresh} currentTier={delib.currentTier} />
      ) : null}

      {/* If no cell, show join prompt */}
      {!displayCell && d.cellsLoaded && !d.isInCurrentTier && d.session && (
        <div className="bg-orange-bg border border-orange rounded-[10px] p-4 text-center">
          <p className="text-muted text-sm mb-3">Challenge round in progress</p>
          <button
            onClick={d.handleEnterVoting}
            disabled={d.enteringVoting}
            className="bg-orange hover:bg-orange-hover text-white px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {d.enteringVoting ? 'Joining...' : 'Join Challenge'}
          </button>
        </div>
      )}

    </div>
  )
}

// ─── Phase Router ───

function PhaseBody({ d }: { d: ReturnType<typeof useDeliberation> }) {
  const phase = d.effectivePhase
  const isChallenge = d.deliberation!.challengeRound > 0 && phase === 'VOTING'

  if (phase === 'SUBMISSION') return <SubmissionBody d={d} />
  if (isChallenge) return <ChallengeBody d={d} />
  if (phase === 'VOTING') return <VotingBody d={d} />
  if (phase === 'ACCUMULATING') return <AccumulatingBody d={d} />

  // COMPLETED fallback
  const delib = d.deliberation!
  const rankedIdeas = [...delib.ideas]
    .sort((a, b) => (b.totalXP || 0) - (a.totalXP || 0))
    .filter(i => i.id !== d.winner?.id)

  return (
    <div className="space-y-4">
      {d.winner && (
        <WinnerCard winner={d.winner} voteStats={`${d.winner.totalXP} VP · Final`} />
      )}

      {/* Ranked ideas */}
      {rankedIdeas.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">All Ideas ({rankedIdeas.length + 1})</h3>
          <div className="space-y-1.5">
            {rankedIdeas.map((idea, i) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                rank={i + 2}
                meta={idea.totalXP > 0 ? `${idea.totalXP} XP` : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Discussion / Comments */}
      <CommentsPanel deliberationId={delib.id} />
    </div>
  )
}

// ─── Main Page ───

export default function DeliberationPageClient() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const d = useDeliberation(id)

  // Tab state — Join tab lets users browse before joining
  const [activeTab, setActiveTab] = useState('join')
  const tabInitialized = useRef(false)

  // Set initial tab when deliberation loads
  useEffect(() => {
    if (!d.deliberation || tabInitialized.current) return
    tabInitialized.current = true
    if (d.session && d.deliberation.isMember) {
      setActiveTab(d.effectivePhase === 'SUBMISSION' ? 'submit' : 'vote')
    }
  }, [d.deliberation, d.session, d.effectivePhase])

  // Auto-switch from join tab when user becomes a member
  useEffect(() => {
    if (!d.deliberation?.isMember) return
    setActiveTab(prev => prev === 'join' ? (d.effectivePhase === 'SUBMISSION' ? 'submit' : 'vote') : prev)
  }, [d.deliberation?.isMember, d.effectivePhase])

  // Linked podium posts
  const [linkedPodiums, setLinkedPodiums] = useState<Array<{
    id: string; title: string; views: number; createdAt: string
    author: { id: string; name: string | null }
  }>>([])

  useEffect(() => {
    if (!id) return
    fetch(`/api/podiums?deliberationId=${id}&limit=5`)
      .then(res => res.ok ? res.json() : { items: [] })
      .then(data => setLinkedPodiums(data.items || []))
      .catch(() => {})
  }, [id])

  if (d.loading) {
    return (
      <div className="min-h-screen bg-background">
        <FullPageSpinner />
      </div>
    )
  }

  if (!d.deliberation) return null

  const delib = d.deliberation
  const progressNodes = buildProgressNodes(delib, d.effectivePhase)
  const isChallenge = delib.challengeRound > 0 && d.effectivePhase === 'VOTING'
  const activeCell = d.activeCells[0]
  const votedCurrentTierCell = d.currentTierCells.find(c => c.votes.length > 0 && c.status === 'VOTING')
  const displayCell = activeCell || votedCurrentTierCell

  // Phase badge color
  const badgeColor = {
    SUBMISSION: 'text-accent bg-accent-light',
    VOTING: isChallenge ? 'text-orange bg-orange-bg' : 'text-warning bg-warning-bg',
    ACCUMULATING: 'text-purple bg-purple-bg',
    COMPLETED: 'text-success bg-success-bg',
  }[d.effectivePhase] || 'text-muted bg-surface'

  const badgeLabel = isChallenge
    ? `Round ${delib.challengeRound + 1}`
    : d.effectivePhase === 'ACCUMULATING'
      ? 'Accepting Ideas'
      : d.effectivePhase

  return (
    <div className="min-h-screen bg-background flex flex-col">

      <div className={`max-w-2xl mx-auto px-4 py-4 flex-1 flex flex-col w-full `}>
        <FirstVisitTooltip id="chant-detail">
          Ideas compete in small groups of 5. Winners advance to the next tier until a priority emerges.
        </FirstVisitTooltip>
        {/* Top bar: Back + Manage + Share */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => {
              if (window.history.length > 1) {
                router.back()
              } else {
                router.push('/chants')
              }
            }}
            className="text-muted hover:text-foreground text-sm"
          >
            ← Back
          </button>
          <div className="flex items-center gap-2">
            {d.session && d.session.user?.id === delib.creatorId ? (
              <span className="text-xs text-muted px-3 py-1.5">(You are the creator)</span>
            ) : d.session && (
              <FollowButton
                userId={delib.creatorId}
                initialFollowing={delib.followedUserIds?.includes(delib.creatorId) ?? false}
                followLabel="Follow Creator"
                followingLabel="Creator Followed"
              />
            )}
            {d.isCreator && (
              <Link
                href={`/dashboard/${id}`}
                className="border border-border hover:border-accent text-foreground px-3 py-1.5 rounded text-sm flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Manage
              </Link>
            )}
            <Link
              href={`/chants/${delib.id}/details`}
              className="border border-border hover:border-accent text-foreground px-3 py-1.5 rounded text-sm flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Full Details
            </Link>
            <ShareMenu url={`/chants/${delib.id}`} text={delib.question} />
          </div>
        </div>

        {/* Progress Trail */}
        <div className="mb-1">
          <ProgressTrail nodes={progressNodes} />
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-3 border-b border-border">
          <button
            onClick={() => setActiveTab('join')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'join'
                ? 'border-success text-success'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            {delib.isMember ? 'Overview' : 'Join'}
          </button>
          <button
            onClick={() => setActiveTab('submit')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'submit'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            Submit
          </button>
          {d.effectivePhase !== 'SUBMISSION' && (
            <button
              onClick={() => setActiveTab('vote')}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'vote'
                  ? (d.effectivePhase === 'ACCUMULATING' ? 'border-purple text-purple' :
                     d.effectivePhase === 'COMPLETED' ? 'border-success text-success' :
                     'border-warning text-warning')
                  : 'border-transparent text-muted hover:text-foreground'
              }`}
            >
              {d.effectivePhase === 'ACCUMULATING' ? 'Priority' :
               d.effectivePhase === 'COMPLETED' ? 'Results' :
               'Vote'}
            </button>
          )}
        </div>

        {/* Badge + Timer row */}
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeColor}`}>
            {badgeLabel}
          </span>
          <div className="flex items-center gap-2">
            {delib.phase === 'SUBMISSION' && delib.submissionEndsAt && (
              <CountdownTimer deadline={delib.submissionEndsAt} onExpire={d.handleRefresh} compact />
            )}
            {delib.accumulationEndsAt && d.effectivePhase === 'ACCUMULATING' && (
              <CountdownTimer deadline={delib.accumulationEndsAt} onExpire={d.handleRefresh} compact />
            )}
            {activeCell?.votingDeadline && (d.effectivePhase === 'VOTING' || isChallenge) && (
              <CountdownTimer deadline={activeCell.votingDeadline} onExpire={d.handleRefresh} compact />
            )}
            <span className={`text-xs font-semibold px-2 py-1 rounded ${delib.isPublic ? 'text-success bg-success-bg' : 'text-error bg-error-bg'}`}>
              {delib.isPublic ? 'Public' : 'Private'}
            </span>
          </div>
        </div>

        {/* Question */}
        <div className="flex items-start gap-2 mb-2">
          <h1 className="text-xl font-bold text-foreground leading-tight">{delib.question}</h1>
          <FlaggedBadge text={delib.question} />
        </div>

        {/* Collective Chat origin */}
        {delib.fromCollective && (
          <CollectiveChatLink createdAt={delib.createdAt} />
        )}

        {/* Stats row */}
        <div className="flex items-center gap-2 text-sm text-muted flex-wrap mb-4">
          {delib.organization && (
            <>
              <span className="text-foreground font-medium">{delib.organization}</span>
              <span>|</span>
            </>
          )}
          <StatsRow items={[
            { label: 'T', value: delib.currentTier, color: 'text-accent' },
            { label: 'Ideas', value: delib.ideas.length },
            { label: 'Members', value: delib._count.members },
          ]} />
        </div>

        {/* Discord claim banner (guild owner only) */}
        <DiscordClaimBanner deliberationId={delib.id} />

        {/* Linked Podium - inline link */}
        {linkedPodiums.length > 0 && (
          <Link
            href={`/podium/${linkedPodiums[0].id}`}
            className="flex items-center gap-2 text-sm text-accent hover:underline mb-4"
          >
            <span className="text-xs bg-accent-light text-accent px-1.5 py-0.5 rounded font-medium">Podium</span>
            {linkedPodiums[0].title}
          </Link>
        )}

        {/* Tab body */}
        {activeTab === 'join' ? (
          <JoinBody d={d} onSwitchTab={setActiveTab} />
        ) : activeTab === 'submit' ? (
          <SubmissionBody d={d} />
        ) : (
          <PhaseBody d={d} />
        )}

        {/* Additional Linked Podium Posts (if more than 1) */}
        {linkedPodiums.length > 1 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">Related Posts</h3>
            <div className="space-y-2">
              {linkedPodiums.slice(1).map(p => (
                <Link
                  key={p.id}
                  href={`/podium/${p.id}`}
                  className="block bg-surface border border-border rounded-[10px] p-3 hover:border-accent transition-colors"
                >
                  <h4 className="text-foreground font-medium text-sm">{p.title}</h4>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                    <span>by {p.author.name || 'Anonymous'}</span>
                    <span>{p.views} views</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>

    </div>
  )
}
