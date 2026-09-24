import { describe, it, expect } from 'vitest'
import { resolveTiedWinners } from '@/lib/voting'

describe('resolveTiedWinners', () => {
  it('returns the single idea when there is no tie', () => {
    expect(resolveTiedWinners(['a'])).toEqual(['a'])
  })

  it('advances both on a 2-way tie (unchanged behavior)', () => {
    expect(resolveTiedWinners(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('collapses a 3-way tie to exactly one winner', () => {
    const r = resolveTiedWinners(['a', 'b', 'c'])
    expect(r).toHaveLength(1)
    expect(['a', 'b', 'c']).toContain(r[0])
  })

  it('collapses a 5-way tie to exactly one winner', () => {
    expect(resolveTiedWinners(['a', 'b', 'c', 'd', 'e'])).toHaveLength(1)
  })

  it('never picks an idea outside the tied set', () => {
    for (let i = 0; i < 2000; i++) {
      const r = resolveTiedWinners(['x', 'y', 'z'])
      expect(['x', 'y', 'z']).toContain(r[0])
    }
  })

  it('can pick each tied idea over many runs (no starvation)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 3000; i++) seen.add(resolveTiedWinners(['a', 'b', 'c'])[0])
    expect(seen.size).toBe(3)
  })

  it('is roughly uniform across a 3-way tie', () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 }
    const N = 6000
    for (let i = 0; i < N; i++) counts[resolveTiedWinners(['a', 'b', 'c'])[0]]++
    for (const k of ['a', 'b', 'c']) {
      expect(counts[k]).toBeGreaterThan(N / 3 - N * 0.08)
      expect(counts[k]).toBeLessThan(N / 3 + N * 0.08)
    }
  })

  it('handles an empty set defensively', () => {
    expect(resolveTiedWinners([])).toEqual([])
  })
})
