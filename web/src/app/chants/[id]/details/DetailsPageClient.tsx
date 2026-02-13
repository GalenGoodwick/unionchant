'use client'

import { useParams } from 'next/navigation'
import { FullPageSpinner } from '@/components/Spinner'
import { getDisplayName } from '@/lib/user'
import { useDeliberation } from '@/hooks/useDeliberation'
import FrameLayout from '@/components/FrameLayout'

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
import LazySection from '@/components/deliberation/LazySection'

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function DetailsPageClient() {
  const params = useParams()
  const id = params.id as string
  const d = useDeliberation(id)

  if (d.loading) {
    return (
      <FrameLayout active="chants">
        <FullPageSpinner />
      </FrameLayout>
    )
  }

  if (!d.deliberation) return null

  const delib = d.deliberation

  // Phase banner config
  const phaseBanner: Record<string, { icon: string; bg: string; border: string; text: string; label: string }> = {
    SUBMISSION: {
      icon: '💡',
      bg: 'bg-accent-light',
      border: 'border-accent',
      text: 'text-accent',
      label: `Collecting ideas — ${delib.ideas.length} submitted so far`,
    },
    VOTING: {
      icon: '🗳️',
      bg: 'bg-warning-bg',
      border: 'border-warning',
      text: 'text-warning',
      label: delib.continuousFlow
        ? delib.currentTier === 1
          ? `Tier 1 — accepting ideas + voting`
          : `Tier ${delib.currentTier} voting — ideas pool for next round`
        : `Tier ${delib.currentTier} voting in progress`,
    },
    COMPLETED: {
      icon: '🏆',
      bg: 'bg-success-bg',
      border: 'border-success',
      text: 'text-success',
      label: 'Consensus reached',
    },
  }
  const banner = phaseBanner[d.effectivePhase] || phaseBanner.SUBMISSION

  return (
    <FrameLayout active="chants">
      <div className="py-3">
        {/* Top bar */}
        <div className="flex items-center justify-end mb-3">
          <div className="flex items-center gap-2">
            {d.session && d.session.user?.id !== delib.creatorId && (
              <FollowButton userId={delib.creatorId} initialFollowing={delib.followedUserIds?.includes(delib.creatorId) ?? false} followLabel="Follow Creator" followingLabel="Creator Followed" />
            )}
            {d.session && d.session.user?.id === delib.creatorId && (
              <span className="text-xs text-muted px-3 py-1.5">(You are the creator)</span>
            )}
            <ShareMenu url={`/chants/${delib.id}`} text={delib.question} />
          </div>
        </div>

        {/* Question + meta */}
        <div className="mb-4">
          <h1 className="text-sm font-bold text-foreground leading-tight mb-1.5">{delib.question}</h1>
          <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
            <span>by {delib.creator?.name || 'Anonymous'}</span>
            <span>&middot;</span>
            <span>{timeAgo(delib.createdAt)}</span>
            {delib.organization && (
              <>
                <span>&middot;</span>
                <span>{delib.organization}</span>
              </>
            )}
          </div>
        </div>

        {/* Description */}
        {delib.description && (
          <div className="bg-surface/90 backdrop-blur-sm border border-border rounded-lg p-3 mb-4">
            <p className="text-xs text-foreground">{delib.description}</p>
          </div>
        )}

        {/* Phase banner */}
        <div className={`${banner.bg} border ${banner.border} rounded-lg p-3 mb-4 flex items-center gap-3`}>
          <span className="text-xl">{banner.icon}</span>
          <div>
            <div className={`text-sm font-semibold ${banner.text}`}>{banner.label}</div>
            <StatsRow items={[
              { label: 'Tier', value: delib.currentTier, color: 'text-accent' },
              { label: 'Ideas', value: delib.ideas.length },
              { label: 'Members', value: delib._count.members },
            ]} />
          </div>
        </div>

        {/* Champion / Priority */}
        {d.winner && (
          <div className="rounded-lg p-4 mb-4 border bg-success-bg border-success">
            <div className="text-xs font-semibold uppercase tracking-wide mb-1 text-success">
              Priority
            </div>
            <p className="text-foreground font-medium">{d.winner.text}</p>
            <p className="text-xs text-muted mt-1">
              {d.winner.totalXP} XP &middot; by {getDisplayName(d.winner.author)}
            </p>
          </div>
        )}

        {/* Tier Funnel at top */}
        <div className="mb-4">
          <TierFunnelCompact
            currentTier={delib.currentTier}
            totalIdeas={delib.ideas.length}
            phase={delib.phase}
            ideas={delib.ideas}
          />
        </div>

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
                <VotingCell key={cell.id} cell={cell} onVote={d.handleVote} voting={d.voting} onRefresh={d.handleRefresh} currentTier={delib.currentTier} />
              ))}
            </div>
          </Section>
        )}

        {/* History */}
        <HistoryPanel deliberationId={id} key={`history-${delib.phase}-${delib.challengeRound}`} />

        {/* Discussion / Comments */}
        <CommentsPanel deliberationId={id} key={`comments-${delib.phase}-${delib.challengeRound}`} />

        {/* Ideas Breakdown */}
        {delib.ideas.length > 0 && (delib.phase === 'VOTING' || delib.phase === 'COMPLETED') && (
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
                        {idea.totalXP > 0 && (
                          <p className="text-xs text-muted font-mono">{idea.totalXP} XP</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* Audit: Cell Details per Tier (lazy-loaded) */}
        {delib.currentTier >= 1 && (delib.phase === 'VOTING' || delib.phase === 'COMPLETED') && (
          <>
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 mt-6">
              Audit — Cell Details by Tier
            </div>
            {Array.from({ length: delib.currentTier }, (_, i) => i + 1).map(tier => (
              <LazySection
                key={`tier-${tier}`}
                title={`Tier ${tier} Cells`}
                badge={<span className="text-xs text-muted font-mono">Tier {tier}</span>}
                fetchData={async () => {
                  const res = await fetch(`/api/deliberations/${id}/tiers/${tier}`)
                  if (!res.ok) throw new Error('Failed to load')
                  return res.json()
                }}
                renderContent={(data) => <TierAuditContent data={data as TierData} />}
              />
            ))}
          </>
        )}

        {/* Audit: Members (lazy-loaded) */}
        <LazySection
          title="Members"
          badge={<span className="text-xs text-muted font-mono">{delib._count.members}</span>}
          fetchData={async () => {
            const res = await fetch(`/api/deliberations/${id}/members`)
            if (!res.ok) throw new Error('Failed to load')
            return res.json()
          }}
          renderContent={(data) => <MembersContent data={data as MemberData[]} />}
        />
      </div>
    </FrameLayout>
  )
}

// ── Tier Audit Content ──

interface TierCellIdea {
  id: string
  text: string
  status: string
  author?: { name: string }
  voteCount: number
}

interface TierCell {
  id: string
  status: string
  participantCount: number
  votedCount: number
  ideas: TierCellIdea[]
  winner?: { text: string; author: string }
}

interface TierData {
  tier: number
  isBatch: boolean
  stats: {
    totalCells: number
    completedCells: number
    totalParticipants: number
    totalVotesCast: number
    votingProgress: number
  }
  cells: TierCell[]
  liveTally?: { ideaId: string; text: string; voteCount: number }[]
}

function TierAuditContent({ data }: { data: TierData }) {
  return (
    <div>
      {/* Stats summary */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center">
          <div className="text-lg font-bold font-mono text-foreground">{data.stats.totalCells}</div>
          <div className="text-[10px] text-muted">Cells</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold font-mono text-foreground">{data.stats.totalParticipants}</div>
          <div className="text-[10px] text-muted">Voters</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold font-mono text-foreground">{data.stats.totalVotesCast}</div>
          <div className="text-[10px] text-muted">Voted</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold font-mono text-accent">{data.stats.votingProgress}%</div>
          <div className="text-[10px] text-muted">Complete</div>
        </div>
      </div>

      {/* Cross-cell tally for batches */}
      {data.liveTally && data.liveTally.length > 0 && (
        <div className="bg-surface rounded-lg border border-border p-3 mb-3">
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Cross-Cell Tally</div>
          {data.liveTally.map((item, i) => (
            <div key={item.ideaId} className="flex justify-between items-center text-sm py-0.5">
              <span className={`truncate flex-1 ${i === 0 ? 'text-success font-medium' : 'text-foreground'}`}>
                {item.text}
              </span>
              <span className="font-mono text-muted ml-2">{item.voteCount}</span>
            </div>
          ))}
        </div>
      )}

      {/* Individual cells */}
      <div className="space-y-2">
        {data.cells.map((cell, i) => (
          <div key={cell.id} className="bg-surface rounded border border-border p-2.5">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-medium text-foreground">Cell {i + 1}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted font-mono">{cell.votedCount}/{cell.participantCount} voted</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  cell.status === 'COMPLETED' ? 'bg-success-bg text-success' :
                  cell.status === 'VOTING' ? 'bg-warning-bg text-warning' :
                  'bg-surface text-muted'
                }`}>
                  {cell.status}
                </span>
              </div>
            </div>
            {cell.ideas.map(idea => (
              <div key={idea.id} className={`flex justify-between text-xs py-0.5 ${
                cell.winner && cell.winner.text === idea.text ? 'text-success font-medium' : 'text-muted'
              }`}>
                <span className="truncate flex-1">{idea.text}</span>
                <span className="font-mono ml-2">{idea.voteCount} XP</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Members Content ──

interface MemberData {
  id: string
  name: string | null
  image: string | null
  role: string
  joinedAt: string
}

function MembersContent({ data }: { data: MemberData[] }) {
  if (data.length === 0) {
    return <p className="text-muted text-sm">No members yet</p>
  }
  return (
    <div className="space-y-1">
      {data.map(member => (
        <div key={member.id} className="flex items-center gap-2 py-1">
          {member.image ? (
            <img src={member.image} alt="" className="w-6 h-6 rounded-full" />
          ) : (
            <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-medium flex items-center justify-center">
              {(member.name || 'A')[0].toUpperCase()}
            </span>
          )}
          <span className="text-sm text-foreground flex-1">{member.name || 'Anonymous'}</span>
          {member.role !== 'MEMBER' && (
            <span className="text-[10px] text-muted uppercase">{member.role}</span>
          )}
          <span className="text-xs text-muted">{timeAgo(member.joinedAt)}</span>
        </div>
      ))}
    </div>
  )
}
