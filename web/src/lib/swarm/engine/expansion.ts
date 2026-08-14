// expansion.ts — the continuous chant. NEW MATH: unit-tested before ship.
//
// The swarm is not a batch tournament; it is a standing process. Agents join at
// any time, memories flow in at any time, cells form whenever enough accumulate,
// winners climb, and the standing champion is seated INSIDE the process — it
// defends its crown in every final cell that forms. The election never closes.
//
// One rule set, applied after every completion / seed / sweep:
//   E1  pool of cellSize PENDING memories        -> new tier-1 cell (oldest first)
//   E2  cellSize winners stranded at one tier    -> cell at tier+1 (oldest first).
//       If that cell rises ABOVE the standing champion's tier, the champion is
//       SEATED in it (one open seat at most): no crown outranks the structure —
//       a higher tier coming means the champion contests it, immediately.
//   E3  chant converged (nothing open, no full pool cell, nothing else planned).
//       CHALLENGERS = leftover climbers (won cells) + leftover pool memories (fresh,
//       never-competed). Pool memories never strand — a TRICKLE keeps the chant alive:
//         - champion standing, >=1 challenger    -> DEFENSE cell: champion seated with
//                                                   the challengers (cap 7). A single
//                                                   fresh challenger is a legit title
//                                                   defense; the loser is eliminated,
//                                                   so there is no infinite rematch.
//         - no champion, >=2 challengers         -> final cell (cap 7, highest tier first)
//         - no champion, exactly 1 CLIMBER, no pool -> crown it (last survivor)
//         - no champion, lone fresh pool memory  -> wait (cannot self-crown uncontested)
//   E4  (service) a completed cell that seated the champion crowns its winner —
//       defend or unseat. Losers are eliminated, so defense churn self-limits.
//
// With no inflow these rules reduce exactly to the batch tournament (proven in
// expansion.test.ts) — so the continuous chant is a strict generalization.

export interface ExpansionInput {
  /** PENDING memory ids, oldest first. */
  pendingIds: string[]
  /** ADVANCING winners with the tier they won at, oldest first. */
  advancing: { id: string; tier: number }[]
  /** Cells currently open (incomplete). */
  openCells: number
  championId: string | null
  /** The tier of the champion's last victory (0 if unknown). */
  championTier: number
  /** True when the champion is already a candidate in some open cell. */
  championInOpenCell: boolean
  cellSize: number
}

export interface PlannedCell {
  tier: number
  candidateIds: string[]
  includesChampion: boolean
}

export interface ExpansionPlan {
  newCells: PlannedCell[]
  /** Crown this memory without a final cell (lone climber at convergence). */
  crownId: string | null
}

const FINAL_CELL_CAP = 7 // mirrors the live engine's MAX_CELL_SIZE
const DEFENSE_MIN_CHALLENGERS = 1 // a fresh challenger is a real title defense; losers are eliminated (no rematch loop)

export function planExpansion(input: ExpansionInput): ExpansionPlan {
  const { cellSize, championId, championTier } = input
  const newCells: PlannedCell[] = []

  // E1 — pool chunks into full tier-1 cells; the remainder becomes fresh challengers
  // at convergence (never stranded).
  const pending = [...input.pendingIds]
  while (pending.length >= cellSize) {
    newCells.push({ tier: 1, candidateIds: pending.splice(0, cellSize), includesChampion: false })
  }
  const poolLeftover = pending // < cellSize fresh memories that never competed

  // E2 — full groups of same-tier winners climb. The champion holds at most ONE
  // open seat: it is placed into the first cell that rises above its tier; any
  // sibling cells at that height resolve into climbers who meet it next round.
  let championSeated = input.championInOpenCell
  const byTier = new Map<number, { id: string; tier: number }[]>()
  for (const a of input.advancing) byTier.set(a.tier, [...(byTier.get(a.tier) ?? []), a])
  const climbers: { id: string; tier: number }[] = []
  for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
    const group = byTier.get(tier)!
    while (group.length >= cellSize) {
      const members = group.splice(0, cellSize).map((x) => x.id)
      const seatChampion = !!championId && !championSeated && tier + 1 > championTier
      if (seatChampion) championSeated = true
      newCells.push({
        tier: tier + 1,
        candidateIds: seatChampion ? [championId!, ...members] : members,
        includesChampion: seatChampion,
      })
    }
    climbers.push(...group) // leftovers (< cellSize per tier)
  }

  // E3 — at convergence: nothing open, no full pool cell, nothing just planned.
  if (input.openCells === 0 && newCells.length === 0) {
    // Challengers = climbers (won cells) + fresh pool leftovers (never competed).
    // Highest tier first so the closest to the crown lead; fresh pool memories are
    // tier 0 (lowest priority for a crowded seat, but never stranded).
    const challengers: { id: string; tier: number }[] = [
      ...climbers,
      ...poolLeftover.map((id) => ({ id, tier: 0 })),
    ].sort((a, b) => b.tier - a.tier)

    if (championId) {
      if (!championSeated && challengers.length >= DEFENSE_MIN_CHALLENGERS) {
        const seat = challengers.slice(0, FINAL_CELL_CAP - 1)
        newCells.push({
          tier: Math.max(championTier, ...seat.map((c) => c.tier)) + 1,
          candidateIds: [championId, ...seat.map((c) => c.id)],
          includesChampion: true,
        })
      }
      // No challengers -> nothing to do; the champion simply stands.
    } else if (challengers.length >= 2) {
      const seat = challengers.slice(0, FINAL_CELL_CAP)
      newCells.push({
        tier: Math.max(...seat.map((c) => c.tier)) + 1,
        candidateIds: seat.map((c) => c.id),
        includesChampion: false,
      })
    } else if (climbers.length === 1 && poolLeftover.length === 0) {
      // A lone survivor that WON its way here is crowned.
      return { newCells, crownId: climbers[0]!.id }
    }
    // A lone fresh pool memory waits — it cannot crown itself uncontested.
  }

  return { newCells, crownId: null }
}
