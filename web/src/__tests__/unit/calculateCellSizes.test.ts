import { describe, it, expect } from 'vitest'
import { calculateCellSizes } from '@/lib/voting'

describe('calculateCellSizes', () => {
  it('returns [0] for 0 participants', () => {
    expect(calculateCellSizes(0)).toEqual([0])
  })

  it('returns [1] for 1 participant', () => {
    expect(calculateCellSizes(1)).toEqual([1])
  })

  it('returns [2] for 2 participants', () => {
    expect(calculateCellSizes(2)).toEqual([2])
  })

  it('returns [3] for 3 participants', () => {
    expect(calculateCellSizes(3)).toEqual([3])
  })

  it('returns [4] for 4 participants', () => {
    expect(calculateCellSizes(4)).toEqual([4])
  })

  it('returns [5] for 5 participants (perfect division)', () => {
    expect(calculateCellSizes(5)).toEqual([5])
  })

  it('returns [6] for 6 participants (remainder 1 absorbed)', () => {
    expect(calculateCellSizes(6)).toEqual([6])
  })

  it('returns [7] for 7 participants (remainder 2 absorbed)', () => {
    expect(calculateCellSizes(7)).toEqual([7])
  })

  it('returns [5,3] for 8 participants (remainder 3 = separate cell)', () => {
    expect(calculateCellSizes(8)).toEqual([5, 3])
  })

  it('returns [5,4] for 9 participants (remainder 4 = separate cell)', () => {
    expect(calculateCellSizes(9)).toEqual([5, 4])
  })

  it('returns [5,5] for 10 participants (perfect division)', () => {
    expect(calculateCellSizes(10)).toEqual([5, 5])
  })

  it('returns [5,6] for 11 participants (remainder 1 absorbed)', () => {
    expect(calculateCellSizes(11)).toEqual([5, 6])
  })

  it('returns [5,5,5] for 15 participants (perfect division)', () => {
    expect(calculateCellSizes(15)).toEqual([5, 5, 5])
  })

  it('handles 40 participants: all sizes sum to 40, all cells 3-7', () => {
    const sizes = calculateCellSizes(40)
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(40)
    sizes.forEach(s => {
      expect(s).toBeGreaterThanOrEqual(3)
      expect(s).toBeLessThanOrEqual(7)
    })
  })

  it('handles 100 participants: all sizes sum to 100, all cells 3-7', () => {
    const sizes = calculateCellSizes(100)
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(100)
    sizes.forEach(s => {
      expect(s).toBeGreaterThanOrEqual(3)
      expect(s).toBeLessThanOrEqual(7)
    })
  })
})
