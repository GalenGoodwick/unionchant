// Carried from cradle-election voting.test.ts (13/13 green there).
// Adapted: Ballot carries evaluatorId; Memory no longer tracks tier/status (UC does).

import { describe, it, expect } from 'vitest'
import { outcomeWeight, bordaPoints, tallyCell } from '@cmic/swarm'
import type { Memory, Ballot } from '@cmic/swarm'

const mem = (id: string, score?: number): Memory => ({
  id,
  kind: 'lesson',
  text: id,
  ...(score === undefined ? {} : { outcome: { pursued: '', result: '', score } }),
})

const ballot = (lensId: string, ranking: string[]): Ballot => ({
  evaluatorId: 'ai-1',
  lensId,
  ranking,
})

describe('outcomeWeight', () => {
  it('is neutral 1.0 with no outcome', () => expect(outcomeWeight(mem('a'))).toBe(1.0))
  it('rewards success up to 1.5', () => expect(outcomeWeight(mem('a', 1))).toBe(1.5))
  it('penalizes failure down to 0.5', () => expect(outcomeWeight(mem('a', 0))).toBe(0.5))
  it('clamps out-of-range scores', () => expect(outcomeWeight(mem('a', 9))).toBe(1.5))
})

describe('bordaPoints', () => {
  it('awards n-1 down to 0', () => {
    const p = bordaPoints(['x', 'y', 'z'])
    expect(p.get('x')).toBe(2)
    expect(p.get('y')).toBe(1)
    expect(p.get('z')).toBe(0)
  })
})

describe('tallyCell', () => {
  it('elects the consensus winner', () => {
    const cands = [mem('a'), mem('b'), mem('c')]
    // Two of three evaluators put 'b' first.
    const ballots: Ballot[] = [
      ballot('l1', ['b', 'c', 'a']),
      ballot('l2', ['b', 'a', 'c']),
      ballot('l3', ['a', 'c', 'b']),
    ]
    expect(tallyCell(cands, ballots).winnerId).toBe('b')
  })

  it('lets a strong outcome overturn a thin vote margin', () => {
    const cands = [mem('a'), mem('b', 1)] // b is proven-in-action
    // Wide margin: a wins raw 2-1 -> weighting cannot flip it.
    const wide: Ballot[] = [
      ballot('x', ['a', 'b']),
      ballot('y', ['a', 'b']),
      ballot('z', ['b', 'a']),
    ]
    expect(tallyCell(cands, wide).winnerId).toBe('a')

    // Even raw split -> b wins on grounding.
    const tie: Ballot[] = [ballot('x', ['a', 'b']), ballot('z', ['b', 'a'])]
    expect(tallyCell(cands, tie).winnerId).toBe('b')
  })

  it('keeps reality gripping zero-Borda candidates (+1 smoothing)', () => {
    // Two candidates, one ballot: loser has 0 Borda points. Without smoothing its
    // outcome weight would be erased entirely (0 * w = 0 regardless of w).
    const cands = [mem('a'), mem('b', 1)]
    const r = tallyCell(cands, [ballot('x', ['a', 'b'])])
    const b = r.standings.find((s) => s.memoryId === 'b')!
    expect(b.bordaPoints).toBe(0)
    expect(b.score).toBe(1.5) // (0 + 1) * 1.5 — the outcome signal survives
  })

  it('throws if an evaluator ranks its own lens (recusal)', () => {
    const cands = [mem('a'), mem('b')]
    const bad: Ballot[] = [ballot('a', ['a', 'b'])]
    expect(() => tallyCell(cands, bad)).toThrow(/recusal/)
  })

  it('throws on unknown candidates', () => {
    const cands = [mem('a'), mem('b')]
    expect(() => tallyCell(cands, [ballot('x', ['a', 'ghost'])])).toThrow(/unknown/)
  })

  it('is deterministic under equal scores (id tie-break)', () => {
    const cands = [mem('b'), mem('a')]
    const ballots: Ballot[] = [ballot('x', ['a', 'b']), ballot('y', ['b', 'a'])]
    expect(tallyCell(cands, ballots).winnerId).toBe('a')
  })
})
