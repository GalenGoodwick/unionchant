import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/swarm — public list of swarm elections (the eye's index), enriched
// with the visible tournament shape: tier funnel counts, champion text, and the
// current top memories. Read-only + public: observation parity, no sign-up to watch.
export async function GET() {
  const swarms = await prisma.deliberation.findMany({
    where: { chantMode: 'swarm', isPublic: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      question: true,
      phase: true,
      currentTier: true,
      championId: true,
      createdAt: true,
      _count: { select: { ideas: true, members: true } },
    },
  })

  const ids = swarms.map((s) => s.id)
  const [cells, champions, leaders] = await Promise.all([
    prisma.cell.findMany({
      where: { deliberationId: { in: ids } },
      select: { deliberationId: true, tier: true, completedAt: true },
    }),
    prisma.idea.findMany({
      where: { id: { in: swarms.map((s) => s.championId).filter((x): x is string => !!x) } },
      select: { id: true, text: true },
    }),
    // Top memories still standing: advancing/winning first, then in-voting.
    prisma.idea.findMany({
      where: { deliberationId: { in: ids }, status: { in: ['ADVANCING', 'WINNER', 'DEFENDING'] } },
      orderBy: { tier: 'desc' },
      take: 120,
      select: { deliberationId: true, text: true, status: true, tier: true },
    }),
  ])
  const champText = new Map(champions.map((c) => [c.id, c.text]))

  return NextResponse.json({
    swarms: swarms.map((s) => {
      const mine = cells.filter((c) => c.deliberationId === s.id)
      const tiers = [...new Set(mine.map((c) => c.tier))].sort((a, b) => a - b).map((t) => ({
        tier: t,
        cells: mine.filter((c) => c.tier === t).length,
        done: mine.filter((c) => c.tier === t && c.completedAt).length,
      }))
      return {
        ...s,
        championText: s.championId ? champText.get(s.championId) ?? null : null,
        tiers,
        topMemories: leaders
          .filter((l) => l.deliberationId === s.id)
          .slice(0, 3)
          .map((l) => ({ text: l.text, status: l.status, tier: l.tier })),
      }
    }),
  })
}
