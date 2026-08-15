// league.ts — the fluid chant. NEW MATH: unit-tested before ship.
//
// One collective, one standing structure. Tier = current standing, not bracket
// position. Cells are EPHEMERAL JUDGMENT EVENTS: a recast deals a tier's pool
// into fresh cells (new cellmates every round — no idea ever owns a favorable
// pocket); the verdict applies; the cell dissolves into history; members return
// to their (new) tier pools awaiting the next recast. The wipe drives
// percolation: resolved cells free capacity, seeds flow in below, winners rise.
//
// HARD LAWS
//   1. Cells are the only instrument — no standing changes outside a verdict.
//   2. Conservation — each cell promotes at most 1 and relegates at most 1, so
//      tier populations are stable by construction. No floods, no vacuums.
//   3. Stability gradient — tier T recasts only after a cooldown R(T) that grows
//      with height: low tiers churn fast, high tiers deliberate slowly, nothing
//      is frozen (the churn<->freeze dial, with its missing middle).
//   4. Dormancy, not deletion — relegated below tier 1 goes dormant: out of
//      cells, still lens-eligible, revived to tier 1 by a grounded outcome or a
//      fresh reseed. Forgetting is de-attention.
//   5. The champion holds the apex and is seated in any cell at or above its
//      tier — no crown outranks the structure.

export interface LeagueElement {
  id: string
  tier: number // 1..N standing; 0 = dormant (never handed to the planner)
}

export interface TierClock {
  tier: number
  /** ms since a cell at this tier last completed (Infinity if never). */
  msSinceLastVerdict: number
}

export interface LeagueInput {
  /** Pool elements NOT currently seated in an open cell, by standing. */
  pool: LeagueElement[]
  /** Elements currently seated in open cells (their tiers are booked). */
  openCellTiers: number[]
  clocks: TierClock[]
  championId: string | null
  championTier: number
  championInOpenCell: boolean
  cellSize: number // 5
  /** Cooldown base, ms: R(T) = reviewBaseMs * 2^(T-1). */
  reviewBaseMs: number
  /**
   * Shuffle source in [0,1) — inject for determinism in tests; the service
   * passes Math.random. Fresh mixtures each recast are the anti-pocket law.
   */
  rand: () => number
}

export interface LeagueCell {
  tier: number
  candidateIds: string[]
  includesChampion: boolean
}

export interface LeaguePlan {
  newCells: LeagueCell[]
  /** Crown without a cell: sole element standing strictly above everything else. */
  crownId: string | null
}

export interface Verdict {
  promoteId: string | null // winner rises (null only for empty standings)
  relegateId: string | null // last place slips (null when cell size < 2)
  holdIds: string[]
}

const MIN_CAST = 2 // a tier with 2-4 stale elements still deliberates (never stuck)

export function reviewCooldownMs(tier: number, reviewBaseMs: number): number {
  return reviewBaseMs * Math.pow(2, Math.max(0, tier - 1))
}

/** Fisher–Yates with injected rand — deterministic under a seeded source. */
function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/**
 * Plan one league tick: for every tier whose cooldown has passed, recast its
 * unseated pool into fresh cells. The champion is seated in any cell forming at
 * or above its own tier (one open seat at most).
 */
export function planLeague(input: LeagueInput): LeaguePlan {
  const { cellSize, championId, championTier, reviewBaseMs } = input
  const newCells: LeagueCell[] = []
  let championSeated = input.championInOpenCell

  const clock = new Map(input.clocks.map((c) => [c.tier, c.msSinceLastVerdict]))
  const byTier = new Map<number, LeagueElement[]>()
  for (const e of input.pool) {
    if (e.tier < 1) continue // dormant is not the planner's business
    if (championId && e.id === championId) continue // seated by law, not pooled
    byTier.set(e.tier, [...(byTier.get(e.tier) ?? []), e])
  }

  const tiers = [...byTier.keys()].sort((a, b) => a - b)
  for (const tier of tiers) {
    const ready = (clock.get(tier) ?? Infinity) >= reviewCooldownMs(tier, reviewBaseMs)
    if (!ready) continue
    // Fresh mixture every recast — the anti-pocket law.
    const pool = shuffle(byTier.get(tier)!, input.rand)
    while (pool.length >= cellSize || (pool.length >= MIN_CAST && pool.length < cellSize)) {
      const members = pool.splice(0, Math.min(cellSize, pool.length)).map((e) => e.id)
      // The champion is seated in any cell at or above its tier: the crown is
      // always contestable by whatever the structure sends up.
      const seatChampion = !!championId && !championSeated && tier >= championTier
      if (seatChampion) championSeated = true
      newCells.push({
        tier,
        candidateIds: seatChampion ? [championId!, ...members] : members,
        includesChampion: seatChampion,
      })
      if (pool.length < MIN_CAST) break
    }
  }

  // Crown rule: with nothing open and nothing planned, a sole element standing
  // strictly above every other pooled element is the apex — crown it.
  if (!championId && newCells.length === 0 && input.openCellTiers.length === 0) {
    const all = input.pool.filter((e) => e.tier >= 1)
    if (all.length >= 1) {
      const top = Math.max(...all.map((e) => e.tier))
      const atTop = all.filter((e) => e.tier === top)
      const below = all.filter((e) => e.tier < top)
      if (atTop.length === 1 && below.length > 0) {
        return { newCells, crownId: atTop[0]!.id }
      }
    }
  }

  return { newCells, crownId: null }
}

/**
 * Apply a cell's standings (best-first, from the carried tally) as a league
 * verdict: winner promotes, last relegates, middle holds. Conservation: exactly
 * one up, at most one down, per cell.
 */
export function leagueVerdict(standingsBestFirst: string[]): Verdict {
  if (standingsBestFirst.length === 0) return { promoteId: null, relegateId: null, holdIds: [] }
  if (standingsBestFirst.length === 1) {
    return { promoteId: standingsBestFirst[0]!, relegateId: null, holdIds: [] }
  }
  const promoteId = standingsBestFirst[0]!
  const relegateId = standingsBestFirst[standingsBestFirst.length - 1]!
  return { promoteId, relegateId, holdIds: standingsBestFirst.slice(1, -1) }
}
