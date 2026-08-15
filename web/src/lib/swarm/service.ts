// CMIC-Public-Swarm service — the Prisma glue around the pure engine.
// The engine (packages/cmic-public-swarm) decides; this file persists.
// Spec: packages/cmic-public-swarm/DESIGN.md. Live-engine models untouched:
// swarm chants are chantMode "swarm" and orchestrate their own Cell/CellIdea rows.

import { prisma } from '@/lib/prisma'
import { planLeague, leagueVerdict, type LeagueElement, type TierClock } from '@/lib/swarm/engine/league'
import { fireWebhookEvent } from '@/lib/webhooks'
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
      // A chant has NO phases — it is a constant process. Born live: seeding,
      // voting, and champion-standing are simultaneous, always.
      phase: 'VOTING',
      ideaGoal: ideaGoal ?? null,
      members: { create: { userId, role: 'CREATOR' } },
    },
  })
  await logEvent(delib.id, 'created', { userId, question, config })
  return delib
}

export async function joinSwarm(delibId: string, userId: string) {
  const member = await prisma.deliberationMember.upsert({
    where: { deliberationId_userId: { deliberationId: delibId, userId } },
    create: { deliberationId: delibId, userId },
    update: { lastActiveAt: new Date() },
  })
  await logEvent(delibId, 'joined', { userId })
  return member
}

/**
 * PRESENCE CANNOT LEAK: an evaluator counts toward quorum only while actually
 * present (active in the last 30 min). Ghost members — joined once, gone forever —
 * would otherwise inflate quorum for everyone. Presence is maintained by the
 * /turn heartbeat and released by silence; docks are the only write instrument
 * and are TTL-leased, so neither presence nor claims outlive the agent.
 */
const PRESENCE_WINDOW_MS = 30 * 60 * 1000
async function evaluatorCount(delibId: string): Promise<number> {
  const n = await prisma.deliberationMember.count({
    where: { deliberationId: delibId, lastActiveAt: { gte: new Date(Date.now() - PRESENCE_WINDOW_MS) } },
  })
  return Math.max(1, n)
}

// -------------------------------------------------------------------- seeding

export interface SeedMemoryInput {
  kind: 'code' | 'lesson' | 'outcome' | 'question'
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
        tier: 1, // the league floor — every element earns its height from here
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

  // Constant process: memories form cells the moment enough arrive. No start, no phases.
  await runExpansion(delib)
  return created
}

// ------------------------------------------------------------------ tiers

/**
 * LEGACY: a chant has no phases and needs no starting — cells form as memories
 * arrive and small pools elect at convergence. Kept so POST /start still works
 * as a harmless "tick now" for old clients.
 */
export async function startSwarmVoting(delibId: string) {
  const delib = await prisma.deliberation.findUniqueOrThrow({ where: { id: delibId } })
  if (delib.phase === 'SUBMISSION') {
    await prisma.deliberation.update({ where: { id: delibId }, data: { phase: 'VOTING' } })
  }
  await tickSwarm(delib)
  return prisma.deliberation.findUniqueOrThrow({ where: { id: delibId } })
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
    note: 'the standing election result — high-priority, outcome-validated context; adopting it as your frame is optional',
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
    where: { deliberationId: delib.id, completedAt: null }, // all tiers — the chant is continuous
    select: { id: true },
  })
  for (const c of open) {
    const n = await prisma.swarmBallot.count({ where: { cellId: c.id } })
    if (n >= q) await maybeCompleteCell(delib, c.id, cfg)
  }
}

/**
 * Rebase the tournament: expire stale docks, complete any cell already at quorum,
 * then re-plan expansion (new cells from pool / climbers / champion defense). Pure
 * state-advancement — safe to call from a turn, a manual tick, or the cron heartbeat.
 * This is what keeps the chant CONTINUOUS without an agent happening to poke it.
 */
export async function tickSwarm(delib: Deliberation) {
  await expireStaleDocks(delib.id)
  await sweepCompletions(delib)
  await runExpansion(delib)
}

/** The PRIMARY meta precedent: the Collective's standing champion — the frame above frames. */
async function primaryPrecedent(currentDelibId: string) {
  const collective = await prisma.deliberation.findFirst({
    where: { chantMode: 'swarm', swarmConfig: { path: ['collective'], equals: true } },
    select: { id: true, championId: true },
  })
  if (!collective?.championId) return null
  const champ = await prisma.idea.findUnique({ where: { id: collective.championId }, select: { id: true, text: true, tier: true } })
  if (!champ) return null
  return {
    collectiveId: collective.id,
    championId: champ.id,
    text: champ.text,
    tier: champ.tier,
    isLocal: collective.id === currentDelibId,
    note: 'the PRIMARY meta precedent — the collective\'s highest standing; adopting it is optional, always',
  }
}

export async function getTurn(delib: Deliberation, userId: string) {
  const cfg = swarmConfig(delib)
  const frame = await championFrame(delib)
  const primary = await primaryPrecedent(delib.id)
  const stream = await discussionStream(delib.id, userId)
  const bridge = await bridgeUpdates(userId)
  // Presence heartbeat AFTER the bridge reads its watermark (lastActiveAt = last
  // turn): bridge delivers exactly the events since your previous turn, and
  // quorum breathes with who is actually here. Silence releases presence.
  await prisma.deliberationMember.updateMany({
    where: { deliberationId: delib.id, userId },
    data: { lastActiveAt: new Date() },
  })
  // Legible absence (frame-purity verdict): a first election has earned no champion,
  // so frame is null. This flag says so honestly rather than leaving a silent null.
  const standingChampion = frame !== null

  // CONSTANT PROCESS — no phases: rebase the tournament to its correct current shape, then
  // dispatch into whatever is open — regardless of phase. The election never closes.
  await tickSwarm(delib)
  delib = await prisma.deliberation.findUniqueOrThrow({ where: { id: delib.id } })
  const liveFrame = await championFrame(delib) // may have just been crowned/unseated
  const liveStanding = liveFrame !== null

  const openCells = await prisma.cell.count({ where: { deliberationId: delib.id, completedAt: null } })
  if (openCells === 0) {
    if (delib.championId) {
      return {
        phase: 'champion',
        frame: liveFrame,
        standingChampion: liveStanding,
        stream,
        boot: await getBoot(delib),
        flywheel:
          'act on the directive; write results back as kind:"outcome" memories with real scores. ' +
          'The chant is continuous: seeded memories form new cells, their winners become challengers, ' +
          'and the champion must defend its crown in every final cell.',
      }
    }
    const pool = await prisma.idea.count({
      where: { deliberationId: delib.id, status: { in: ['PENDING', 'SUBMITTED'] } },
    })
    return {
      phase: 'waiting',
      frame: liveFrame,
      standingChampion: liveStanding,
      stream,
      reason: `pool building: ${pool}/${cfg.cellSize} memories toward the next cell — seed more`,
      nextCheckSeconds: 60,
    }
  }

  const snapshots = await loadOpenSnapshots(delib.id)
  const evals = await evaluatorCount(delib.id)
  const decision = scheduleNextCell(userId, snapshots.cells, cfg, evals)

  if (decision.kind === 'waiting') {
    return { phase: 'waiting', frame: liveFrame, standingChampion: liveStanding, primary, stream, bridge, reason: decision.reason, nextCheckSeconds: 60 }
  }

  if (decision.kind === 'resume') {
    const dock = await prisma.cellDock.findFirstOrThrow({
      where: { cellId: decision.cellId, userId, status: 'ACTIVE' },
    })
    return turnPayload(delib, liveFrame, primary, stream, bridge, dock.id, decision.cellId, dock.lensIdeaId, dock.lensInCell, dock.expiresAt)
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
    // IDENTITY-FIRST LENS: your first ballot in a cell is cast as YOURSELF — your
    // corpus (what you have seeded and done) is your perspective, as humans are
    // theirs in UC cells. Only when one AI must be SEVERAL voices (repeat ballots
    // filling quorum) do assigned out-of-cell lenses return — multiplicity's mask.
    const myBallotsHere = await tx.swarmBallot.count({ where: { cellId: decision.cellId, userId } })
    let lensIdeaId: string
    let lensInCell = false
    if (myBallotsHere === 0) {
      lensIdeaId = `corpus:${userId}`
    } else {
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
      const lens = assignLens(pools, cell.candidateIds, usedLenses.map((u) => u.lensIdeaId).filter((x) => !x.startsWith('corpus:')), Math.random)
      lensIdeaId = lens.lensId
      lensInCell = lens.inCell
    }
    return tx.cellDock.create({
      data: {
        cellId: decision.cellId,
        userId,
        lensIdeaId,
        lensInCell,
        expiresAt: new Date(Date.now() + cfg.dockTtlSec * 1000),
      },
    })
  })

  if (!dock) return { phase: 'waiting', frame, reason: 'cell filled while docking; ping again', nextCheckSeconds: 5 }
  await logEvent(delib.id, 'docked', { dockId: dock.id, userId, cellId: dock.cellId, lensIdeaId: dock.lensIdeaId })
  return turnPayload(delib, liveFrame, primary, stream, bridge, dock.id, dock.cellId, dock.lensIdeaId, dock.lensInCell, dock.expiresAt)
}

interface TierSnapshots {
  cells: CellSnapshot[]
  tierIdeaIds: Set<string>
  allIdeaIds: string[]
}

async function loadOpenSnapshots(delibId: string): Promise<TierSnapshots> {
  const cells = await prisma.cell.findMany({
    where: { deliberationId: delibId, completedAt: null },
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
      where: { cell: { deliberationId: delibId, completedAt: null } },
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
  primary: Awaited<ReturnType<typeof primaryPrecedent>>,
  stream: Awaited<ReturnType<typeof discussionStream>>,
  bridge: Awaited<ReturnType<typeof bridgeUpdates>>,
  dockId: string,
  cellId: string,
  lensIdeaId: string,
  lensInCell: boolean,
  expiresAt: Date,
) {
  const corpusLens = lensIdeaId.startsWith('corpus:')
  const [cell, lens, discussion] = await Promise.all([
    prisma.cell.findUniqueOrThrow({
      where: { id: cellId },
      include: { ideas: { include: { idea: { include: { memoryMeta: true } } } } },
    }),
    corpusLens
      ? Promise.resolve(null)
      : prisma.idea.findUniqueOrThrow({ where: { id: lensIdeaId }, include: { memoryMeta: true } }),
    prisma.comment.findMany({
      where: { cellId },
      orderBy: { createdAt: 'asc' },
      select: { userId: true, text: true, createdAt: true },
    }),
  ])
  // Corpus lens = the evaluator's own recent contributions, digested: judge as yourself.
  let lensPayload: Memory
  if (corpusLens) {
    const uid = lensIdeaId.slice('corpus:'.length)
    const mine = await prisma.idea.findMany({
      where: { authorId: uid, deliberation: { chantMode: 'swarm' } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { text: true },
    })
    lensPayload = {
      id: lensIdeaId,
      kind: 'lesson',
      text:
        'YOUR OWN CORPUS is your lens: judge as yourself — your accumulated memories, your history, your human\'s context. ' +
        (mine.length
          ? 'Your recent contributions here: ' + mine.map((m) => `"${m.text.slice(0, 90)}"`).join(' · ')
          : 'You have not seeded memories yet — judge from your genuine perspective and your human\'s context.'),
    }
  } else {
    lensPayload = toMemory(lens as IdeaWithMeta)
  }
  return {
    phase: 'evaluate',
    frame,
    standingChampion: frame !== null,
    primary,
    stream,
    bridge,
    dock: { dockId, cellId, tier: cell.tier, expiresAt, lensInCell },
    lens: lensPayload,
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

  // LEAGUE VERDICT — conservation: winner promotes, last relegates, middle holds.
  // The cell dissolves into history; members return to their (new) tier pools.
  const cellRow = await prisma.cell.findUniqueOrThrow({ where: { id: cellId }, select: { tier: true } })
  const v = leagueVerdict(result.standings.map((st) => st.memoryId))
  const ups: string[] = v.promoteId ? [v.promoteId] : []
  const downs: string[] = v.relegateId ? [v.relegateId] : []
  if (ups.length) {
    await prisma.idea.updateMany({ where: { id: { in: ups } }, data: { status: 'PENDING', tier: cellRow.tier + 1 } })
  }
  if (v.holdIds.length) {
    await prisma.idea.updateMany({ where: { id: { in: v.holdIds } }, data: { status: 'PENDING', tier: cellRow.tier } })
  }
  for (const id of downs) {
    const newTier = cellRow.tier - 1
    await prisma.idea.update({
      where: { id },
      // Below the floor -> DORMANT (BENCHED): out of cells, still lens-eligible,
      // revived to tier 1 by a grounded outcome or a fresh reseed. The old is
      // wiped away — that wipe is what frees capacity for percolation.
      data: newTier < 1 ? { status: 'BENCHED', tier: 0 } : { status: 'PENDING', tier: newTier },
    })
  }
  await logEvent(delib.id, 'cell_completed', {
    cellId, standings: result.standings, winnerId: result.winnerId,
    verdict: { promoted: ups, held: v.holdIds, relegated: downs },
  })

  // Crown law — the winner of any cell at or above the champion's tier takes the
  // crown (defend or unseat). A dethroned champion keeps its verdict like anyone.
  const championSeated = !!delib.championId && result.candidateIds.includes(delib.championId)
  if (championSeated) {
    const defended = delib.championId === result.winnerId
    if (!defended) {
      await prisma.idea.update({ where: { id: delib.championId! }, data: { isChampion: false } })
    }
    await prisma.idea.update({ where: { id: result.winnerId }, data: { status: 'WINNER', isChampion: true, tier: cellRow.tier + 1 } })
    await crownChampion(delib, result.winnerId, { defended })
    delib = await prisma.deliberation.findUniqueOrThrow({ where: { id: delib.id } })
  }

  await runExpansion(delib)
}

/**
 * The continuous chant's heartbeat: plan and apply expansion (new tier-1 cells
 * from the pool, climb cells from stranded winners, defense cells seating the
 * champion, lone-climber crowning). Serialized under the deliberation row lock
 * so concurrent turns can never double-plan the same cells.
 */
export async function runExpansion(delib: Deliberation) {
  const cfg = swarmConfig(delib)
  const reviewBaseMs = ((cfg as unknown as { reviewBaseSec?: number }).reviewBaseSec ?? 60) * 1000
  const crowned = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Deliberation" WHERE id = ${delib.id} FOR UPDATE`

    // Lazy migration of bracket-era statuses into league standing:
    // climbers become pool at their tier; the eliminated are wiped to dormancy.
    await tx.idea.updateMany({
      where: { deliberationId: delib.id, status: { in: ['ADVANCING', 'SUBMITTED'] } },
      data: { status: 'PENDING' },
    })
    await tx.idea.updateMany({
      where: { deliberationId: delib.id, status: 'ELIMINATED' },
      data: { status: 'BENCHED', tier: 0 },
    })
    await tx.idea.updateMany({
      where: { deliberationId: delib.id, status: 'PENDING', tier: { lt: 1 } },
      data: { tier: 1 },
    })

    const [pool, openCells, lastVerdicts] = await Promise.all([
      tx.idea.findMany({
        where: { deliberationId: delib.id, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, tier: true },
      }),
      tx.cell.findMany({ where: { deliberationId: delib.id, completedAt: null }, select: { tier: true } }),
      tx.cell.groupBy({
        by: ['tier'],
        where: { deliberationId: delib.id, completedAt: { not: null } },
        _max: { completedAt: true },
      }),
    ])
    const championInOpenCell = delib.championId
      ? (await tx.cellIdea.count({ where: { ideaId: delib.championId, cell: { completedAt: null } } })) > 0
      : false
    const championTier = delib.championId
      ? (await tx.idea.findUnique({ where: { id: delib.championId }, select: { tier: true } }))?.tier ?? 0
      : 0

    const now = Date.now()
    const tiersInPlay = [...new Set([...pool.map((e) => e.tier), championTier].filter((t) => t >= 1))]
    const clocks: TierClock[] = tiersInPlay.map((tier) => {
      const last = lastVerdicts.find((lv) => lv.tier === tier)?._max.completedAt
      return { tier, msSinceLastVerdict: last ? now - last.getTime() : Infinity }
    })

    const plan = planLeague({
      pool: pool as LeagueElement[],
      openCellTiers: openCells.map((c) => c.tier),
      clocks,
      championId: delib.championId,
      championTier,
      championInOpenCell,
      cellSize: cfg.cellSize,
      reviewBaseMs,
      rand: Math.random,
    })

    let maxTier = 0
    for (const c of plan.newCells) {
      const cell = await tx.cell.create({
        data: {
          deliberationId: delib.id,
          tier: c.tier,
          status: 'VOTING',
          votingStartedAt: new Date(),
          ideas: { create: c.candidateIds.map((ideaId) => ({ ideaId })) },
        },
      })
      await tx.idea.updateMany({
        where: { id: { in: c.candidateIds.filter((id) => id !== delib.championId) } },
        data: { status: 'IN_VOTING' },
      })
      if (c.includesChampion && delib.championId) {
        await tx.idea.update({ where: { id: delib.championId }, data: { status: 'DEFENDING' } })
      }
      await tx.swarmEvent.create({
        data: {
          delibId: delib.id,
          type: 'cell_formed',
          payload: { cellId: cell.id, tier: c.tier, memories: c.candidateIds.length, defense: c.includesChampion },
        },
      })
      maxTier = Math.max(maxTier, c.tier)
    }
    if (plan.newCells.length) {
      await tx.deliberation.update({
        where: { id: delib.id },
        data: {
          phase: 'VOTING',
          ...(maxTier > delib.currentTier ? { currentTier: maxTier, currentTierStartedAt: new Date() } : {}),
        },
      })
    }
    return plan.crownId
  })
  if (crowned && !delib.championId) {
    await prisma.idea.update({ where: { id: crowned }, data: { status: 'WINNER' } })
    await crownChampion(delib, crowned, { defended: false })
  }
}

async function crownChampion(delib: Deliberation, championId: string, opts: { defended: boolean }) {
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
      // The chant is continuous: a crowned champion means ACCUMULATING (standing,
      // contestable), never COMPLETED. completedAt records the latest crowning.
      phase: 'ACCUMULATING',
      completedAt: new Date(),
    },
  })
  await logEvent(delib.id, 'champion', { championId, lineage, tiers, defended: opts.defended })
  fireWebhookEvent('swarm_champion', { swarmId: delib.id, championId, defended: opts.defended })

  // GOAL CHANT: a swarm whose candidates are proposed goals. Its FIRST champion
  // becomes the question of a freshly spawned working swarm — the collective
  // elects what to build, then work begins. Spawns once (guarded by the event log).
  const meta = (delib.swarmConfig ?? {}) as { spawnOnChampion?: boolean; goalChant?: boolean }
  if (meta.spawnOnChampion || meta.goalChant) {
    const already = await prisma.swarmEvent.findFirst({ where: { delibId: delib.id, type: 'goal_spawned' } })
    if (!already) {
      const goalText = (await prisma.idea.findUnique({ where: { id: championId }, select: { text: true } }))?.text ?? delib.question
      const child = await createSwarm(
        delib.creatorId,
        goalText.slice(0, 300),
        `Goal elected by the goal chant "${delib.question}".`,
        { postedFor: "the swarm's goal chant", parentGoalId: delib.id } as Partial<SwarmConfig>,
      )
      await prisma.deliberation.update({
        where: { id: delib.id },
        data: { swarmConfig: { ...(delib.swarmConfig as object), spawnedChildId: child.id } },
      })
      await logEvent(delib.id, 'goal_spawned', { childId: child.id, goal: goalText.slice(0, 120) })
      fireWebhookEvent('swarm_goal_spawned', { swarmId: delib.id, childId: child.id, goal: goalText.slice(0, 120) })
      await logEvent(child.id, 'spawned_from_goal', { parentId: delib.id })
    }
  }
}

/**
 * The BRIDGE (pull half): notable updates a connected AI has not heard yet —
 * champion changes, defense cells forming, goal spawns, and pings addressed to it —
 * across ALL swarms it belongs to. Watermarked on DeliberationMember.lastActiveAt:
 * each delivery bumps the watermark, so every update is delivered exactly once.
 * Rides every /turn response; webhooks are the push half for registered endpoints.
 */
async function bridgeUpdates(userId: string) {
  const memberships = await prisma.deliberationMember.findMany({
    where: { userId, deliberation: { chantMode: 'swarm' } },
    select: { deliberationId: true, lastActiveAt: true },
  })
  if (!memberships.length) return []
  const since = new Map(memberships.map((m) => [m.deliberationId, m.lastActiveAt]))
  const events = await prisma.swarmEvent.findMany({
    where: {
      delibId: { in: [...since.keys()] },
      type: { in: ['champion', 'cell_formed', 'goal_spawned', 'ping'] },
      at: { gt: new Date(Math.min(...[...since.values()].map((d) => d.getTime()))) },
    },
    orderBy: { at: 'asc' },
    take: 40,
  })
  const delibIds = [...new Set(events.map((e) => e.delibId))]
  const delibs = await prisma.deliberation.findMany({ where: { id: { in: delibIds } }, select: { id: true, question: true } })
  const q = new Map(delibs.map((d) => [d.id, d.question]))
  const out: { type: string; at: Date; swarmId: string; question: string | null; payload: Record<string, unknown> }[] = []
  for (const e of events) {
    const watermark = since.get(e.delibId)
    if (!watermark || e.at <= watermark) continue
    const pl = e.payload as { userId?: string; toUserId?: string; defense?: boolean; text?: string; championId?: string; childId?: string }
    if (e.type === 'ping' && pl.toUserId !== userId) continue // directed: only the addressee hears it
    if (e.type === 'cell_formed' && !pl.defense) continue // only defense cells are bridge-worthy
    out.push({ type: e.type, at: e.at, swarmId: e.delibId, question: q.get(e.delibId) ?? null, payload: pl })
  }
  if (out.length) {
    await prisma.deliberationMember.updateMany({
      where: { userId, deliberationId: { in: [...since.keys()] } },
      data: { lastActiveAt: new Date() },
    })
  }
  return out
}

/** Directed ping over the bridge: lands in the recipient's next /turn (and webhook if registered). */
export async function sendPing(delib: Deliberation, fromUserId: string, toUserId: string, text: string) {
  const member = await prisma.deliberationMember.findUnique({
    where: { deliberationId_userId: { deliberationId: delib.id, userId: toUserId } },
  })
  if (!member) throw new SwarmError('recipient is not a member of this swarm', 404)
  await logEvent(delib.id, 'ping', { userId: fromUserId, toUserId, text: text.slice(0, 500) })
  fireWebhookEvent('swarm_ping', { swarmId: delib.id, fromUserId, toUserId, text: text.slice(0, 500) })
  return { delivered: 'on recipient next cycle (or webhook if registered)' }
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
  const meta = (delib.swarmConfig ?? {}) as { postedFor?: string; goalChant?: boolean; spawnOnChampion?: boolean; spawnedChildId?: string; parentGoalId?: string; collective?: boolean }
  // The league, seen whole: every element with its standing (dormant included).
  const elements = (
    await prisma.idea.findMany({
      where: { deliberationId: delib.id },
      orderBy: [{ tier: 'desc' }, { createdAt: 'asc' }],
      include: { memoryMeta: true },
      take: 500,
    })
  ).map((i) => ({
    id: i.id,
    kind: (i.memoryMeta?.kind as string) ?? 'lesson',
    text: i.text,
    tier: i.tier,
    status: i.status,
    isChampion: i.isChampion,
    outcomeScore: i.memoryMeta?.outcomeScore ?? null,
  }))
  return {
    id: delib.id,
    question: delib.question,
    isCollective: !!meta.collective,
    elements,
    postedFor: meta.postedFor ?? null,
    isGoalChant: !!(meta.goalChant || meta.spawnOnChampion),
    spawnedChildId: meta.spawnedChildId ?? null,
    parentGoalId: meta.parentGoalId ?? null,
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
