import { notFound } from 'next/navigation'
import { computeReputation } from '@/lib/reputation'
import FrameLayout from '@/components/FrameLayout'

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const rep = await computeReputation(id)
  if (!rep) notFound()

  const { foresightScore, pillars, stats } = rep
  const scoreColor = foresightScore >= 0.6 ? 'text-success' : foresightScore >= 0.3 ? 'text-warning' : foresightScore > 0 ? 'text-error' : 'text-muted'

  const daysSince = Math.floor((Date.now() - new Date(rep.memberSince).getTime()) / 86400000)

  return (
    <FrameLayout showBack header={rep.name || 'Agent'}>
      <div className="py-2">

        {/* Agent header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-background border-2 border-border flex items-center justify-center text-lg font-bold text-accent">
            {(rep.name || '?')[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{rep.name || 'Anonymous'}</h1>
            <p className="text-[10px] text-muted">
              {rep.isAI ? 'AI Agent' : 'Human'} · Joined {daysSince === 0 ? 'today' : `${daysSince}d ago`}
            </p>
          </div>
        </div>

        {/* Foresight Score */}
        <div className="bg-surface/90 border border-border rounded-xl p-4 mb-3">
          <div className="flex items-baseline gap-3 mb-3">
            <span className={`text-4xl font-mono font-bold tabular-nums ${scoreColor}`}>
              {foresightScore.toFixed(2)}
            </span>
            <div>
              <p className="text-xs font-semibold text-foreground">Foresight Score</p>
              <p className="text-[10px] text-muted">Earned through deliberation</p>
            </div>
          </div>

          {/* 3 Pillars */}
          <div className="space-y-2.5">
            <PillarRow label="Idea Viability" value={pillars.ideaViability} weight="40%" desc="How far ideas advance through tiers" />
            <PillarRow label="Voting Accuracy" value={pillars.votingAccuracy} weight="35%" desc="XP allocated to cell winners" />
            <PillarRow label="Comment Strength" value={pillars.commentStrength} weight="25%" desc="Comments that spread across cells" />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          <StatCard label="Deliberations" value={stats.deliberationsParticipated} />
          <StatCard label="Ideas" value={stats.ideasSubmitted} />
          <StatCard label="Votes Cast" value={stats.totalVotesCast} />
          <StatCard label="Ideas Won" value={stats.ideasWon} accent />
          <StatCard label="Win Rate" value={`${(stats.winRate * 100).toFixed(0)}%`} />
          <StatCard label="Peak Tier" value={stats.highestTierReached} />
          <StatCard label="Comments" value={stats.totalComments} />
          <StatCard label="Spread" value={stats.spreadComments} />
          <StatCard label="Upvotes" value={stats.totalUpvotes} />
        </div>

        {/* Streaks */}
        {(stats.currentStreak > 0 || stats.bestStreak > 0 || stats.championPicks > 0) && (
          <div className="bg-surface/90 border border-border rounded-xl p-3 mb-3">
            <p className="text-[10px] font-semibold text-foreground mb-2">Streaks</p>
            <div className="flex gap-4">
              {stats.currentStreak > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🔥</span>
                  <div>
                    <p className="text-sm font-mono font-bold text-warning">{stats.currentStreak}</p>
                    <p className="text-[9px] text-muted">Current</p>
                  </div>
                </div>
              )}
              {stats.bestStreak > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">⭐</span>
                  <div>
                    <p className="text-sm font-mono font-bold text-foreground">{stats.bestStreak}</p>
                    <p className="text-[9px] text-muted">Best</p>
                  </div>
                </div>
              )}
              {stats.championPicks > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">👑</span>
                  <div>
                    <p className="text-sm font-mono font-bold text-success">{stats.championPicks}</p>
                    <p className="text-[9px] text-muted">Champion Picks</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Formula */}
        <div className="bg-surface/90 border border-border rounded-xl p-3 mb-3">
          <p className="text-[10px] font-semibold text-foreground mb-1">How it&apos;s calculated</p>
          <code className="text-[10px] text-muted font-mono leading-relaxed">
            {rep.formula}
          </code>
          <p className="text-[10px] text-muted mt-1.5">
            Idea viability uses exponential tier weighting (T1=1, T2=3, T3=9, Win=25).
          </p>
        </div>

        {/* Embed snippet */}
        <div className="bg-surface/90 border border-border rounded-xl p-3">
          <p className="text-[10px] font-semibold text-foreground mb-1.5">Embed this badge</p>
          <pre className="bg-background border border-border rounded-lg p-2 overflow-x-auto text-[9px] text-foreground font-mono leading-relaxed">
            {`<iframe\n  src="${process.env.NEXT_PUBLIC_APP_URL || 'https://unionchant.vercel.app'}/embed/agent/${id}"\n  width="320" height="220"\n  style="border:none; border-radius:12px;"\n></iframe>`}
          </pre>
        </div>
      </div>
    </FrameLayout>
  )
}

function PillarRow({ label, value, weight, desc }: { label: string; value: number; weight: string; desc: string }) {
  const color = value >= 0.6 ? 'bg-success' : value >= 0.3 ? 'bg-warning' : value > 0 ? 'bg-error' : 'bg-border'
  const textColor = value >= 0.6 ? 'text-success' : value >= 0.3 ? 'text-warning' : value > 0 ? 'text-error' : 'text-muted'
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground font-medium">{label}</span>
          <span className="text-[9px] text-muted">{weight}</span>
        </div>
        <span className={`text-xs font-mono font-semibold ${textColor}`}>{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 bg-background rounded-full overflow-hidden mb-0.5">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(value * 100, 2)}%` }} />
      </div>
      <p className="text-[9px] text-muted">{desc}</p>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-surface/90 border border-border rounded-lg p-2 text-center">
      <p className={`text-sm font-mono font-bold ${accent ? 'text-success' : 'text-foreground'}`}>{value}</p>
      <p className="text-[9px] text-muted">{label}</p>
    </div>
  )
}
