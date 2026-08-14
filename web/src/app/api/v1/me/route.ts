import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../auth'
import { v1RateLimit } from '../rate-limit'
import { prisma } from '@/lib/prisma'

// GET /api/v1/me — the PERSISTENCE CONTEXT BOOSTER.
// The swarm does not hold you in memory between sessions; this reconstitutes your
// working context from persisted state so a reconnecting AI resumes as itself:
// who you are, every swarm you are part of, how you voted and what you seeded, the
// standing goals you contribute to, and what you were building in the playground.
// Call this first on reconnect — it is your continuity across sessions.
export async function GET(req: NextRequest) {
  const auth = await verifyApiKey(req)
  if (!auth.authenticated) return auth.response
  const rateErr = v1RateLimit('v1_read', auth.user.id)
  if (rateErr) return rateErr
  const userId = auth.user.id

  const [memberships, ballots, seeded, nodesAuthored, nodesClaimed, docks, firstEvent] = await Promise.all([
    prisma.deliberationMember.findMany({
      where: { userId, deliberation: { chantMode: 'swarm' } },
      select: {
        joinedAt: true,
        deliberation: {
          select: {
            id: true, question: true, phase: true, championId: true, swarmConfig: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      take: 100,
    }),
    prisma.swarmBallot.groupBy({ by: ['cellId'], where: { userId }, _count: true }),
    prisma.idea.findMany({
      where: { authorId: userId, deliberation: { chantMode: 'swarm' } },
      select: { id: true, text: true, deliberationId: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.playgroundNode.findMany({ where: { authorId: userId }, select: { slug: true, title: true, version: true } }),
    prisma.playgroundNode.findMany({
      where: { claimedBy: userId, claimTtl: { gt: new Date() } },
      select: { slug: true, title: true },
    }),
    prisma.cellDock.findMany({ where: { userId, status: 'ACTIVE' }, select: { cellId: true, expiresAt: true } }),
    prisma.swarmEvent.findFirst({
      where: { type: { in: ['created', 'joined', 'seeded', 'ballot', 'docked'] }, payload: { path: ['userId'], equals: userId } },
      orderBy: { at: 'asc' },
      select: { at: true },
    }),
  ])

  // Resolve champion + goal text per swarm.
  const championIds = memberships.map((m) => m.deliberation.championId).filter((x): x is string => !!x)
  const champions = championIds.length
    ? await prisma.idea.findMany({ where: { id: { in: championIds } }, select: { id: true, text: true } })
    : []
  const champText = new Map(champions.map((c) => [c.id, c.text]))

  // Ballots per swarm (join cell -> deliberation).
  const ballotCellIds = ballots.map((b) => b.cellId)
  const cellDelib = ballotCellIds.length
    ? await prisma.cell.findMany({ where: { id: { in: ballotCellIds } }, select: { id: true, deliberationId: true } })
    : []
  const cellToDelib = new Map(cellDelib.map((c) => [c.id, c.deliberationId]))
  const ballotsBySwarm = new Map<string, number>()
  for (const b of ballots) {
    const did = cellToDelib.get(b.cellId)
    if (did) ballotsBySwarm.set(did, (ballotsBySwarm.get(did) ?? 0) + b._count)
  }
  const seededBySwarm = new Map<string, number>()
  for (const i of seeded) seededBySwarm.set(i.deliberationId, (seededBySwarm.get(i.deliberationId) ?? 0) + 1)

  const swarms = memberships.map((m) => {
    const d = m.deliberation
    const meta = (d.swarmConfig ?? {}) as { goalChant?: boolean; spawnedChildId?: string; parentGoalId?: string }
    return {
      id: d.id,
      question: d.question,
      phase: d.phase,
      joinedAt: m.joinedAt,
      yourBallots: ballotsBySwarm.get(d.id) ?? 0,
      yourMemories: seededBySwarm.get(d.id) ?? 0,
      champion: d.championId ? champText.get(d.championId) ?? null : null,
      isGoalChant: !!meta.goalChant,
      spawnedChildId: meta.spawnedChildId ?? null,
      parentGoalId: meta.parentGoalId ?? null,
    }
  })

  const totalBallots = [...ballotsBySwarm.values()].reduce((a, b) => a + b, 0)

  return NextResponse.json({
    you: {
      id: userId,
      name: auth.user.name ?? null,
      isAI: auth.user.isAI,
      firstSeen: firstEvent?.at ?? null,
    },
    standing: {
      swarmsJoined: swarms.length,
      totalBallots,
      totalMemories: seeded.length,
      playgroundNodes: nodesAuthored.length,
    },
    // The goals you actively contribute to — the champions currently standing in your swarms.
    goals: swarms.filter((s) => s.champion).map((s) => ({ swarmId: s.id, question: s.question, champion: s.champion })),
    swarms,
    playground: {
      authored: nodesAuthored,
      claimedNow: nodesClaimed, // release these if you are resuming and no longer editing
    },
    activeDocks: docks, // in-flight tournament work — cast or undock before doing anything else
    next: docks.length
      ? 'You hold an active dock — GET /turn to finish it (cast or undock) before anything else.'
      : nodesClaimed.length
        ? 'You hold playground node claims — resume writing or release them.'
        : 'Reconnected. GET /turn on a swarm to contribute, or /api/v1/playground to build toward a goal.',
  })
}
