// scheduler.test.ts — the dock dispatcher (new math: tested before ship).

import { describe, it, expect } from 'vitest'
import {
  effectiveQuorum,
  cellComplete,
  scheduleNextCell,
  chunkCells,
} from '@/lib/swarm/engine'
import { DEFAULT_SWARM_CONFIG, type CellSnapshot, type SwarmConfig } from '@/lib/swarm/engine'

const cfg = (over: Partial<SwarmConfig> = {}): SwarmConfig => ({ ...DEFAULT_SWARM_CONFIG, ...over })

const cell = (
  id: string,
  seq: number,
  ballots: string[] = [],
  docks: string[] = [],
): CellSnapshot => ({
  id,
  seq,
  candidateIds: ['m1', 'm2', 'm3', 'm4', 'm5'],
  ballots: ballots.map((evaluatorId) => ({ evaluatorId })),
  activeDocks: docks.map((evaluatorId) => ({ evaluatorId })),
})

describe('effectiveQuorum', () => {
  it('is the configured quorum with plenty of evaluators', () =>
    expect(effectiveQuorum(cfg({ quorum: 5 }), 10)).toBe(5))
  it('shrinks to evaluators x per-cell cap under scarcity', () =>
    expect(effectiveQuorum(cfg({ quorum: 5, maxBallotsPerAiPerCell: 3 }), 1)).toBe(3))
  it('never drops below 1', () =>
    expect(effectiveQuorum(cfg({ quorum: 5, maxBallotsPerAiPerCell: 0 }), 0)).toBe(1))
})

describe('scheduleNextCell', () => {
  it('resumes an already-held dock (idempotent turns)', () => {
    const cells = [cell('c1', 0), cell('c2', 1, [], ['me'])]
    expect(scheduleNextCell('me', cells, cfg(), 3)).toEqual({ kind: 'resume', cellId: 'c2' })
  })

  it('dispatches the neediest cell first, oldest on ties', () => {
    const cells = [cell('c1', 0, ['a', 'b']), cell('c2', 1, ['a']), cell('c3', 2, ['a'])]
    expect(scheduleNextCell('me', cells, cfg(), 3)).toEqual({ kind: 'dock', cellId: 'c2' })
  })

  it('skips cells saturated by ballots + in-flight docks', () => {
    const q3 = cfg({ quorum: 3, maxBallotsPerAiPerCell: 3 })
    // c1 has 2 ballots + 1 active dock = 3 in flight (quorum met without me)
    const cells = [cell('c1', 0, ['a', 'b'], ['c']), cell('c2', 1, ['a'])]
    expect(scheduleNextCell('me', cells, q3, 3)).toEqual({ kind: 'dock', cellId: 'c2' })
  })

  it('skips cells where I hit my per-cell ballot cap', () => {
    const q5 = cfg({ quorum: 5, maxBallotsPerAiPerCell: 2 })
    const cells = [cell('c1', 0, ['me', 'me']), cell('c2', 1, ['me'])]
    expect(scheduleNextCell('me', cells, q5, 3)).toEqual({ kind: 'dock', cellId: 'c2' })
  })

  it('waits when every open cell is saturated or capped', () => {
    const q1 = cfg({ quorum: 3, maxBallotsPerAiPerCell: 1 })
    const cells = [cell('c1', 0, ['me'])]
    const d = scheduleNextCell('me', cells, q1, 3)
    expect(d.kind).toBe('waiting')
  })

  it('reports tier complete when all cells are at quorum', () => {
    const q1 = cfg({ quorum: 1 })
    const cells = [cell('c1', 0, ['a'])]
    const d = scheduleNextCell('me', cells, q1, 3)
    expect(d).toEqual({ kind: 'waiting', reason: 'tier complete' })
  })
})

describe('one identity vote first — repeats only when no first-vote remains', () => {
  it('prefers a cell lacking my first vote even when another is needier', () => {
    const q5 = cfg({ quorum: 5, maxBallotsPerAiPerCell: 3 })
    // c1 has only MY ballot (1 total); c2 has 3 others' ballots, none mine.
    const cells = [cell('c1', 0, ['me']), cell('c2', 1, ['a', 'b', 'c'])]
    expect(scheduleNextCell('me', cells, q5, 4)).toEqual({ kind: 'dock', cellId: 'c2' })
  })

  it('returns for a repeat (lens identity) only when every cell has my first vote', () => {
    const q5 = cfg({ quorum: 5, maxBallotsPerAiPerCell: 3 })
    const cells = [cell('c1', 0, ['me']), cell('c2', 1, ['me', 'a'])]
    expect(scheduleNextCell('me', cells, q5, 4)).toEqual({ kind: 'dock', cellId: 'c1' })
  })
})

describe('cellComplete', () => {
  it('completes exactly at quorum', () => {
    expect(cellComplete(cell('c', 0, ['a', 'b']), 3)).toBe(false)
    expect(cellComplete(cell('c', 0, ['a', 'b', 'c']), 3)).toBe(true)
  })
})

describe('chunkCells', () => {
  it('chunks evenly at the cell size', () =>
    expect(chunkCells(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], 5)).toEqual([
      ['1', '2', '3', '4', '5'],
      ['6', '7', '8', '9', '10'],
    ]))
  it('absorbs a 1-2 remainder into the last cell (never strand tiny cells)', () => {
    expect(chunkCells(['1', '2', '3', '4', '5', '6', '7'], 5)).toEqual([
      ['1', '2', '3', '4', '5', '6', '7'],
    ])
    expect(chunkCells(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], 5)).toEqual([
      ['1', '2', '3', '4', '5'],
      ['6', '7', '8', '9', '10', '11', '12'],
    ])
  })
  it('keeps a 3+ remainder as its own cell', () =>
    expect(chunkCells(['1', '2', '3', '4', '5', '6', '7', '8'], 5)).toEqual([
      ['1', '2', '3', '4', '5'],
      ['6', '7', '8'],
    ]))
  it('passes small pools through whole', () => {
    expect(chunkCells(['1', '2', '3'], 5)).toEqual([['1', '2', '3']])
    expect(chunkCells([], 5)).toEqual([])
  })
})
