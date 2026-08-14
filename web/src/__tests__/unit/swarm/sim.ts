// sim.ts — in-process simulated swarm election (the R1 gate harness).
//
// Drives the REAL engine functions (scheduler, lens, tally, chunking) through the
// exact protocol the API will run: ping -> schedule -> dock -> lens -> ballot ->
// auto-undock -> cell completes at quorum -> tier advances -> champion.
// Evaluator ballots use the cradle stub (outcome weight + lens-text overlap), so the
// lens genuinely shapes the vote and elections are deterministic under a seed.

import {
  tallyCell,
  outcomeWeight,
  chunkCells,
  scheduleNextCell,
  effectiveQuorum,
  cellComplete,
  assignLens,
  mulberry32,
  type Memory,
  type Ballot,
  type CellSnapshot,
  type CellResult,
  type Champion,
  type SwarmConfig,
  type LensPools,
} from '@/lib/swarm/engine'

function overlap(a: string, b: string): number {
  const toks = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
  const A = toks(a)
  const B = toks(b)
  let hits = 0
  for (const t of A) if (B.has(t)) hits++
  return A.size ? hits / A.size : 0
}

/** Deterministic stub ballot: outcome weight + lens overlap (carried from cradle). */
function stubRanking(lens: Memory, candidates: Memory[]): string[] {
  return [...candidates]
    .map((c) => ({ c, key: outcomeWeight(c) + 0.25 * overlap(lens.text, c.text) }))
    .sort((a, b) => b.key - a.key || a.c.id.localeCompare(b.c.id))
    .map((x) => x.c.id)
}

export interface SimResult {
  champion: Champion
  tiers: string[][]
  cellResults: CellResult[][]
  ballotsCast: number
  /** lens ids assigned per cell (tier-major order) — for distinctness assertions. */
  lensesPerCell: string[][][]
}

export function runSimulatedElection(
  memories: Memory[],
  evaluatorIds: string[],
  cfg: SwarmConfig,
  seed: number,
): SimResult {
  const rand = mulberry32(seed)
  const byId = new Map(memories.map((m) => [m.id, m]))
  const allIds = memories.map((m) => m.id)

  let survivors = [...allIds]
  const tiers: string[][] = [survivors]
  const cellResults: CellResult[][] = []
  const lensesPerCell: string[][][] = []
  let ballotsCast = 0
  let lastFinal: CellResult | null = null

  while (survivors.length > 1) {
    const tierSet = new Set(survivors)
    const chunks = chunkCells(survivors, cfg.cellSize)
    const cells: CellSnapshot[] = chunks.map((candidateIds, i) => ({
      id: `c${i}`,
      seq: i,
      candidateIds,
      ballots: [],
      activeDocks: [],
    }))
    const cast = new Map<string, Ballot[]>(cells.map((c) => [c.id, []]))
    const usedLenses = new Map<string, string[]>(cells.map((c) => [c.id, []]))
    const q = effectiveQuorum(cfg, evaluatorIds.length)

    let guard = 0
    while (cells.some((c) => !cellComplete(c, q))) {
      if (++guard > 100_000) throw new Error('simulation did not converge')
      let progressed = false
      // Round-robin pings — each evaluator asks for a turn, works it fully.
      for (const ev of evaluatorIds) {
        const decision = scheduleNextCell(ev, cells, cfg, evaluatorIds.length)
        if (decision.kind === 'waiting') continue
        const cell = cells.find((c) => c.id === decision.cellId)!

        // Dock (strict claim), draw the lens from outside the cell.
        cell.activeDocks.push({ evaluatorId: ev })
        const pools: LensPools = {
          // Eliminated memories remain eligible lenses — the fallen become perspectives.
          outsidePool: allIds.filter((id) => !tierSet.has(id)),
          sameTierOtherCells: survivors.filter((id) => !cell.candidateIds.includes(id)),
          predecessorPool: [],
        }
        const used = usedLenses.get(cell.id)!
        // Full fallback ladder incl. the degenerate floor (in-cell recused lens).
        const { lensId, inCell } = assignLens(pools, cell.candidateIds, used, rand)
        used.push(lensId)

        // Ballot through the lens; an in-cell lens ranks only the OTHER candidates
        // (recusal by omission). Accepted ballot auto-undocks.
        const candidates = cell.candidateIds
          .filter((id) => !(inCell && id === lensId))
          .map((id) => byId.get(id)!)
        const ballot: Ballot = {
          evaluatorId: ev,
          lensId,
          ranking: stubRanking(byId.get(lensId)!, candidates),
        }
        cast.get(cell.id)!.push(ballot)
        cell.ballots.push({ evaluatorId: ev })
        cell.activeDocks = cell.activeDocks.filter((d) => d.evaluatorId !== ev)
        ballotsCast++
        progressed = true
      }
      if (!progressed) throw new Error('deadlock: open cells but no evaluator can dock')
    }

    // Tier complete: tally every cell with the carried cradle math.
    const results = cells.map((c) =>
      tallyCell(c.candidateIds.map((id) => byId.get(id)!), cast.get(c.id)!),
    )
    cellResults.push(results)
    lensesPerCell.push(cells.map((c) => [...usedLenses.get(c.id)!]))
    lastFinal = results[results.length - 1]!
    survivors = results.map((r) => r.winnerId)
    tiers.push(survivors)
  }

  const champId = survivors[0]!
  const champion: Champion = {
    memoryId: champId,
    text: byId.get(champId)!.text,
    crownedAt: new Date(0).toISOString(),
    lineage: lastFinal ? lastFinal.standings.map((s) => s.memoryId) : [champId],
    tiers,
  }
  return { champion, tiers, cellResults, ballotsCast, lensesPerCell }
}
