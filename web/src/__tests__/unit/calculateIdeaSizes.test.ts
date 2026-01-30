import { describe, it, expect } from 'vitest'
import { calculateIdeaSizes } from '@/lib/voting'

describe('calculateIdeaSizes', () => {
  it('returns [] for 0 ideas', () => {
    expect(calculateIdeaSizes(0, 3)).toEqual([])
  })

  it('returns [5] for 5 ideas / 1 cell', () => {
    expect(calculateIdeaSizes(5, 1)).toEqual([5])
  })

  it('distributes evenly: 10 ideas / 2 cells = [5,5]', () => {
    expect(calculateIdeaSizes(10, 2)).toEqual([5, 5])
  })

  it('distributes unevenly: 11 ideas / 2 cells = [6,5]', () => {
    expect(calculateIdeaSizes(11, 2)).toEqual([6, 5])
  })

  it('distributes 7 ideas / 3 cells = [3,2,2]', () => {
    expect(calculateIdeaSizes(7, 3)).toEqual([3, 2, 2])
  })

  it('distributes 10 ideas / 3 cells = [4,3,3]', () => {
    expect(calculateIdeaSizes(10, 3)).toEqual([4, 3, 3])
  })

  it('all sizes sum to total ideas', () => {
    const sizes = calculateIdeaSizes(23, 5)
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(23)
    expect(sizes.length).toBe(5)
  })

  it('returns negative-free results for small ratios', () => {
    const sizes = calculateIdeaSizes(2, 5)
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(2)
    sizes.forEach(s => expect(s).toBeGreaterThanOrEqual(0))
  })
})
