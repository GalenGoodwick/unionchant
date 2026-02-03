'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { FullPageSpinner } from '@/components/Spinner'
import { getDisplayName } from '@/lib/user'
import { useDeliberation } from '@/hooks/useDeliberation'

import FollowButton from '@/components/FollowButton'
import ShareMenu from '@/components/ShareMenu'
import TierFunnelCompact from '@/components/deliberation/TierFunnelCompact'
import StatsRow from '@/components/deliberation/StatsRow'
import TierFunnel from '@/components/deliberation/TierFunnel'
import TierProgressPanel from '@/components/deliberation/TierProgressPanel'
import VotingCell from '@/components/deliberation/VotingCell'
import HistoryPanel from '@/components/deliberation/HistoryPanel'
import CommentsPanel from '@/components/deliberation/CommentsPanel'
import Section from '@/components/deliberation/Section'

export default function DetailsPageClient() {
  const params = useParams()
  const id = params.id as string
  const d = useDeliberation(id)

  if (d.loading) {
    return (
      <div className="min-h-screen bg-background">
        <FullPageSpinner />
      </div>
    )
  }

  if (!d.deliberation) return null

  const delib = d.deliberation

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-3">
          <Link href={`/talks/${id}`} className="text-muted hover:text-foreground text-sm">
            ← Back to deliberation
          </Link>
          <div className="flex items-center gap-2">
            {d.session && d.session.user?.id !== delib.creatorId && (
              <FollowButton userId={delib.creatorId} initialFollowing={delib.followedUserIds?.includes(delib.creatorId) ?? false} followLabel="Follow Creator" followingLabel="Creator Followed" />
            )}
            {d.session && d.session.user?.id === delib.creatorId && (
              <span className="text-xs text-muted px-3 py-1.5">(You are the creator)</span>
            )}
            <ShareMenu url={`/talks/${delib.id}`} text={delib.question} />
          </div>
        </div>

        {/* Compact header */}
        <div className="mb-4">
          <div className="flex justify-between items-start gap-2 mb-1">
            <h1 className="text-lg font-bold text-foreground leading-tight">{delib.question}</h1>
            <span className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${d.phaseColor} bg-surface`}>
              {d.effectivePhase}
            </span>
          </div>
          <StatsRow items={[
            { label: 'Tier', value: delib.currentTier, color: 'text-accent' },
            { label: 'Ideas', value: delib.ideas.length },
            { label: 'Members', value: delib._count.members },
          ]} />
        </div>

        {/* Tier Funnel at top */}
        <div className="mb-4">
          <TierFunnelCompact
            currentTier={delib.currentTier}
            totalIdeas={delib.ideas.length}
            phase={delib.phase}
            ideas={delib.ideas}
          />
        </div>

        {/* Description */}
        {delib.description && (
          <div className="bg-surface rounded-lg border border-border p-4 mb-4">
            <p className="text-sm text-foreground">{delib.description}</p>
          </div>
        )}

        {/* Full Tier Funnel */}
        {(delib.phase === 'VOTING' || delib.phase === 'COMPLETED') && (
          <TierFunnel
            currentTier={delib.currentTier}
            totalIdeas={delib.ideas.length}
            phase={delib.phase}
            ideas={delib.ideas}
          />
        )}

        {/* Tier Progress Panel */}
        {delib.phase === 'VOTING' && (
          <TierProgressPanel
            deliberationId={id}
            currentTier={delib.currentTier}
            onRefresh={d.handleRefresh}
          />
        )}

        {/* Your Cells (voted/completed) */}
        {d.votedCells.length > 0 && (
          <Section title="Your Cells" defaultOpen={d.activeCells.length === 0}>
            <div className="space-y-3">
              {d.votedCells.map(cell => (
                <VotingCell key={cell.id} cell={cell} onVote={d.handleVote} voting={d.voting} onRefresh={d.handleRefresh} />
              ))}
            </div>
          </Section>
        )}

        {/* History */}
        <HistoryPanel deliberationId={id} key={`history-${delib.phase}-${delib.challengeRound}`} />

        {/* Discussion / Comments */}
        <CommentsPanel deliberationId={id} key={`comments-${delib.phase}-${delib.challengeRound}`} />

        {/* Ideas Breakdown */}
        {delib.ideas.length > 0 && (delib.phase === 'VOTING' || delib.phase === 'COMPLETED' || delib.phase === 'ACCUMULATING') && (
          <Section
            title="Ideas Breakdown"
            badge={<span className="text-xs text-muted font-mono">{delib.ideas.length} total</span>}
            defaultOpen={false}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-xs text-muted uppercase tracking-wide mb-2">By Status</div>
                {['PENDING', 'IN_VOTING', 'ADVANCING', 'WINNER', 'ELIMINATED', 'DEFENDING', 'BENCHED', 'RETIRED'].map(status => {
                  const count = delib.ideas.filter(i => i.status === status).length
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
              <div className="space-y-1">
                <div className="text-xs text-muted uppercase tracking-wide mb-2">By Tier Reached</div>
                {(() => {
                  const maxTier = Math.max(...delib.ideas.map(i => i.tier), 0)
                  return Array.from({ length: maxTier + 1 }, (_, tier) => {
                    const count = delib.ideas.filter(i => i.tier === tier).length
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
          badge={<span className="text-xs text-muted font-mono">{delib.ideas.length}</span>}
          defaultOpen={delib.phase === 'SUBMISSION'}
        >
          {delib.ideas.length === 0 ? (
            <p className="text-muted text-sm">No ideas yet</p>
          ) : (
            <div className="space-y-1.5">
              {delib.ideas.map(idea => {
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
