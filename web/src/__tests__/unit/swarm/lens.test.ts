// lens.test.ts — the assigned perspective (new math: tested before ship).

import { describe, it, expect } from 'vitest'
import { drawLens, assignLens, mulberry32, type LensPools } from '@/lib/swarm/engine'

const pools = (over: Partial<LensPools> = {}): LensPools => ({
  outsidePool: [],
  sameTierOtherCells: [],
  predecessorPool: [],
  ...over,
})

describe('drawLens', () => {
  it('draws from the outside pool first', () => {
    const p = pools({ outsidePool: ['out1'], sameTierOtherCells: ['peer1'], predecessorPool: ['old1'] })
    expect(drawLens(p, ['c1'], [], mulberry32(1))).toBe('out1')
  })

  it('falls back to other cells in the same tier (the tier-1 case)', () => {
    const p = pools({ sameTierOtherCells: ['peer1'], predecessorPool: ['old1'] })
    expect(drawLens(p, ['c1'], [], mulberry32(1))).toBe('peer1')
  })

  it('falls back to the predecessor pool last', () => {
    const p = pools({ predecessorPool: ['old1'] })
    expect(drawLens(p, ['c1'], [], mulberry32(1))).toBe('old1')
  })

  it('never assigns a cell candidate as the lens (structural recusal)', () => {
    const p = pools({ outsidePool: ['c1', 'c2', 'safe'] })
    for (let seed = 0; seed < 20; seed++) {
      expect(drawLens(p, ['c1', 'c2'], [], mulberry32(seed))).toBe('safe')
    }
  })

  it('excludes lenses already used on this cell (fresh voice per dock)', () => {
    const p = pools({ outsidePool: ['a', 'b'] })
    expect(drawLens(p, [], ['a'], mulberry32(1))).toBe('b')
  })

  it('skips an exhausted higher pool rather than stalling on it', () => {
    // Outside pool exists but is fully used -> must fall through to peers.
    const p = pools({ outsidePool: ['a'], sameTierOtherCells: ['peer1'] })
    expect(drawLens(p, [], ['a'], mulberry32(1))).toBe('peer1')
  })

  it('returns null only when every pool is exhausted', () => {
    const p = pools({ outsidePool: ['a'], sameTierOtherCells: ['b'], predecessorPool: ['c'] })
    expect(drawLens(p, [], ['a', 'b', 'c'], mulberry32(1))).toBeNull()
  })

  it('is deterministic under a seed and independent of pool order', () => {
    const rand1 = mulberry32(42)
    const rand2 = mulberry32(42)
    const a = drawLens(pools({ outsidePool: ['x', 'y', 'z'] }), [], [], rand1)
    const b = drawLens(pools({ outsidePool: ['z', 'x', 'y'] }), [], [], rand2)
    expect(a).toBe(b)
  })
})

describe('assignLens — the degenerate floor (single-cell first tier)', () => {
  it('prefers an out-of-cell lens when any pool has one', () => {
    const a = assignLens(pools({ predecessorPool: ['old1'] }), ['c1', 'c2'], [], mulberry32(1))
    expect(a).toEqual({ lensId: 'old1', inCell: false })
  })

  it('relaxes used-lens exclusion before falling into the cell', () => {
    const a = assignLens(pools({ outsidePool: ['a'] }), ['c1'], ['a'], mulberry32(1))
    expect(a).toEqual({ lensId: 'a', inCell: false })
  })

  it('falls to an in-cell recused lens when NO memory exists outside the cell', () => {
    const a = assignLens(pools(), ['c1', 'c2', 'c3'], [], mulberry32(1))
    expect(a.inCell).toBe(true)
    expect(['c1', 'c2', 'c3']).toContain(a.lensId)
  })

  it('in-cell floor prefers members not yet worn as a lens', () => {
    const a = assignLens(pools(), ['c1', 'c2'], ['c1'], mulberry32(1))
    expect(a).toEqual({ lensId: 'c2', inCell: true })
  })

  it('throws only for an empty cell', () => {
    expect(() => assignLens(pools(), [], [], mulberry32(1))).toThrow(/empty cell/)
  })
})
