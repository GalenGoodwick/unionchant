// league.test.ts — the fluid chant planner (new math: tested before ship).

import { describe, it, expect } from 'vitest'
import { planLeague, leagueVerdict, reviewCooldownMs, type LeagueInput } from '@/lib/swarm/engine/league'
import { mulberry32 } from '@/lib/swarm/engine/lens'

const els = (n: number, tier: number, prefix = 'e', restless = true) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${tier}-${i}`, tier, restless }))

const base = (over: Partial<LeagueInput> = {}): LeagueInput => ({
  pool: [],
  openCellTiers: [],
  clocks: [],
  championId: null,
  championTier: 0,
  championInOpenCell: false,
  cellSize: 5,
  reviewBaseMs: 1000,
  rand: mulberry32(7),
  ...over,
})

const ready = (tier: number) => ({ tier, msSinceLastVerdict: Infinity })
const cold = (tier: number, ms: number) => ({ tier, msSinceLastVerdict: ms })

describe('stability gradient — R(T) doubles per tier', () => {
  it('cooldown grows with height', () => {
    expect(reviewCooldownMs(1, 1000)).toBe(1000)
    expect(reviewCooldownMs(2, 1000)).toBe(2000)
    expect(reviewCooldownMs(4, 1000)).toBe(8000)
  })

  it('a tier still cooling does not recast; a ready tier does', () => {
    const p = planLeague(base({
      pool: [...els(5, 1), ...els(5, 2)],
      clocks: [cold(1, 500), ready(2)], // tier 1 needs 1000ms, only 500 elapsed
    }))
    expect(p.newCells).toHaveLength(1)
    expect(p.newCells[0]!.tier).toBe(2)
  })
})

describe('recast — ephemeral cells, fresh mixtures', () => {
  it('deals a ready tier pool into cells of 5', () => {
    const p = planLeague(base({ pool: els(12, 1), clocks: [ready(1)] }))
    // 12 -> two cells of 5; the leftover 2 also cast (MIN_CAST, never stuck)
    expect(p.newCells.map((c) => c.candidateIds.length).sort()).toEqual([2, 5, 5])
    expect(p.newCells.every((c) => c.tier === 1)).toBe(true)
  })

  it('T2+ waits for a FULL classic batch — a ready pair does not cast', () => {
    // tier 3 cooldown = 4000ms; ready but not long-stale (< 4x)
    const p = planLeague(base({ pool: els(2, 3), clocks: [cold(3, 5000)] }))
    expect(p.newCells).toHaveLength(0)
  })

  it('T2+ casts a full cell of 5 the moment the batch exists', () => {
    const p = planLeague(base({ pool: els(5, 2), clocks: [ready(2)] }))
    expect(p.newCells).toHaveLength(1)
    expect(p.newCells[0]!.candidateIds).toHaveLength(5)
  })

  it('drought escape: a LONG-stale higher tier casts what it has', () => {
    // tier 3 cooldown 4000ms; 4x = 16000ms — waited 20000ms
    const p = planLeague(base({ pool: els(2, 3), clocks: [cold(3, 20000)] }))
    expect(p.newCells).toHaveLength(1)
    expect(p.newCells[0]!.candidateIds).toHaveLength(2)
  })

  it('the floor (T1) still casts small — churn is its job', () => {
    const p = planLeague(base({ pool: els(2, 1), clocks: [ready(1)] }))
    expect(p.newCells).toHaveLength(1)
  })

  it('a lone element cannot form a cell', () => {
    const p = planLeague(base({ pool: els(1, 2), clocks: [ready(2)] }))
    expect(p.newCells).toHaveLength(0)
  })

  it('shuffles differently under different seeds (anti-pocket)', () => {
    const a = planLeague(base({ pool: els(10, 1), clocks: [ready(1)], rand: mulberry32(1) }))
    const b = planLeague(base({ pool: els(10, 1), clocks: [ready(1)], rand: mulberry32(2) }))
    expect(a.newCells[0]!.candidateIds).not.toEqual(b.newCells[0]!.candidateIds)
    // deterministic under the same seed
    const a2 = planLeague(base({ pool: els(10, 1), clocks: [ready(1)], rand: mulberry32(1) }))
    expect(a.newCells).toEqual(a2.newCells)
  })
})

describe('champion seating — the crown is always contestable', () => {
  it('is seated in a recast at its own tier', () => {
    const p = planLeague(base({
      pool: els(5, 3), championId: 'champ', championTier: 3, clocks: [ready(3)],
    }))
    expect(p.newCells[0]!.includesChampion).toBe(true)
    expect(p.newCells[0]!.candidateIds[0]).toBe('champ')
    expect(p.newCells[0]!.candidateIds).toHaveLength(6)
  })

  it('holds at most one open seat across simultaneous recasts', () => {
    const p = planLeague(base({
      pool: [...els(5, 3), ...els(5, 3, 'x')], championId: 'champ', championTier: 3, clocks: [ready(3)],
    }))
    expect(p.newCells.filter((c) => c.includesChampion)).toHaveLength(1)
  })

  it('is not dragged into cells below its tier', () => {
    const p = planLeague(base({
      pool: els(5, 1), championId: 'champ', championTier: 3, clocks: [ready(1)],
    }))
    expect(p.newCells[0]!.includesChampion).toBe(false)
  })

  it('already seated in an open cell -> recasts form without it', () => {
    const p = planLeague(base({
      pool: els(5, 3), championId: 'champ', championTier: 3, championInOpenCell: true, clocks: [ready(3)],
    }))
    expect(p.newCells[0]!.includesChampion).toBe(false)
  })
})

describe('crown rule — sole apex above a living structure, immediately', () => {
  it('crowns a lone element standing strictly above the rest', () => {
    const p = planLeague(base({ pool: [{ id: 'apex', tier: 3, restless: false }, ...els(3, 1)], clocks: [cold(1, 0)] }))
    expect(p.crownId).toBe('apex')
  })

  it('crowns EVEN WHILE lower tiers churn — the floor never blocks the throne', () => {
    const open = planLeague(base({ pool: [{ id: 'apex', tier: 3, restless: false }, ...els(3, 1)], openCellTiers: [1], clocks: [cold(1, 0)] }))
    expect(open.crownId).toBe('apex')
    // recasts planned at T1 in the same tick: crown still lands, cells still form
    const planned = planLeague(base({ pool: [{ id: 'apex', tier: 3, restless: false }, ...els(5, 1)], clocks: [ready(1)] }))
    expect(planned.newCells.length).toBeGreaterThan(0)
    expect(planned.crownId).toBe('apex')
  })

  it('no crown when an open cell reaches the apex height (contested from below)', () => {
    const p = planLeague(base({ pool: [{ id: 'apex', tier: 3, restless: false }], openCellTiers: [3], clocks: [] }))
    expect(p.crownId).toBeNull()
  })

  it('no crown when the top tier is contested in the pool', () => {
    const p = planLeague(base({ pool: [{ id: 'a', tier: 3, restless: true }, { id: 'b', tier: 3, restless: true }], clocks: [cold(3, 0)] }))
    expect(p.crownId).toBeNull()
  })

  it('a lone element with NO structure beneath is not crowned (nothing was won)', () => {
    const p = planLeague(base({ pool: [{ id: 'only', tier: 1, restless: true }], clocks: [] }))
    expect(p.crownId).toBeNull()
  })
})

describe('the rest law — a sorted structure sleeps', () => {
  it('a tier with only settled elements does NOT recast, even when ready', () => {
    const p = planLeague(base({ pool: els(5, 1, 'e', false), clocks: [ready(1)] }))
    expect(p.newCells).toHaveLength(0)
  })

  it('one restless arrival wakes the tier — settled neighbors join the cell', () => {
    const pool = [...els(4, 1, 'settled', false), { id: 'fresh', tier: 1, restless: true }]
    const p = planLeague(base({ pool, clocks: [ready(1)] }))
    expect(p.newCells).toHaveLength(1)
    expect(p.newCells[0]!.candidateIds).toHaveLength(5) // the field convenes around the newcomer
  })

  it('rest at one tier does not block a restless neighbor tier', () => {
    const p = planLeague(base({
      pool: [...els(5, 1, 'settled', false), ...els(5, 2, 'fresh', true)],
      clocks: [ready(1), ready(2)],
    }))
    expect(p.newCells).toHaveLength(1)
    expect(p.newCells[0]!.tier).toBe(2)
  })
})

describe('leagueVerdict — conservation: one up, at most one down', () => {
  it('winner promotes, last relegates, middle holds', () => {
    const v = leagueVerdict(['w', 'm1', 'm2', 'm3', 'l'])
    expect(v).toEqual({ promoteId: 'w', relegateId: 'l', holdIds: ['m1', 'm2', 'm3'] })
  })

  it('a pair: one up, one down, none held', () => {
    expect(leagueVerdict(['w', 'l'])).toEqual({ promoteId: 'w', relegateId: 'l', holdIds: [] })
  })

  it('degenerate single survives upward', () => {
    expect(leagueVerdict(['only'])).toEqual({ promoteId: 'only', relegateId: null, holdIds: [] })
  })
})

describe('percolation — the wipe frees capacity and winners rise', () => {
  it('drives a seeded pool to a crowned apex through repeated recast/verdict rounds', () => {
    // 25 elements at tier 1; simulate rounds: plan -> verdict per cell -> apply.
    let pool = els(25, 1)
    const rand = mulberry32(42)
    let champion: string | null = null
    let guard = 0
    while (!champion) {
      if (++guard > 200) throw new Error('did not converge')
      const plan = planLeague(base({ pool, clocks: [1, 2, 3, 4, 5, 6].map(ready), rand }))
      if (plan.crownId) { champion = plan.crownId; break }
      expect(plan.newCells.length).toBeGreaterThan(0)
      const moved = new Map<string, number>()
      for (const cell of plan.newCells) {
        // deterministic stand-in tally: alphabetical = standings order
        const standings = [...cell.candidateIds].sort()
        const v = leagueVerdict(standings)
        if (v.promoteId) moved.set(v.promoteId, cell.tier + 1)
        if (v.relegateId) moved.set(v.relegateId, Math.max(0, cell.tier - 1))
        for (const h of v.holdIds) moved.set(h, cell.tier)
      }
      const held = new Set(plan.newCells.flatMap((c) => {
        const st = [...c.candidateIds].sort(); return st.slice(1, -1)
      }))
      pool = pool
        .map((e) => ({ ...e, tier: moved.get(e.id) ?? e.tier, restless: moved.has(e.id) ? !held.has(e.id) : e.restless }))
        .filter((e) => e.tier >= 1) // relegated below floor -> dormant, out of the pool
    }
    expect(champion).toBeTruthy()
  })
})
