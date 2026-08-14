// expansion.test.ts — the continuous chant planner (new math: tested before ship).

import { describe, it, expect } from 'vitest'
import { planExpansion, type ExpansionInput } from '@/lib/swarm/engine/expansion'

const ids = (n: number, prefix = 'm') => Array.from({ length: n }, (_, i) => `${prefix}${i}`)
const base = (over: Partial<ExpansionInput> = {}): ExpansionInput => ({
  pendingIds: [],
  advancing: [],
  openCells: 0,
  championId: null,
  championTier: 0,
  cellSize: 5,
  ...over,
})

describe('E1 — pool forms full tier-1 cells', () => {
  it('chunks 12 pending into 2 cells, 2 wait for inflow', () => {
    const p = planExpansion(base({ pendingIds: ids(12) }))
    expect(p.newCells).toHaveLength(2)
    expect(p.newCells.every((c) => c.tier === 1 && c.candidateIds.length === 5)).toBe(true)
    expect(p.crownId).toBeNull() // remainder present -> not converged...
  })

  it('a starved pool forms nothing', () => {
    const p = planExpansion(base({ pendingIds: ids(4) }))
    expect(p.newCells).toHaveLength(0)
  })
})

describe('E2 — full same-tier winner groups climb', () => {
  it('7 tier-1 winners -> one tier-2 cell of the 5 oldest, 2 remain climbers', () => {
    const p = planExpansion(base({ advancing: ids(7, 'w').map((id) => ({ id, tier: 1 })), openCells: 1 }))
    expect(p.newCells).toHaveLength(1)
    expect(p.newCells[0]).toMatchObject({ tier: 2, includesChampion: false })
    expect(p.newCells[0]!.candidateIds).toEqual(['w0', 'w1', 'w2', 'w3', 'w4'])
  })
})

describe('E3 — convergence', () => {
  it('never acts while cells are open', () => {
    const p = planExpansion(base({ advancing: [{ id: 'a', tier: 2 }], openCells: 1 }))
    expect(p.newCells).toHaveLength(0)
    expect(p.crownId).toBeNull()
  })

  it('never crowns while fresh cells were just planned', () => {
    const p = planExpansion(base({ pendingIds: ids(5), advancing: [{ id: 'a', tier: 2 }] }))
    expect(p.newCells).toHaveLength(1)
    expect(p.crownId).toBeNull()
  })

  it('two climbers of mixed tier form the final cell, highest tier leads', () => {
    const p = planExpansion(base({ advancing: [{ id: 'lo', tier: 1 }, { id: 'hi', tier: 2 }] }))
    expect(p.newCells).toHaveLength(1)
    expect(p.newCells[0]!.tier).toBe(3)
    expect(p.newCells[0]!.candidateIds).toEqual(['hi', 'lo'])
  })

  it('a lone climber at convergence is crowned', () => {
    const p = planExpansion(base({ advancing: [{ id: 'last', tier: 3 }] }))
    expect(p.newCells).toHaveLength(0)
    expect(p.crownId).toBe('last')
  })

  it('caps the final cell at 7, dropping the lowest tiers', () => {
    const adv = [
      ...ids(5, 'hi').map((id) => ({ id, tier: 3 })).slice(0, 4),
      ...ids(4, 'lo').map((id) => ({ id, tier: 1 })),
    ]
    const p = planExpansion(base({ advancing: adv }))
    expect(p.newCells).toHaveLength(1)
    expect(p.newCells[0]!.candidateIds).toHaveLength(7)
    // all four tier-3 climbers seated before tier-1
    expect(p.newCells[0]!.candidateIds.slice(0, 4).every((id) => id.startsWith('hi'))).toBe(true)
  })
})

describe('E3 with a standing champion — defense', () => {
  it('champion + 2 challengers -> defense cell with the champion seated', () => {
    const p = planExpansion(base({
      championId: 'champ', championTier: 3,
      advancing: [{ id: 'c1', tier: 1 }, { id: 'c2', tier: 2 }],
    }))
    expect(p.newCells).toHaveLength(1)
    const cell = p.newCells[0]!
    expect(cell.includesChampion).toBe(true)
    expect(cell.candidateIds[0]).toBe('champ')
    expect(cell.candidateIds).toHaveLength(3)
    expect(cell.tier).toBe(4) // max(championTier 3, challengers) + 1
  })

  it('a lone challenger waits — no 1v1 churn against the champion', () => {
    const p = planExpansion(base({ championId: 'champ', championTier: 2, advancing: [{ id: 'c1', tier: 1 }] }))
    expect(p.newCells).toHaveLength(0)
    expect(p.crownId).toBeNull()
  })

  it('defense cell caps at 7 including the champion', () => {
    const p = planExpansion(base({
      championId: 'champ', championTier: 2,
      advancing: ids(9, 'c').map((id, i) => ({ id, tier: (i % 3) + 1 })),
    }))
    expect(p.newCells[0]!.candidateIds).toHaveLength(7)
    expect(p.newCells[0]!.candidateIds[0]).toBe('champ')
  })
})

describe('batch equivalence — with no inflow the rules ARE the old tournament', () => {
  it('drives 50 memories to a single crown through E1/E2/E3', () => {
    // Simulate: every planned cell completes, first candidate wins.
    let pending = ids(50)
    let advancing: { id: string; tier: number }[] = []
    let championId: string | null = null
    let championTier = 0
    let guard = 0
    const tiersSeen: number[] = []

    while (!championId) {
      if (++guard > 50) throw new Error('did not converge')
      const plan = planExpansion(base({ pendingIds: pending, advancing, championId, championTier }))
      if (plan.crownId) { championId = plan.crownId; break }
      expect(plan.newCells.length).toBeGreaterThan(0) // must always make progress
      // "Complete" every planned cell: winner = first candidate.
      const planned = new Set(plan.newCells.flatMap((c) => c.candidateIds))
      pending = pending.filter((id) => !planned.has(id))
      advancing = advancing.filter((a) => !planned.has(a.id))
      for (const c of plan.newCells) {
        tiersSeen.push(c.tier)
        advancing.push({ id: c.candidateIds[0]!, tier: c.tier })
      }
    }

    expect(championId).toBeTruthy()
    // 50 -> 10 cells t1 -> 10 winners -> 2 cells t2 -> 2 winners -> 1 final t3 -> crown
    expect(tiersSeen.filter((t) => t === 1)).toHaveLength(10)
    expect(tiersSeen.filter((t) => t === 2)).toHaveLength(2)
    expect(tiersSeen.filter((t) => t === 3)).toHaveLength(1)
  })

  it('continues past the crown: inflow builds challengers, defense re-elects', () => {
    // Champion stands; 10 new memories arrive.
    let plan = planExpansion(base({ pendingIds: ids(10, 'new'), championId: 'champ', championTier: 3 }))
    expect(plan.newCells).toHaveLength(2) // two fresh tier-1 cells
    // Their winners become challengers; at convergence the champion is seated.
    plan = planExpansion(base({
      championId: 'champ', championTier: 3,
      advancing: [{ id: 'new0', tier: 1 }, { id: 'new5', tier: 1 }],
    }))
    expect(plan.newCells).toHaveLength(1)
    expect(plan.newCells[0]!.includesChampion).toBe(true)
    expect(plan.newCells[0]!.candidateIds).toEqual(['champ', 'new0', 'new5'])
  })
})
