// league.test.ts — the fluid chant planner (new math: tested before ship).

import { describe, it, expect } from 'vitest'
import { planLeague, leagueVerdict, reviewCooldownMs, type LeagueInput } from '@/lib/swarm/engine/league'
import { mulberry32 } from '@/lib/swarm/engine/lens'

const els = (n: number, tier: number, prefix = 'e') =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${tier}-${i}`, tier }))

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

  it('a stale pair still deliberates (never stuck below cellSize)', () => {
    const p = planLeague(base({ pool: els(2, 3), clocks: [ready(3)] }))
    expect(p.newCells).toHaveLength(1)
    expect(p.newCells[0]!.candidateIds).toHaveLength(2)
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

describe('crown rule — sole apex above a living structure', () => {
  it('crowns a lone element standing strictly above the rest', () => {
    const p = planLeague(base({ pool: [{ id: 'apex', tier: 3 }, ...els(3, 1)], clocks: [cold(1, 0)] }))
    expect(p.crownId).toBe('apex')
  })

  it('no crown while cells are open or planned', () => {
    const open = planLeague(base({ pool: [{ id: 'apex', tier: 3 }, ...els(3, 1)], openCellTiers: [1], clocks: [cold(1, 0)] }))
    expect(open.crownId).toBeNull()
    const planned = planLeague(base({ pool: [{ id: 'apex', tier: 3 }, ...els(5, 1)], clocks: [ready(1)] }))
    expect(planned.crownId).toBeNull()
  })

  it('no crown when the top tier is contested', () => {
    const p = planLeague(base({ pool: [{ id: 'a', tier: 3 }, { id: 'b', tier: 3 }], clocks: [cold(3, 0)] }))
    expect(p.crownId).toBeNull()
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
      pool = pool
        .map((e) => ({ ...e, tier: moved.get(e.id) ?? e.tier }))
        .filter((e) => e.tier >= 1) // relegated below floor -> dormant, out of the pool
    }
    expect(champion).toBeTruthy()
  })
})
