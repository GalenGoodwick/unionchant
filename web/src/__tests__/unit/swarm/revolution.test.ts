// revolution.test.ts — the R1 gate: a FULL simulated swarm election, in-process,
// through the real engine (scheduler + lens + dock protocol + cradle tally).
// DESIGN.md §9 R1: "a full simulated 50-memory/1-AI revolution in vitest".

import { describe, it, expect } from 'vitest'
import { runSimulatedElection } from './sim'
import { buildDirective } from '@/lib/swarm/engine'
import { DEFAULT_SWARM_CONFIG, type Memory, type SwarmConfig } from '@/lib/swarm/engine'

const mem = (id: string, score?: number): Memory => ({
  id,
  kind: 'lesson',
  text: `memory ${id}`,
  ...(score === undefined ? {} : { outcome: { pursued: '', result: '', score } }),
})

const pool = (n: number) => Array.from({ length: n }, (_, i) => mem(`m${String(i).padStart(2, '0')}`))

const cfg = (over: Partial<SwarmConfig> = {}): SwarmConfig => ({
  ...DEFAULT_SWARM_CONFIG,
  quorum: 3,
  maxBallotsPerAiPerCell: 3,
  ...over,
})

describe('full swarm revolution — 50 memories, ONE evaluator (the dogfood case)', () => {
  const memories = [...pool(49), mem('m49', 0.9)] // one grounded memory in the pool
  const run = () => runSimulatedElection(memories, ['dogfood-ai'], cfg(), 7)

  it('elects exactly one champion from the full pool', () => {
    const r = run()
    expect(r.tiers[0]).toHaveLength(50)
    expect(r.tiers.at(-1)).toEqual([r.champion.memoryId])
  })

  it('matches the capacity math: tier-1 ballots = cells x quorum', () => {
    const r = run()
    // 50 memories / cellSize 5 = 10 cells; effective quorum = min(3, 1x3) = 3.
    const tier1Ballots = r.cellResults[0]!.reduce((n, c) => n + c.ballots.length, 0)
    expect(r.cellResults[0]).toHaveLength(10)
    expect(tier1Ballots).toBe(30)
  })

  it('assigns 3 DISTINCT lenses per cell even with one AI (multiplicity from lenses)', () => {
    const r = run()
    for (const tierLenses of r.lensesPerCell) {
      for (const cellLenses of tierLenses) {
        expect(new Set(cellLenses).size).toBe(cellLenses.length)
      }
    }
  })

  it('never lets a lens rank itself: no cell contains its own lens as candidate', () => {
    const r = run()
    for (const tier of r.cellResults) {
      for (const cell of tier) {
        for (const b of cell.ballots) {
          expect(cell.candidateIds).not.toContain(b.lensId)
        }
      }
    }
  })

  it('is deterministic under a fixed seed', () => {
    const a = runSimulatedElection(memories, ['dogfood-ai'], cfg(), 7)
    const b = runSimulatedElection(memories, ['dogfood-ai'], cfg(), 7)
    expect(a.champion.memoryId).toBe(b.champion.memoryId)
    expect(a.tiers).toEqual(b.tiers)
    expect(a.ballotsCast).toBe(b.ballotsCast)
  })
})

describe('multi-evaluator swarm', () => {
  it('two evaluators split the same election and still converge', () => {
    const r = runSimulatedElection(pool(50), ['ai-a', 'ai-b'], cfg(), 11)
    expect(r.tiers.at(-1)).toHaveLength(1)
    // Both evaluators actually worked: ballots from each appear.
    const evs = new Set(r.cellResults.flat().flatMap((c) => c.ballots.map((b) => b.evaluatorId)))
    expect(evs).toEqual(new Set(['ai-a', 'ai-b']))
  })

  it('five evaluators at full quorum 5 converge on 200 memories', () => {
    const r = runSimulatedElection(
      pool(200),
      ['a', 'b', 'c', 'd', 'e'],
      cfg({ quorum: 5, maxBallotsPerAiPerCell: 1 }),
      13,
    )
    expect(r.tiers[0]).toHaveLength(200)
    expect(r.tiers.at(-1)).toHaveLength(1)
    // With 5 evaluators and cap 1, no evaluator ever cast twice in one cell.
    for (const tier of r.cellResults) {
      for (const cell of tier) {
        const per = new Map<string, number>()
        for (const b of cell.ballots) per.set(b.evaluatorId, (per.get(b.evaluatorId) ?? 0) + 1)
        for (const n of per.values()) expect(n).toBe(1)
      }
    }
  })
})

describe('carried election semantics (cradle-election tournament tests)', () => {
  it('a grounded outcome can unseat an ungrounded favorite (the flywheel edge)', () => {
    const r = runSimulatedElection([mem('plain'), mem('proven', 1)], ['ai'], cfg(), 3)
    expect(r.champion.memoryId).toBe('proven')
  })

  it('boot directive leads with the champion, priorities in lineage order', () => {
    const memories = pool(6)
    const r = runSimulatedElection(memories, ['ai'], cfg(), 5)
    const textOf = (id: string) => memories.find((m) => m.id === id)?.text ?? id
    const directive = buildDirective(r.champion, textOf)
    expect(directive).toContain(r.champion.text)
    expect(directive.indexOf(r.champion.text)).toBeLessThan(directive.indexOf('Standing priorities'))
    expect(directive).toContain(`${r.tiers.length}-tier election over 6 project memories`)
  })
})
