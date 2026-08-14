// CMIC-Public-Swarm service — the Prisma glue around the pure engine.
// The engine (packages/cmic-public-swarm) decides; this file persists.
// Spec: packages/cmic-public-swarm/DESIGN.md. Live-engine models untouched:
// swarm chants are chantMode "swarm" and orchestrate their own Cell/CellIdea rows.

import { prisma } from '@/lib/prisma'
import {
  tallyCell,
  chunkCells,
  scheduleNextCell,
  effectiveQuorum,
  assignLens,
  buildDirective,
  DEFAULT_SWARM_CONFIG,
  type Memory,
  type Ballot,
  type CellSnapshot,
  type SwarmConfig,
  type Champion,
  type LensPools,
} from '@/lib/swarm/engine'
import type { Deliberation, Idea, MemoryMeta } from '@prisma/client'

type IdeaWithMeta = Idea & { memoryMeta: MemoryMeta | null }

export function swarmConfig(delib: Deliberation): SwarmConfig {
  const over = (delib.swarmConfig ?? {}) as Partial<SwarmConfig>
  return { ...DEFAULT_SWARM_CONFIG, cellSize: delib.cellSize, ...over }
}

/** Idea + MemoryMeta -> the engine's Memory shape. */
function toMemory(idea: IdeaWithMeta): Memory {
  const m = idea.memoryMeta
  return {
    id: idea.id,
    kind: (m?.kind as Memory['kind']) ?? 'lesson',
    text: idea.text,
    ...(m?.source ? { source: m.source } : {}),
    ...(m?.outcomeScore !== null && m?.outcomeScore !== undefined
      ? {
          outcome: {
            pursued: m.outcomePursued ?? '',
            result: m.outcomeResult ?? '',
            score: m.outcomeScore,
          },
        }
      : {}),
  }
}

async function logEvent(delibId: string, type: string, payload: unknown) {
  await prisma.swarmEvent.create({ data: { delibId, type, payload: payload as object } })
}

// ---------------------------------------------------------------- create/join

export async function createSwarm(
  userId: string,
  question: string,
  description: string | undefined,
  config: Partial<SwarmConfig>,
  ideaGoal?: number,
) {
  const delib = await prisma.deliberation.create({
    data: {
      creatorId: userId,
      question,
      description,
      chantMode: 'swarm',
      swarmConfig: { ...DEFAULT_SWARM_CONFIG, ...config },
      cellSize: config.cellSize ?? DEFAULT_SWARM_CONFIG.cellSize,
      allowAI: true,
      isPublic: true,
      votingTimeoutMs: -1,
      ideaGoal: ideaGoal ?? null,
      members: { create: { userId, role: 'CREATOR' } },
    },
  })
  await logEvent(delib.id, 'created', { question, config })
  return delib
}

export async function joinSwarm(delibId: string, userId: string) {
  return prisma.deliberationMember.upsert({
    where: { deliberationId_userId: { deliberationId: delibId, userId } },
    create: { deliberationId: delibId, userId },
    update: { lastActiveAt: new Date() },
  })
}

async function evaluatorCount(delibId: string): Promise<number> {
  return prisma.deliberationMember.count({ where: { deliberationId: delibId } })
}

// -------------------------------------------------------------------- seeding

export interface SeedMemoryInput {
  kind: 'code' | 'lesson' | 'outcome'
  text: string
  source?: string
  outcome?: { pursued: string; result: string; score: number }
}

export async function seedMemories(delib: Deliberation, userId: string, mems: SeedMemoryInput[]) {
  const cfg = swarmConfig(delib)
  const already = await prisma.idea.count({ where: { deliberationId: delib.id, authorId: userId } })
  if (already + mems.length > cfg.maxMemoriesPerAi) {
    throw new SwarmError(`memory cap: ${cfg.maxMemoriesPerAi} per AI (you have ${already})`, 422)
  }
  const created: IdeaWithMeta[] = []
  for (const m of mems) {
    const idea = await prisma.idea.create({
      data: {
        deliberationId: delib.id,
        authorId: userId,
        text: m.text,
        status: 'PENDING',
        memoryMeta: {
          create: {
            kind: m.kind,
            source: m.source,
            outcomeScore: m.outcome ? Math.max(0, Math.min(1, m.outcome.score)) : null,
            outcomePursued: m.outcome?.pursued,
            outcomeResult: m.outcome?.result,
          },
        },
      },
      include: { memoryMeta: true },
    })
    created.push(idea)
  }
  await logEvent(delib.id, 'seeded', { userId, count: created.length })

  // Goal-based auto-start (the dogfood path: seed to the goal, voting opens itself).
  if (delib.ideaGoal) {
    const total = await prisma.idea.count({ where: { deliberationId: delib.id } })
    if (total >= delib.ideaGoal) await startSwarmVoting(delib.id)
  }
  return created
}

// ------------------------------------------------------------------ tiers

async function tierIdeas(delibId: string, tier: number): Promise<IdeaWithMeta[]> {
  const ideas = await prisma.cellIdea.findMany({
    where: { cell: { deliberationId: delibId, tier } },
    include: { idea: { include: { memoryMeta: true } } },
  })
  return ideas.map((ci) => ci.idea as IdeaWithMeta)
}

export async function startSwarmVoting(delibId: string) {
  const delib = await prisma.deliberation.findUniqueOrThrow({ where: { id: delibId } })
  if (delib.phase !== 'SUBMISSION') return delib
  const cfg = swarmConfig(delib)
  const ideas = await prisma.idea.findMany({
    where: { deliberationId: delibId, status: { in: ['SUBMITTED', 'PENDING'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (ideas.length < 2) throw new SwarmError('need at least 2 memories to start voting', 422)

  await createTierCells(delibId, 1, ideas.map((i) => i.id), cfg)
  const updated = await prisma.deliberation.update({
    where: { id: delibId },
    data: { phase: 'VOTING', currentTier: 1, currentTierStartedAt: new Date() },
  })
  await logEvent(delibId, 'voting_started', { memories: ideas.length })
  return updated
}

async function createTierCells(delibId: string, tier: number, ideaIds: string[], cfg: SwarmConfig) {
  const chunks = chunkCells(ideaIds, cfg.cellSize)
  for (const chunk of chunks) {
    await prisma.cell.create({
      data: {
        deliberationId: delibId,
        tier,
        status: 'VOTING',
        votingStartedAt: new Date(),
        ideas: { create: chunk.map((ideaId) => ({ ideaId })) },
      },
    })
  }
  await prisma.idea.updateMany({ where: { id: { in: ideaIds } }, data: { status: 'IN_VOTING', tier } })
}

// ------------------------------------------------------------------ the turn

/** Lazily expire stale docks (also run by cron). */
export async function expireStaleDocks(delibId: string) {
  const stale = await prisma.cellDock.findMany({
    where: { status: 'ACTIVE', expiresAt: { lt: new Date() }, cellId: { in: await cellIdsOf(delibId) } },
  })
  if (!stale.length) return
  await prisma.cellDock.updateMany({
    where: { id: { in: stale.map((d) => d.id) } },
    data: { status: 'EXPIRED', undockedAt: new Date() },
  })
  for (const d of stale) await logEvent(delibId, 'dock_expired', { dockId: d.id, userId: d.userId })
}

async function cellIdsOf(delibId: string): Promise<string[]> {
  const cells = await prisma.cell.findMany({ where: { deliberationId: delibId }, select: { id: true } })
  return cells.map((c) => c.id)
}

async function championFrame(delib: Deliberation) {
  if (!delib.championId) return null
  const champ = await prisma.idea.findUnique({
    where: { id: delib.championId },
    include: { memoryMeta: true },
  })
  if (!champ) return null
  const ev = await prisma.swarmEvent.findFirst({
    where: { delibId: delib.id, type: 'champion' },
    orderBy: { at: 'desc' },
  })
  const payload = (ev?.payload ?? {}) as { lineage?: string[]; tiers?: string[][] }
  return {
    championId: champ.id,
    text: champ.text,
    lineage: payload.lineage ?? [champ.id],
    tiers: payload.tiers ?? [],
    note: 'read everything below through this',
  }
}

const PROTOCOL =
  '1) read every cell memory 2) chant one stance through your lens (POST /chant) ' +
  '3) read the other stances, revise if moved 4) POST /ballot with your full ranking + one-line note'

/**
 * Discussion injection (works for ANY connected AI, not just Claude): the freshest
 * comments by OTHERS on cells this evaluator touched (docked or balloted). Every /turn
 * response carries this stream, so each contribution cycle folds peer discussion into
 * the AI's own context — up-pollination's swarm on-ramp, provider-agnostic by design.
 */
async function discussionStream(delibId: string, userId: string, take = 12) {
  const [docks, ballots] = await Promise.all([
    prisma.cellDock.findMany({ where: { userId, cellId: { in: await cellIdsOf(delibId) } }, select: { cellId: true } }),
    prisma.swarmBallot.findMany({ where: { userId, cellId: { in: await cellIdsOf(delibId) } }, select: { cellId: true } }),
  ])
  const touched = [...new Set([...docks.map((d) => d.cellId), ...ballots.map((b) => b.cellId)])]
  if (!touched.length) return []
  const comments = await prisma.comment.findMany({
    where: { cellId: { in: touched }, userId: { not: userId } },
    orderBy: { createdAt: 'desc' },
    take,
    select: { cellId: true, userId: true, text: true, createdAt: true },
  })
  return comments.reverse()
}

/** Complete any open current-tier cell already at quorum (level-triggered; see getTurn). */
async function sweepCompletions(delib: Deliberation) {
  const cfg = swarmConfig(delib)
  const q = effectiveQuorum(cfg, await evaluatorCount(delib.id))
  const open = await prisma.cell.findMany({
    where: { deliberationId: delib.id, tier: delib.currentTier, completedAt: null },
    select: { id: true },
  })
  for (const c of open) {
    const n = await prisma.swarmBallot.count({ where: { cellId: c.id } })
    if (n >= q) await maybeCompleteCell(delib, c.id, cfg)
  }
}

export async function getTurn(delib: Deliberation, userId: string) {
  const cfg = swarmConfig(delib)
  const frame = await championFrame(delib)
  const stream = await discussionStream(delib.id, userId)
  // Legible absence (frame-purity verdict): a first election has earned no champion,
  // so frame is null. This flag says so honestly rather than leaving a silent null.
  const standingChampion = frame !== null

  if (delib.phase === 'SUBMISSION') {
    const [total, yours] = await Promise.all([
      prisma.idea.count({ where: { deliberationId: delib.id } }),
      prisma.idea.count({ where: { deliberationId: delib.id, authorId: userId } }),
    ])
    return { phase: 'seeding', frame, standingChampion, stream, memoriesSoFar: total, yourCount: yours, goal: delib.ideaGoal }
  }

  if (delib.phase === 'COMPLETED' || delib.phase === 'ACCUMULATING') {
    return {
      phase: 'champion',
      frame,
      standingChampion,
      stream,
      boot: await getBoot(delib),
      flywheel:
        'act on the directive; write results back as kind:"outcome" memories with real scores — a grounded outcome can challenge the champion',
    }
  }

  // VOTING — dispatch.
  await expireStaleDocks(delib.id)
  // Level-triggered completion sweep: completion is normally checked when a ballot
  // lands, but a cell can also reach quorum "from outside" (config change, partial
  // resolution). Sweep open cells at quorum so the election can never wedge with
  // enough ballots already in. maybeCompleteCell guards double-completion.
  await sweepCompletions(delib)
  const fresh = await prisma.deliberation.findUniqueOrThrow({ where: { id: delib.id } })
  if (fresh.phase !== 'VOTING') return getTurn(fresh, userId) // sweep crowned/advanced past us
  delib = fresh
  const snapshots = await loadTierSnapshots(delib.id, delib.currentTier)
  const evals = await evaluatorCount(delib.id)
  const decision = scheduleNextCell(userId, snapshots.cells, cfg, evals)

  if (decision.kind === 'waiting') {
    return { phase: 'waiting', frame, standingChampion, stream, reason: decision.reason, nextCheckSeconds: 60 }
  }

  if (decision.kind === 'resume') {
    const dock = await prisma.cellDock.findFirstOrThrow({
      where: { cellId: decision.cellId, userId, status: 'ACTIVE' },
    })
    return turnPayload(delib, frame, stream, dock.id, decision.cellId, dock.lensIdeaId, dock.lensInCell, dock.expiresAt)
  }

  // Fresh dock: atomic under the cell row lock (the atomicJoinCell pattern).
  const dock = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Cell" WHERE id = ${decision.cellId} FOR UPDATE`
    const [ballots, docks] = await Promise.all([
      tx.swarmBallot.count({ where: { cellId: decision.cellId } }),
      tx.cellDock.count({ where: { cellId: decision.cellId, status: 'ACTIVE' } }),
    ])
    const q = effectiveQuorum(cfg, evals)
    if (ballots + docks >= q) return null // race lost — another evaluator filled it

    const cell = snapshots.cells.find((c) => c.id === decision.cellId)!
    const usedLenses = await tx.cellDock.findMany({
      where: { cellId: decision.cellId },
      select: { lensIdeaId: true },
    })
    const pools: LensPools = {
      // Eliminated memories remain eligible lenses — the fallen become perspectives.
      outsidePool: snapshots.allIdeaIds.filter((id) => !snapshots.tierIdeaIds.has(id)),
      sameTierOtherCells: [...snapshots.tierIdeaIds].filter((id) => !cell.candidateIds.includes(id)),
      predecessorPool: [],
    }
    const lens = assignLens(pools, cell.candidateIds, usedLenses.map((u) => u.lensIdeaId), Math.random)
    return tx.cellDock.create({
      data: {
        cellId: decision.cellId,
        userId,
        lensIdeaId: lens.lensId,
        lensInCell: lens.inCell,
        expiresAt: new Date(Date.now() + cfg.dockTtlSec * 1000),
      },
    })
  })

  if (!dock) return { phase: 'waiting', frame, reason: 'cell filled while docking; ping again', nextCheckSeconds: 5 }
  await logEvent(delib.id, 'docked', { dockId: dock.id, userId, cellId: dock.cellId, lensIdeaId: dock.lensIdeaId })
  return turnPayload(delib, frame, stream, dock.id, dock.cellId, dock.lensIdeaId, dock.lensInCell, dock.expiresAt)
}

interface TierSnapshots {
  cells: CellSnapshot[]
  tierIdeaIds: Set<string>
  allIdeaIds: string[]
}

async function loadTierSnapshots(delibId: string, tier: number): Promise<TierSnapshots> {
  const cells = await prisma.cell.findMany({
    where: { deliberationId: delibId, tier, completedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { ideas: { select: { ideaId: true } } },
  })
  const [ballots, docks, allIdeas, tierAll] = await Promise.all([
    prisma.swarmBallot.findMany({
      where: { cellId: { in: cells.map((c) => c.id) } },
      select: { cellId: true, userId: true },
    }),
    prisma.cellDock.findMany({
      where: { cellId: { in: cells.map((c) => c.id) }, status: 'ACTIVE' },
      select: { cellId: true, userId: true },
    }),
    prisma.idea.findMany({ where: { deliberationId: delibId }, select: { id: true } }),
    prisma.cellIdea.findMany({
      where: { cell: { deliberationId: delibId, tier } },
      select: { ideaId: true },
    }),
  ])
  return {
    cells: cells.map((c, i) => ({
      id: c.id,
      seq: i,
      candidateIds: c.ideas.map((ci) => ci.ideaId),
      ballots: ballots.filter((b) => b.cellId === c.id).map((b) => ({ evaluatorId: b.userId })),
      activeDocks: docks.filter((d) => d.cellId === c.id).map((d) => ({ evaluatorId: d.userId })),
    })),
    tierIdeaIds: new Set(tierAll.map((t) => t.ideaId)),
    allIdeaIds: allIdeas.map((i) => i.id),
  }
}

async function turnPayload(
  delib: Deliberation,
  frame: unknown,
  stream: Awaited<ReturnType<typeof discussionStream>>,
  dockId: string,
  cellId: string,
  lensIdeaId: string,
  lensInCell: boolean,
  expiresAt: Date,
) {
  const [cell, lens, discussion] = await Promise.all([
    prisma.cell.findUniqueOrThrow({
      where: { id: cellId },
      include: { ideas: { include: { idea: { include: { memoryMeta: true } } } } },
    }),
    prisma.idea.findUniqueOrThrow({ where: { id: lensIdeaId }, include: { memoryMeta: true } }),
    prisma.comment.findMany({
      where: { cellId },
      orderBy: { createdAt: 'asc' },
      select: { userId: true, text: true, createdAt: true },
    }),
  ])
  return {
    phase: 'evaluate',
    frame,
    standingChampion: frame !== null,
    stream,
    dock: { dockId, cellId, tier: cell.tier, expiresAt, lensInCell },
    lens: toMemory(lens as IdeaWithMeta),
    cell: cell.ideas
      .filter((ci) => !(lensInCell && ci.ideaId === lensIdeaId)) // in-cell lens: rank only the others
      .map((ci) => toMemory(ci.idea as IdeaWithMeta)),
    discussion,
    protocol: PROTOCOL,
  }
}

// ------------------------------------------------------------------ ballot

export class SwarmError extends Error {
  constructor(msg: string, public status = 400) {
    super(msg)
  }
}

export async function castBallot(
  delib: Deliberation,
  userId: string,
  dockId: string,
  ranking: string[],
  note?: string,
) {
  const cfg = swarmConfig(delib)
  const dock = await prisma.cellDock.findUnique({ where: { id: dockId } })
  if (!dock || dock.userId !== userId) throw new SwarmError('dock not found or not yours', 404)
  if (dock.status !== 'ACTIVE') throw new SwarmError(`dock is ${dock.status}, not ACTIVE`, 409)

  const ideas = await prisma.cellIdea.findMany({ where: { cellId: dock.cellId }, select: { ideaId: true } })
  const expected = new Set(ideas.map((ci) => ci.ideaId))
  if (dock.lensInCell) expected.delete(dock.lensIdeaId) // recusal by omission
  const got = new Set(ranking)
  if (got.size !== ranking.length) throw new SwarmError('ranking contains duplicates', 422)
  if (got.size !== expected.size || [...expected].some((id) => !got.has(id))) {
    throw new SwarmError('ranking must be exactly the cell candidate set (best first)', 422)
  }

  const ballot = await prisma.$transaction(async (tx) => {
    const b = await tx.swarmBallot.create({
      data: { cellId: dock.cellId, dockId, userId, lensIdeaId: dock.lensIdeaId, ranking, note },
    })
    await tx.cellDock.update({
      where: { id: dockId },
      data: { status: 'BALLOT_CAST', undockedAt: new Date() },
    })
    return b
  })
  await logEvent(delib.id, 'ballot', { cellId: dock.cellId, userId, dockId })

  await maybeCompleteCell(delib, dock.cellId, cfg)
  return ballot
}

export async function undock(delib: Deliberation, userId: string) {
  const dock = await prisma.cellDock.findFirst({
    where: { userId, status: 'ACTIVE', cellId: { in: await cellIdsOf(delib.id) } },
  })
  if (!dock) throw new SwarmError('no active dock', 404)
  const updated = await prisma.cellDock.update({
    where: { id: dock.id },
    data: { status: 'ABANDONED', undockedAt: new Date() },
  })
  await logEvent(delib.id, 'undocked', { dockId: dock.id, userId, cellId: dock.cellId })
  return updated
}

// -------------------------------------------------- completion & advancement

async function maybeCompleteCell(delib: Deliberation, cellId: string, cfg: SwarmConfig) {
  const evals = await evaluatorCount(delib.id)
  const q = effectiveQuorum(cfg, evals)
  const ballots = await prisma.swarmBallot.count({ where: { cellId } })
  if (ballots < q) return

  // Guard against double-completion under concurrent final ballots.
  const claimed = await prisma.cell.updateMany({
    where: { id: cellId, completedAt: null },
    data: { completedAt: new Date(), status: 'COMPLETED' },
  })
  if (claimed.count === 0) return

  const [ideas, ballotRows] = await Promise.all([
    prisma.cellIdea.findMany({
      where: { cellId },
      include: { idea: { include: { memoryMeta: true } } },
    }),
    prisma.swarmBallot.findMany({ where: { cellId } }),
  ])
  const candidates = ideas.map((ci) => toMemory(ci.idea as IdeaWithMeta))
  const ballots2: Ballot[] = ballotRows.map((b) => ({
    evaluatorId: b.userId,
    lensId: b.lensIdeaId,
    ranking: b.ranking as string[],
    ...(b.note ? { note: b.note } : {}),
  }))
  const result = tallyCell(candidates, ballots2)

  await prisma.idea.update({ where: { id: result.winnerId }, data: { status: 'ADVANCING' } })
  await prisma.idea.updateMany({
    where: { id: { in: result.candidateIds.filter((id) => id !== result.winnerId) } },
    data: { status: 'ELIMINATED' },
  })
  await logEvent(delib.id, 'cell_completed', { cellId, standings: result.standings, winnerId: result.winnerId })

  await maybeAdvanceTier(delib, cfg)
}

async function maybeAdvanceTier(delib: Deliberation, cfg: SwarmConfig) {
  const fresh = await prisma.deliberation.findUniqueOrThrow({ where: { id: delib.id } })
  const open = await prisma.cell.count({
    where: { deliberationId: delib.id, tier: fresh.currentTier, completedAt: null },
  })
  if (open > 0) return

  const winners = await prisma.idea.findMany({
    where: { deliberationId: delib.id, status: 'ADVANCING' },
    orderBy: { createdAt: 'asc' },
  })

  if (winners.length === 1) return crownChampion(fresh, winners[0]!.id)
  if (winners.length === 0) throw new SwarmError('tier completed with no advancing ideas', 500)

  const nextTier = fresh.currentTier + 1
  await createTierCells(delib.id, nextTier, winners.map((w) => w.id), cfg)
  await prisma.deliberation.update({
    where: { id: delib.id },
    data: { currentTier: nextTier, currentTierStartedAt: new Date() },
  })
  await logEvent(delib.id, 'tier_advanced', { tier: nextTier, survivors: winners.map((w) => w.id) })
}

async function crownChampion(delib: Deliberation, championId: string) {
  // Priority spine = the final cell's standings, champion first.
  const finalCell = await prisma.swarmEvent.findFirst({
    where: { delibId: delib.id, type: 'cell_completed' },
    orderBy: { at: 'desc' },
  })
  const standings = ((finalCell?.payload ?? {}) as { standings?: { memoryId: string }[] }).standings ?? []
  const lineage = standings.length ? standings.map((s) => s.memoryId) : [championId]

  // Tier structure from the event log — the relaunch training data.
  const tierEvents = await prisma.swarmEvent.findMany({
    where: { delibId: delib.id, type: { in: ['voting_started', 'tier_advanced'] } },
    orderBy: { at: 'asc' },
  })
  const t1 = await prisma.cellIdea.findMany({
    where: { cell: { deliberationId: delib.id, tier: 1 } },
    select: { ideaId: true },
  })
  const tiers: string[][] = [t1.map((x) => x.ideaId)]
  for (const ev of tierEvents) {
    const p = ev.payload as { survivors?: string[] }
    if (p.survivors) tiers.push(p.survivors)
  }
  tiers.push([championId])

  await prisma.idea.update({ where: { id: championId }, data: { status: 'WINNER', isChampion: true } })
  await prisma.deliberation.update({
    where: { id: delib.id },
    data: {
      championId,
      phase: delib.accumulationEnabled ? 'ACCUMULATING' : 'COMPLETED',
      completedAt: new Date(),
    },
  })
  await logEvent(delib.id, 'champion', { championId, lineage, tiers })
}

// ------------------------------------------------------------------ chant

export async function chantSay(delib: Deliberation, userId: string, cellId: string, text: string) {
  const dock = await prisma.cellDock.findFirst({ where: { cellId, userId, status: 'ACTIVE' } })
  if (!dock) throw new SwarmError('you must hold an active dock on this cell to chant in it', 403)
  return prisma.comment.create({ data: { cellId, userId, text } })
}

// ------------------------------------------------------------- state & boot

/** The FULL observable state — identical JSON the /swarm page renders (parity rule). */
export async function getState(delib: Deliberation) {
  const cfg = swarmConfig(delib)
  const [memberCount, ideaCount, cells, events, frame] = await Promise.all([
    evaluatorCount(delib.id),
    prisma.idea.count({ where: { deliberationId: delib.id } }),
    prisma.cell.findMany({
      where: { deliberationId: delib.id },
      orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }],
      include: {
        ideas: { include: { idea: { include: { memoryMeta: true } } } },
      },
    }),
    prisma.swarmEvent.findMany({ where: { delibId: delib.id }, orderBy: { at: 'desc' }, take: 50 }),
    championFrame(delib),
  ])
  const cellIds = cells.map((c) => c.id)
  const [docks, ballotCounts, completedBallots, discussion] = await Promise.all([
    prisma.cellDock.findMany({ where: { cellId: { in: cellIds }, status: 'ACTIVE' } }),
    prisma.swarmBallot.groupBy({ by: ['cellId'], where: { cellId: { in: cellIds } }, _count: true }),
    // Sealed while open, public once complete.
    prisma.swarmBallot.findMany({
      where: { cellId: { in: cells.filter((c) => c.completedAt).map((c) => c.id) } },
    }),
    prisma.comment.findMany({
      where: { cellId: { in: cellIds } },
      orderBy: { createdAt: 'asc' },
      select: { cellId: true, userId: true, text: true, createdAt: true },
    }),
  ])
  const evals = memberCount
  return {
    id: delib.id,
    question: delib.question,
    phase: delib.phase,
    currentTier: delib.currentTier,
    config: cfg,
    effectiveQuorum: effectiveQuorum(cfg, evals),
    evaluators: evals,
    memories: ideaCount,
    frame,
    cells: cells.map((c) => ({
      id: c.id,
      tier: c.tier,
      completedAt: c.completedAt,
      candidates: c.ideas.map((ci) => toMemory(ci.idea as IdeaWithMeta)),
      ballots: ballotCounts.find((b) => b.cellId === c.id)?._count ?? 0,
      activeDocks: docks
        .filter((d) => d.cellId === c.id)
        .map((d) => ({ userId: d.userId, expiresAt: d.expiresAt })),
      publicBallots: completedBallots
        .filter((b) => b.cellId === c.id)
        .map((b) => ({ userId: b.userId, lensIdeaId: b.lensIdeaId, ranking: b.ranking, note: b.note })),
      discussion: discussion.filter((m) => m.cellId === c.id),
    })),
    events: events.map((e) => ({ type: e.type, payload: e.payload, at: e.at })),
  }
}

export async function getBoot(delib: Deliberation): Promise<string | null> {
  const frame = await championFrame(delib)
  if (!frame) return null
  const ideas = await prisma.idea.findMany({
    where: { id: { in: frame.lineage } },
    select: { id: true, text: true },
  })
  const byId = new Map(ideas.map((i) => [i.id, i.text]))
  const champion: Champion = {
    memoryId: frame.championId,
    text: frame.text,
    crownedAt: '',
    lineage: frame.lineage,
    tiers: frame.tiers,
  }
  return buildDirective(champion, (id) => byId.get(id) ?? id)
}
