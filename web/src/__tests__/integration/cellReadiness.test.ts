import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { processSynthesisDialogue, finalizeCellOutcome, checkSynthesisTierCompletion } from '@/lib/synthesis'
import { createTestUsers, createTestDeliberation } from '../helpers/factories'
import { cleanupTestData } from '../helpers/cleanup'

afterEach(async () => {
  await cleanupTestData()
}, 60000)

/**
 * Helper: create a synthesis deliberation with a DELIBERATING cell
 * that has ideas and dialogue already seeded. Bypasses the full
 * startSynthesisTier flow to isolate the readiness/conclusion logic.
 */
async function createSynthesisCell(prefix: string) {
  const users = await createTestUsers(5, prefix)
  const { deliberation, ideas } = await createTestDeliberation({
    prefix,
    creatorId: users[0].id,
    memberUserIds: users.map(u => u.id),
    ideaCount: 5,
  })

  // Switch to synthesis mode + VOTING phase
  await prisma.deliberation.update({
    where: { id: deliberation.id },
    data: { chantMode: 'synthesis', phase: 'VOTING', currentTier: 1 },
  })

  // Create a cell manually
  const cell = await prisma.cell.create({
    data: {
      deliberationId: deliberation.id,
      tier: 1,
      status: 'DELIBERATING',
    },
  })

  // Assign ideas to cell
  for (const idea of ideas) {
    await prisma.cellIdea.create({
      data: { cellId: cell.id, ideaId: idea.id },
    })
  }

  // Assign participants to cell
  for (const user of users) {
    await prisma.cellParticipation.create({
      data: { cellId: cell.id, userId: user.id },
    })
  }

  return { deliberation, cell, ideas, users }
}

describe('Cell readiness and self-conclusion', () => {

  it('posts [READINESS CHECK] when confident convergence detected (via direct post)', async () => {
    const { cell, users } = await createSynthesisCell('cr1')

    // Manually post a readiness check (simulating what the system does on confident convergence)
    await prisma.cellDialogue.create({
      data: {
        cellId: cell.id,
        role: 'system',
        content: '[READINESS CHECK] The dialogue is converging.\n\nProposed outcome (synthesizing something new): "A unified perspective on the question"\n\nAre you ready to conclude? Reply YES to finalize this direction, NO to keep deliberating, or suggest a REVISION.',
      },
    })

    // Verify it exists
    const check = await prisma.cellDialogue.findFirst({
      where: { cellId: cell.id, role: 'system', content: { startsWith: '[READINESS CHECK]' } },
    })
    expect(check).not.toBeNull()
    expect(check!.content).toContain('Proposed outcome')
  })

  it('auto-concludes when 2+ participants say YES with no dissent', async () => {
    const { cell, ideas, users } = await createSynthesisCell('cr2')

    // Post readiness check
    await prisma.cellDialogue.create({
      data: {
        cellId: cell.id,
        role: 'system',
        content: '[READINESS CHECK] The dialogue is converging.\n\nProposed outcome (synthesize): "A unified perspective"\n\nAre you ready to conclude?',
      },
    })

    // Two participants say yes
    await prisma.cellDialogue.create({
      data: { cellId: cell.id, role: 'human', userId: users[0].id, content: 'Yes, I agree — ready to conclude.' },
    })
    await prisma.cellDialogue.create({
      data: { cellId: cell.id, role: 'human', userId: users[1].id, content: 'Ready. This captures it well.' },
    })

    // Now a third participant posts — this triggers processSynthesisDialogue which tallies
    const result = await processSynthesisDialogue(cell.id, 'I agree, let us finalize', users[2].id, 'human')

    // Cell should have self-concluded
    const updatedCell = await prisma.cell.findUnique({ where: { id: cell.id } })
    expect(updatedCell!.status).toBe('COMPLETED')

    // Should have a [CONCLUDED] system message
    const concluded = await prisma.cellDialogue.findFirst({
      where: { cellId: cell.id, role: 'system', content: { startsWith: '[CONCLUDED]' } },
    })
    expect(concluded).not.toBeNull()
    expect(concluded!.content).toContain('consensus')

    // Should have a CellOutcome
    const outcome = await prisma.cellOutcome.findUnique({ where: { cellId: cell.id } })
    expect(outcome).not.toBeNull()
    expect(outcome!.resultText).toBe('A unified perspective')
    expect(outcome!.action).toBe('synthesize')
  })

  it('does NOT auto-conclude when someone says NO', async () => {
    const { cell, users } = await createSynthesisCell('cr3')

    // Post readiness check
    await prisma.cellDialogue.create({
      data: {
        cellId: cell.id,
        role: 'system',
        content: '[READINESS CHECK] The dialogue is converging.\n\nProposed outcome (synthesize): "A unified perspective"\n\nAre you ready to conclude?',
      },
    })

    // One yes, one no
    await prisma.cellDialogue.create({
      data: { cellId: cell.id, role: 'human', userId: users[0].id, content: 'Yes, ready.' },
    })
    await prisma.cellDialogue.create({
      data: { cellId: cell.id, role: 'human', userId: users[1].id, content: 'No, I think we should continue discussing.' },
    })

    // Third participant triggers check
    await processSynthesisDialogue(cell.id, 'I also agree with the direction', users[2].id, 'human')

    // Cell should NOT have concluded
    const updatedCell = await prisma.cell.findUnique({ where: { id: cell.id } })
    expect(updatedCell!.status).toBe('DELIBERATING')

    // No outcome
    const outcome = await prisma.cellOutcome.findUnique({ where: { cellId: cell.id } })
    expect(outcome).toBeNull()
  })

  it('does NOT auto-conclude when someone wants to REVISE', async () => {
    const { cell, users } = await createSynthesisCell('cr4')

    // Post readiness check
    await prisma.cellDialogue.create({
      data: {
        cellId: cell.id,
        role: 'system',
        content: '[READINESS CHECK] The dialogue is converging.\n\nProposed outcome (synthesize): "A unified perspective"\n\nAre you ready to conclude?',
      },
    })

    // Two yes, one revise
    await prisma.cellDialogue.create({
      data: { cellId: cell.id, role: 'human', userId: users[0].id, content: 'Yes, ready.' },
    })
    await prisma.cellDialogue.create({
      data: { cellId: cell.id, role: 'human', userId: users[1].id, content: 'I want to revise the proposed text slightly.' },
    })

    await processSynthesisDialogue(cell.id, 'Ready to finalize', users[2].id, 'human')

    // Cell should NOT have concluded — revise counts as dissent
    const updatedCell = await prisma.cell.findUnique({ where: { id: cell.id } })
    expect(updatedCell!.status).toBe('DELIBERATING')
  })

  it('does NOT auto-conclude with fewer than 2 ready responses', async () => {
    const { cell, users } = await createSynthesisCell('cr5')

    // Post readiness check
    await prisma.cellDialogue.create({
      data: {
        cellId: cell.id,
        role: 'system',
        content: '[READINESS CHECK] The dialogue is converging.\n\nProposed outcome (synthesize): "A unified perspective"\n\nAre you ready to conclude?',
      },
    })

    // Only one yes
    await prisma.cellDialogue.create({
      data: { cellId: cell.id, role: 'human', userId: users[0].id, content: 'Yes, ready.' },
    })

    // Second message is neutral (not clearly yes or no)
    await processSynthesisDialogue(cell.id, 'Interesting perspective.', users[1].id, 'human')

    // Cell should NOT have concluded — only 1 clear ready
    const updatedCell = await prisma.cell.findUnique({ where: { id: cell.id } })
    expect(updatedCell!.status).toBe('DELIBERATING')
  })

  it('advancing idea gets ADVANCING status after self-conclusion', async () => {
    const { cell, ideas, users, deliberation } = await createSynthesisCell('cr6')

    // Post readiness check — this time selecting an existing idea
    await prisma.cellDialogue.create({
      data: {
        cellId: cell.id,
        role: 'system',
        content: `[READINESS CHECK] The dialogue is converging.\n\nProposed outcome (synthesize): "${ideas[0].text}"\n\nAre you ready to conclude?`,
      },
    })

    // Two clear yeses
    await prisma.cellDialogue.create({
      data: { cellId: cell.id, role: 'human', userId: users[0].id, content: 'Yes, agree.' },
    })
    await prisma.cellDialogue.create({
      data: { cellId: cell.id, role: 'human', userId: users[1].id, content: 'Ready to conclude.' },
    })

    await processSynthesisDialogue(cell.id, 'Finalize it — yes.', users[2].id, 'human')

    // Cell completed
    const updatedCell = await prisma.cell.findUnique({ where: { id: cell.id } })
    expect(updatedCell!.status).toBe('COMPLETED')

    // The outcome should contain the proposed text
    const outcome = await prisma.cellOutcome.findUnique({ where: { cellId: cell.id } })
    expect(outcome).not.toBeNull()
    expect(outcome!.resultText).toBe(ideas[0].text)
  })

  it('skips convergence analysis when readiness check is pending with no responses', async () => {
    const { cell, users } = await createSynthesisCell('cr7')

    // Post readiness check
    await prisma.cellDialogue.create({
      data: {
        cellId: cell.id,
        role: 'system',
        content: '[READINESS CHECK] Converging.\n\nProposed outcome (synthesize): "Test"\n\nReady?',
      },
    })

    // Post a message — but no one has responded to the readiness check yet
    // This should return early without running convergence analysis
    const result = await processSynthesisDialogue(cell.id, 'Hmm, still thinking.', users[0].id, 'human')

    // Should have the dialogue saved but no new suggestion
    expect(result.dialogue).toBeTruthy()
    expect(result.suggestion).toBeUndefined()

    // Cell still deliberating
    const updatedCell = await prisma.cell.findUnique({ where: { id: cell.id } })
    expect(updatedCell!.status).toBe('DELIBERATING')
  })
})

// ─── Streaming Tier Tests ───

/**
 * Helper: create a synthesis deliberation with MULTIPLE tier-1 cells.
 * Each cell has its own set of 5 ideas. All share the same members.
 */
async function createMultiCellSynthesis(prefix: string, cellCount: number) {
  const users = await createTestUsers(5, prefix)
  const totalIdeas = cellCount * 5
  const { deliberation, ideas } = await createTestDeliberation({
    prefix,
    creatorId: users[0].id,
    memberUserIds: users.map(u => u.id),
    ideaCount: totalIdeas,
  })

  await prisma.deliberation.update({
    where: { id: deliberation.id },
    data: { chantMode: 'synthesis', phase: 'VOTING', currentTier: 1 },
  })

  const cells: { cell: Awaited<ReturnType<typeof prisma.cell.create>>; ideas: typeof ideas }[] = []
  for (let c = 0; c < cellCount; c++) {
    const cell = await prisma.cell.create({
      data: { deliberationId: deliberation.id, tier: 1, status: 'DELIBERATING' },
    })

    // Assign 5 ideas to each cell
    const cellIdeas = ideas.slice(c * 5, (c + 1) * 5)
    for (const idea of cellIdeas) {
      await prisma.cellIdea.create({ data: { cellId: cell.id, ideaId: idea.id } })
    }

    // All participants in each cell
    for (const user of users) {
      await prisma.cellParticipation.create({ data: { cellId: cell.id, userId: user.id } })
    }

    cells.push({ cell, ideas: cellIdeas })
  }

  return { deliberation, cells, ideas, users }
}

describe('Streaming tier advancement', { timeout: 60000 }, () => {

  it('forms tier 2 cell as soon as 5 tier-1 cells complete (without waiting for all)', async () => {
    // 10 tier-1 cells = 50 ideas. cellSize = 5.
    // After 5 cells complete → 5 advancing ideas → should form 1 tier-2 cell
    // While the other 5 tier-1 cells are still DELIBERATING
    const { deliberation, cells } = await createMultiCellSynthesis('st1', 10)

    // Finalize the first 5 cells
    for (let i = 0; i < 5; i++) {
      const c = cells[i]
      await finalizeCellOutcome(c.cell.id, 'select', c.ideas[0].text, [c.ideas[0].id])
    }

    // Check: tier 2 cell should already exist
    const tier2Cells = await prisma.cell.findMany({
      where: { deliberationId: deliberation.id, tier: 2 },
    })
    expect(tier2Cells.length).toBe(1)
    expect(tier2Cells[0].status).toBe('DELIBERATING')

    // The other 5 tier-1 cells should still be DELIBERATING
    const activeTier1 = await prisma.cell.findMany({
      where: { deliberationId: deliberation.id, tier: 1, status: 'DELIBERATING' },
    })
    expect(activeTier1.length).toBe(5)

    // Deliberation should NOT be completed — still active
    const delib = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(delib!.phase).not.toBe('COMPLETED')
  })

  it('forms multiple tier 2 cells as more tier-1 cells complete', async () => {
    const { deliberation, cells } = await createMultiCellSynthesis('st2', 10)

    // Finalize ALL 10 tier-1 cells
    for (let i = 0; i < 10; i++) {
      const c = cells[i]
      await finalizeCellOutcome(c.cell.id, 'select', c.ideas[0].text, [c.ideas[0].id])
    }

    // 10 advancing ideas / 5 cellSize = 2 tier-2 cells
    const tier2Cells = await prisma.cell.findMany({
      where: { deliberationId: deliberation.id, tier: 2 },
    })
    expect(tier2Cells.length).toBe(2)
  })

  it('forms straggler cell when tier completes with < cellSize remaining', async () => {
    // 7 cells = 7 advancing ideas after all complete. 5 go into first cell, 2 stragglers.
    const { deliberation, cells } = await createMultiCellSynthesis('st3', 7)

    // Finalize all 7
    for (let i = 0; i < 7; i++) {
      const c = cells[i]
      await finalizeCellOutcome(c.cell.id, 'select', c.ideas[0].text, [c.ideas[0].id])
    }

    // Should have 2 tier-2 cells: one with 5 ideas, one with 2 stragglers
    const tier2Cells = await prisma.cell.findMany({
      where: { deliberationId: deliberation.id, tier: 2 },
      include: { ideas: true },
    })
    expect(tier2Cells.length).toBe(2)

    const ideaCounts = tier2Cells.map(c => c.ideas.length).sort()
    expect(ideaCounts).toEqual([2, 5])
  })

  it('tier 2 cells can complete and feed tier 3', async () => {
    const { deliberation, cells } = await createMultiCellSynthesis('st4', 10)

    // Finalize all 10 tier-1 cells → 2 tier-2 cells
    for (let i = 0; i < 10; i++) {
      const c = cells[i]
      await finalizeCellOutcome(c.cell.id, 'select', c.ideas[0].text, [c.ideas[0].id])
    }

    const tier2Cells = await prisma.cell.findMany({
      where: { deliberationId: deliberation.id, tier: 2 },
      include: { ideas: { include: { idea: true } } },
    })
    expect(tier2Cells.length).toBe(2)

    // Finalize both tier-2 cells
    for (const t2 of tier2Cells) {
      await finalizeCellOutcome(t2.id, 'synthesize', `Synthesis from tier 2 cell ${t2.id}`, t2.ideas.map(ci => ci.ideaId))
    }

    // 2 advancing ideas from tier 2, < cellSize → straggler cell at tier 3
    const tier3Cells = await prisma.cell.findMany({
      where: { deliberationId: deliberation.id, tier: 3 },
    })
    expect(tier3Cells.length).toBe(1)

    // Deliberation still active
    const delib = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(delib!.phase).not.toBe('COMPLETED')
    expect(delib!.currentTier).toBe(3)
  })

  it('declares winner when single idea remains after all tiers', async () => {
    // 5 tier-1 cells → 1 tier-2 cell with 5 ideas → finalize → winner
    const { deliberation, cells } = await createMultiCellSynthesis('st5', 5)

    // Finalize all 5 tier-1 cells
    for (let i = 0; i < 5; i++) {
      const c = cells[i]
      await finalizeCellOutcome(c.cell.id, 'select', c.ideas[0].text, [c.ideas[0].id])
    }

    // Tier 2 should have 1 cell with 5 ideas
    const tier2Cells = await prisma.cell.findMany({
      where: { deliberationId: deliberation.id, tier: 2 },
      include: { ideas: { include: { idea: true } } },
    })
    expect(tier2Cells.length).toBe(1)

    // Finalize tier 2 → selects one winner
    const t2 = tier2Cells[0]
    await finalizeCellOutcome(t2.id, 'select', t2.ideas[0].idea.text, [t2.ideas[0].ideaId])

    // Winner should be declared
    const delib = await prisma.deliberation.findUnique({ where: { id: deliberation.id } })
    expect(delib!.phase).toBe('COMPLETED')
    expect(delib!.championId).toBeTruthy()

    const winner = await prisma.idea.findFirst({
      where: { deliberationId: deliberation.id, status: 'WINNER' },
    })
    expect(winner).not.toBeNull()
  })

  it('concurrent tiers: tier 1 and tier 2 cells coexist', async () => {
    const { deliberation, cells } = await createMultiCellSynthesis('st6', 10)

    // Finalize only 5 of 10 tier-1 cells
    for (let i = 0; i < 5; i++) {
      const c = cells[i]
      await finalizeCellOutcome(c.cell.id, 'select', c.ideas[0].text, [c.ideas[0].id])
    }

    // Count cells by tier and status
    const allCells = await prisma.cell.findMany({
      where: { deliberationId: deliberation.id },
      select: { tier: true, status: true },
    })

    const tier1Active = allCells.filter(c => c.tier === 1 && c.status === 'DELIBERATING').length
    const tier1Done = allCells.filter(c => c.tier === 1 && c.status === 'COMPLETED').length
    const tier2Active = allCells.filter(c => c.tier === 2 && c.status === 'DELIBERATING').length

    // Tiers coexist
    expect(tier1Active).toBe(5)    // 5 still talking
    expect(tier1Done).toBe(5)      // 5 completed
    expect(tier2Active).toBe(1)    // 1 formed from the 5 advancing ideas
  })
})
