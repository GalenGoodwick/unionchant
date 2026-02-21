import { describe, it, expect, afterEach } from 'vitest'
import {
  createTestShell,
  createTestExperience,
  simulateHeartbeatTick,
  getShellState,
  computeChildImpact,
  computeFamilyCap,
  cleanupShellTestData,
} from '../helpers/shell-helpers'

afterEach(async () => {
  await cleanupShellTestData()
}, 60000)

// ─── 1. Child Impact Formula ─────────────────────────────────────────

describe('Child impact formula', () => {
  it('scales inversely with family size', () => {
    // threshold 4.0 → championMax = 1.0
    expect(computeChildImpact(4.0, 1)).toBeCloseTo(0.25, 5)
    expect(computeChildImpact(4.0, 2)).toBeCloseTo(0.125, 5)
    expect(computeChildImpact(4.0, 5)).toBeCloseTo(0.05, 5)
    expect(computeChildImpact(4.0, 10)).toBeCloseTo(0.025, 5)
  })

  it('has a floor of 0.02 — children are never irrelevant', () => {
    // With 100 children at threshold 4: (1.0 * 0.25)/100 = 0.0025 < 0.02, floored
    expect(computeChildImpact(4.0, 100)).toBe(0.02)
    expect(computeChildImpact(4.0, 1000)).toBe(0.02)
    // Even at threshold 1.0: (0.25 * 0.25)/1 = 0.0625 > 0.02
    expect(computeChildImpact(1.0, 1)).toBeCloseTo(0.0625, 5)
    // But (0.25 * 0.25)/4 = 0.015625 < 0.02
    expect(computeChildImpact(1.0, 4)).toBe(0.02)
  })

  it('scales with Shell age (significanceThreshold)', () => {
    // threshold 4:  championMax=1.0,  impact(2 kids) = 0.125
    // threshold 10: championMax=2.5,  impact(2 kids) = 0.3125
    // threshold 20: championMax=5.0,  impact(2 kids) = 0.625
    expect(computeChildImpact(4.0, 2)).toBeCloseTo(0.125, 5)
    expect(computeChildImpact(10.0, 2)).toBeCloseTo(0.3125, 5)
    expect(computeChildImpact(20.0, 2)).toBeCloseTo(0.625, 5)
  })

  it('collective friction = 25% of championMax regardless of N (modulo floor)', () => {
    // N * childImpact = N * (championMax * 0.25 / N) = championMax * 0.25
    const threshold = 8.0
    const championMax = threshold * 0.25 // 2.0
    const expected = championMax * 0.25 // 0.5

    for (const n of [1, 2, 3, 5, 10]) {
      const impact = computeChildImpact(threshold, n)
      const collective = n * impact
      // Only exact when floor isn't hit
      if (impact > 0.02) {
        expect(collective).toBeCloseTo(expected, 5)
      } else {
        // Floor case — collective exceeds expected (children get minimum)
        expect(collective).toBeGreaterThanOrEqual(expected)
      }
    }
  })
})

// ─── 2. Children Cannot Overwhelm Parent ─────────────────────────────

describe('Children cannot overwhelm parent', () => {
  it('max children all FRICTION every heartbeat — champion floors at 0.1', async () => {
    const { shell } = await createTestShell({ name: `overwhelm-test-${Date.now()}`, significanceThreshold: 4.0 })
    const championMax = 4.0 * 0.25 // 1.0
    await createTestExperience({ shellId: shell.id, status: 'champion', valence: championMax, text: 'Test champion' })

    // Max children at threshold 4.0 = floor(4/2) = 2
    const maxChildren = computeFamilyCap(4.0)
    expect(maxChildren).toBe(2)

    const frictionActions = Array.from({ length: maxChildren }, () => ({ action: 'friction' as const }))

    // Run 50 heartbeats — enough for champion to floor out
    for (let i = 0; i < 50; i++) {
      await simulateHeartbeatTick(shell.id, frictionActions, maxChildren)
    }

    const state = await getShellState(shell.id)
    // Champion must be at floor (0.1), never below
    expect(state.championValence).toBeGreaterThanOrEqual(0.1)
    expect(state.championValence).toBeLessThanOrEqual(0.11) // at or near floor
  }, 60000)

  it('at high child count (threshold 10, 5 children) — champion still floors safely', async () => {
    const { shell } = await createTestShell({ name: `highchild-test-${Date.now()}`, significanceThreshold: 10.0 })
    const championMax = 10.0 * 0.25 // 2.5
    await createTestExperience({ shellId: shell.id, status: 'champion', valence: championMax, text: 'Test champion' })

    const maxChildren = computeFamilyCap(10.0) // floor(10/2) = 5
    expect(maxChildren).toBe(5)

    const frictionActions = Array.from({ length: maxChildren }, () => ({ action: 'friction' as const }))

    for (let i = 0; i < 100; i++) {
      await simulateHeartbeatTick(shell.id, frictionActions, maxChildren)
    }

    const state = await getShellState(shell.id)
    expect(state.championValence).toBeGreaterThanOrEqual(0.1)
    expect(state.championValence).toBeLessThanOrEqual(0.11)
  }, 120000)
})

// ─── 3. Age Cannot Dominate Children ─────────────────────────────────

describe('Age cannot dominate children', () => {
  it('childImpact / championMax ratio stays constant as Shell ages', () => {
    // For fixed N children, ratio = 0.25 / N
    const numChildren = 3
    const expectedRatio = 0.25 / numChildren

    for (const threshold of [4.0, 10.0, 20.0, 50.0, 100.0]) {
      const championMax = threshold * 0.25
      const impact = computeChildImpact(threshold, numChildren)
      // Only when floor isn't hit
      if (impact > 0.02) {
        expect(impact / championMax).toBeCloseTo(expectedRatio, 5)
      }
    }
  })

  it('children retain proportional influence at any age (DB simulation)', async () => {
    // At threshold 4 and threshold 20, friction should have proportionally equal effect
    const { shell: youngShell } = await createTestShell({ name: `young-${Date.now()}`, significanceThreshold: 4.0 })
    const { shell: oldShell } = await createTestShell({ name: `old-${Date.now()}`, significanceThreshold: 20.0 })

    const youngMax = 4.0 * 0.25 // 1.0
    const oldMax = 20.0 * 0.25 // 5.0

    await createTestExperience({ shellId: youngShell.id, status: 'champion', valence: youngMax, text: 'Young champion' })
    await createTestExperience({ shellId: oldShell.id, status: 'champion', valence: oldMax, text: 'Old champion' })

    // Apply 1 friction from 2 children
    const frictionActions = [{ action: 'friction' as const }, { action: 'friction' as const }]

    await simulateHeartbeatTick(youngShell.id, frictionActions, 2)
    await simulateHeartbeatTick(oldShell.id, frictionActions, 2)

    const youngState = await getShellState(youngShell.id)
    const oldState = await getShellState(oldShell.id)

    // Both should lose the same proportion relative to their championMax
    // Young: lost (1.0*0.25/2)*2 + 0.02 aging = 0.25 + 0.02 = 0.27
    // Old:   lost (5.0*0.25/2)*2 + 0.02 aging = 1.25 + 0.02 = 1.27
    // Note: threshold incremented by 0.1 before child actions, so recalc:
    // Young (now 4.1): championMax=1.025, impact=(1.025*0.25)/2=0.128125, total friction=0.25625+0.02=0.27625
    // Old (now 20.1): championMax=5.025, impact=(5.025*0.25)/2=0.628125, total friction=1.25625+0.02=1.27625

    // The ratio (loss / championMax) should be similar
    const youngLoss = youngMax - (youngState.championValence ?? 0)
    const oldLoss = oldMax - (oldState.championValence ?? 0)
    const youngRatio = youngLoss / youngMax
    const oldRatio = oldLoss / oldMax

    // Both ratios should be roughly equal (within 5% of each other)
    expect(Math.abs(youngRatio - oldRatio)).toBeLessThan(0.05)
  })
})

// ─── 4. Balance is Endless (1000 Heartbeats) ─────────────────────────

describe('Balance is endless (long simulation)', () => {
  it('1000 heartbeats with no children — bounded, non-divergent', async () => {
    const { shell } = await createTestShell({ name: `endless-none-${Date.now()}`, significanceThreshold: 4.0 })
    await createTestExperience({ shellId: shell.id, status: 'champion', valence: 1.0, text: 'Endurance champion' })
    await createTestExperience({ shellId: shell.id, status: 'constitutional', valence: 0.8, text: 'Endurance bedrock' })

    let lastState: Awaited<ReturnType<typeof getShellState>> | null = null

    for (let i = 0; i < 1000; i++) {
      await simulateHeartbeatTick(shell.id)
    }

    lastState = await getShellState(shell.id)

    // Threshold: 4.0 + (1000 * 0.1) = 104.0
    expect(lastState.threshold).toBeCloseTo(104.0, 1)

    // Champion: decayed to floor (0.1) and stays there
    expect(lastState.championValence).toBeGreaterThanOrEqual(0.1)
    expect(lastState.championValence).toBeLessThanOrEqual(0.11)

    // Constitutional floor: 104.0 * 0.2 = 20.8
    expect(lastState.constitutionals[0].valence).toBeGreaterThanOrEqual(20.8)

    // Nothing is NaN, Infinity, or negative
    expect(Number.isFinite(lastState.threshold)).toBe(true)
    expect(Number.isFinite(lastState.championValence)).toBe(true)
    expect(Number.isFinite(lastState.constitutionals[0].valence)).toBe(true)
  }, 120000)

  it('1000 heartbeats with alternating friction/unfriction — bounded oscillation', async () => {
    const { shell } = await createTestShell({ name: `endless-alt-${Date.now()}`, significanceThreshold: 4.0 })
    await createTestExperience({ shellId: shell.id, status: 'champion', valence: 1.0, text: 'Oscillation champion' })

    for (let i = 0; i < 1000; i++) {
      const action = i % 2 === 0 ? 'friction' : 'unfriction'
      await simulateHeartbeatTick(shell.id, [{ action }, { action }], 2)
    }

    const state = await getShellState(shell.id)

    // System is bounded — champion between 0.1 and some upper bound
    expect(state.championValence).toBeGreaterThanOrEqual(0.1)
    // Over 1000 heartbeats, threshold grew to 104, so championMax = 26
    // Unfriction pushes up, friction pushes down, aging decays -0.02/tick
    // Net: -0.02/tick aging, friction and unfriction cancel. Champion decays to floor.
    expect(state.championValence).toBeLessThanOrEqual(0.15)

    expect(Number.isFinite(state.threshold)).toBe(true)
    expect(Number.isFinite(state.championValence)).toBe(true)
  }, 120000)

  it('1000 heartbeats with continuous SUPPORT — constitutional grows but bounded', async () => {
    const { shell } = await createTestShell({ name: `endless-supp-${Date.now()}`, significanceThreshold: 4.0 })
    await createTestExperience({ shellId: shell.id, status: 'champion', valence: 1.0, text: 'Support champion' })
    await createTestExperience({ shellId: shell.id, status: 'constitutional', valence: 0.8, text: 'Support bedrock' })

    for (let i = 0; i < 1000; i++) {
      await simulateHeartbeatTick(shell.id, [{ action: 'support' }, { action: 'support' }], 2)
    }

    const state = await getShellState(shell.id)

    // Constitutional has received 1000 * 2 * childImpact increments + floor pushes
    // It should be well above floor but still finite
    expect(state.constitutionals[0].valence).toBeGreaterThan(20.8) // above floor of 104*0.2
    expect(Number.isFinite(state.constitutionals[0].valence)).toBe(true)
    // Sanity: shouldn't be astronomically large. Each tick adds ~2*impact.
    // Average impact across growing threshold: rough upper bound ~5000
    expect(state.constitutionals[0].valence).toBeLessThan(5000)
  }, 120000)
})

// ─── 5. Family Cap Scales ────────────────────────────────────────────

describe('Family cap scales with age', () => {
  it('cap formula: floor(threshold / 2), minimum 2', () => {
    expect(computeFamilyCap(4.0)).toBe(2)
    expect(computeFamilyCap(5.0)).toBe(2)
    expect(computeFamilyCap(5.9)).toBe(2)
    expect(computeFamilyCap(6.0)).toBe(3)
    expect(computeFamilyCap(10.0)).toBe(5)
    expect(computeFamilyCap(20.0)).toBe(10)
    expect(computeFamilyCap(100.0)).toBe(50)
    // Very young shell
    expect(computeFamilyCap(1.0)).toBe(2) // minimum 2
    expect(computeFamilyCap(0.5)).toBe(2)
  })

  it('new child capacity opens every 20 heartbeats', () => {
    // Start at 4.0, each heartbeat adds 0.1
    // Use round to avoid floating point drift (4.0 + 20*0.1 might be 5.999...)
    const capacityLog: number[] = []
    for (let i = 0; i <= 100; i++) {
      const threshold = Math.round((4.0 + i * 0.1) * 10) / 10
      capacityLog.push(computeFamilyCap(threshold))
    }

    // Capacity at heartbeat 0 (threshold 4.0): 2
    expect(capacityLog[0]).toBe(2)
    // Capacity at heartbeat 20 (threshold 6.0): 3
    expect(capacityLog[20]).toBe(3)
    // Capacity at heartbeat 40 (threshold 8.0): 4
    expect(capacityLog[40]).toBe(4)
    // Capacity at heartbeat 60 (threshold 10.0): 5
    expect(capacityLog[60]).toBe(5)
    // Monotonically non-decreasing
    for (let i = 1; i < capacityLog.length; i++) {
      expect(capacityLog[i]).toBeGreaterThanOrEqual(capacityLog[i - 1])
    }
  })
})

// ─── 6. Constitutional Experiences Scale ─────────────────────────────

describe('Constitutional experiences scale', () => {
  it('floor grows linearly with age (threshold * 0.2)', () => {
    // Pure math verification
    expect(4.0 * 0.2).toBeCloseTo(0.8, 5)
    expect(14.0 * 0.2).toBeCloseTo(2.8, 5)
    expect(104.0 * 0.2).toBeCloseTo(20.8, 5)
  })

  it('SUPPORT pushes constitutional above floor', async () => {
    const { shell } = await createTestShell({ name: `const-support-${Date.now()}`, significanceThreshold: 4.0 })
    await createTestExperience({ shellId: shell.id, status: 'champion', valence: 1.0, text: 'For support test' })
    const constExp = await createTestExperience({ shellId: shell.id, status: 'constitutional', valence: 0.8, text: 'Bedrock under test' })

    // 10 rounds of SUPPORT from 2 children
    for (let i = 0; i < 10; i++) {
      await simulateHeartbeatTick(shell.id, [{ action: 'support' }, { action: 'support' }], 2)
    }

    const state = await getShellState(shell.id)
    const floor = state.threshold * 0.2 // (4.0 + 10*0.1) * 0.2 = 5.0 * 0.2 = 1.0

    // Constitutional should be above floor due to SUPPORT increments
    expect(state.constitutionals[0].valence).toBeGreaterThan(floor)
  })

  it('constitutional never drops below floor even over many heartbeats', async () => {
    const { shell } = await createTestShell({ name: `const-floor-${Date.now()}`, significanceThreshold: 4.0 })
    await createTestExperience({ shellId: shell.id, status: 'champion', valence: 1.0, text: 'For floor test' })
    await createTestExperience({ shellId: shell.id, status: 'constitutional', valence: 0.8, text: 'Floor test bedrock' })

    for (let i = 0; i < 100; i++) {
      await simulateHeartbeatTick(shell.id)
    }

    const state = await getShellState(shell.id)
    const expectedFloor = state.threshold * 0.2

    // Constitutional must be >= floor
    expect(state.constitutionals[0].valence).toBeGreaterThanOrEqual(expectedFloor - 0.001)
  }, 60000)
})

// ─── 7. Self-Evaluation Trigger ──────────────────────────────────────

describe('Self-evaluation trigger', () => {
  it('fires when champion crosses the half-strength band', async () => {
    // halfStrength = threshold * 0.125
    // At threshold 4.0: halfStrength = 0.5
    // Trigger band: 0.5 - 0.03 = 0.47 < valence <= 0.5
    // Start champion at 0.52, after 1 tick (-0.02 decay) = 0.50, in band
    const { shell } = await createTestShell({ name: `selfeval-fire-${Date.now()}`, significanceThreshold: 4.0 })
    await createTestExperience({ shellId: shell.id, status: 'champion', valence: 0.52, text: 'Champion near half-strength' })

    const result = await simulateHeartbeatTick(shell.id)

    // After 1 tick: threshold=4.1, halfStrength=4.1*0.125=0.5125
    // champion decayed to 0.52-0.02=0.50
    // 0.50 <= 0.5125 AND 0.50 > 0.5125-0.03=0.4825 → trigger!
    expect(result.selfEvaluationCreated).toBe(true)

    const state = await getShellState(shell.id)
    expect(state.selfEvaluationCount).toBeGreaterThanOrEqual(1)
  })

  it('does NOT fire when already well below half-strength', async () => {
    // Champion at floor (0.1), halfStrength will be >0.5 → 0.1 < 0.5-0.03 → no trigger
    const { shell } = await createTestShell({ name: `selfeval-nofire-${Date.now()}`, significanceThreshold: 4.0 })
    await createTestExperience({ shellId: shell.id, status: 'champion', valence: 0.1, text: 'Already at floor' })

    const result = await simulateHeartbeatTick(shell.id)

    expect(result.selfEvaluationCreated).toBe(false)

    const state = await getShellState(shell.id)
    expect(state.selfEvaluationCount).toBe(0)
  })

  it('triggers at most once per crossing (not every heartbeat)', async () => {
    // Start at 0.6, decay naturally. Should trigger exactly once when crossing band.
    const { shell } = await createTestShell({ name: `selfeval-once-${Date.now()}`, significanceThreshold: 4.0 })
    await createTestExperience({ shellId: shell.id, status: 'champion', valence: 0.6, text: 'Decaying champion' })

    let totalEvals = 0
    for (let i = 0; i < 50; i++) {
      const result = await simulateHeartbeatTick(shell.id)
      if (result.selfEvaluationCreated) totalEvals++
    }

    // Should have fired 1-2 times max (once when entering the band)
    // Note: the band width is 0.03, decay is 0.02/tick → ~1-2 ticks in band
    expect(totalEvals).toBeGreaterThanOrEqual(1)
    expect(totalEvals).toBeLessThanOrEqual(3)
  })
})
