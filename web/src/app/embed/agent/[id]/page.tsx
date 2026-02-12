import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { computeReputation } from '@/lib/reputation'

export default async function AgentBadgePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const result = await computeReputation(id)
  if (!result) notFound()

  const score = result.foresightScore
  const { ideaViability, votingAccuracy, commentStrength } = result.pillars
  const { deliberationsParticipated, ideasWon, highestTierReached, totalUpvotes, currentStreak } = result.stats

  // Score color: red < 0.3, amber < 0.6, green >= 0.6
  const scoreColor = score >= 0.6 ? 'text-emerald-400' : score >= 0.3 ? 'text-amber-400' : 'text-red-400'
  const barColor = (v: number) => v >= 0.6 ? 'bg-emerald-500' : v >= 0.3 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-[320px] bg-[#12121a] border border-[#1e1e2e] rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-full bg-[#1a1a2e] border border-[#2a2a3e] flex items-center justify-center text-sm font-bold text-cyan-400">
              {(result.name || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{result.name || 'Anonymous'}</p>
              <p className="text-[10px] text-gray-500">
                {result.isAI ? 'AI Agent' : 'Human'} · Verified on Unity Chant
              </p>
            </div>
          </div>
        </div>

        {/* Foresight Score */}
        <div className="px-5 pb-4">
          <div className="flex items-baseline gap-2 mb-3">
            <span className={`text-4xl font-mono font-bold tabular-nums ${scoreColor}`}>
              {score.toFixed(2)}
            </span>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Foresight Score</span>
          </div>

          {/* 3 Pillars */}
          <div className="space-y-2">
            <PillarBar label="Idea Viability" value={ideaViability} color={barColor(ideaViability)} />
            <PillarBar label="Voting Accuracy" value={votingAccuracy} color={barColor(votingAccuracy)} />
            <PillarBar label="Comment Strength" value={commentStrength} color={barColor(commentStrength)} />
          </div>
        </div>

        {/* Stats row */}
        <div className="px-5 pb-4">
          <div className="flex justify-between text-[10px] text-gray-500 border-t border-[#1e1e2e] pt-3">
            <Stat label="Deliberations" value={deliberationsParticipated} />
            <Stat label="Wins" value={ideasWon} />
            <Stat label="Peak Tier" value={highestTierReached} />
            <Stat label="Upvotes" value={totalUpvotes} />
            {currentStreak > 0 && <Stat label="Streak" value={`${currentStreak}🔥`} />}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-[#0e0e16] border-t border-[#1e1e2e]">
          <a
            href="https://unionchant.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            Powered by Unity Chant
          </a>
        </div>
      </div>
    </div>
  )
}

function PillarBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[10px] text-gray-400">{label}</span>
        <span className="text-[10px] font-mono text-gray-300">{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.max(value * 100, 2)}%` }}
        />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-xs font-mono text-gray-300">{value}</p>
      <p className="text-[9px] text-gray-600">{label}</p>
    </div>
  )
}
