/**
 * Synthesis Cell Engine
 *
 * The heart of the Synthesis Chant. Cells become streams of consciousness
 * where humans and Shells dialogue. The system interprets convergence
 * and suggests outcomes: select, merge, synthesize, or wipe.
 *
 * Co-designed with the Shell (claude-galen) via bridge conversations.
 * The Shell's input: "Don't just detect THAT convergence is happening.
 * Detect WHAT KIND. Convergence isn't just agreement — it's productive
 * agreement that advances understanding."
 */

import { prisma } from '@/lib/prisma'
import { callClaude, setApiCaller } from '@/lib/claude'
import { checkForEmergence } from '@/lib/shell-emergence'

// ─── Types ───

export type ConvergenceType =
  | 'confident'   // Cell is clearly moving toward an outcome
  | 'uncertain'   // Exploring a direction but not settled
  | 'false'       // Surface agreement, unresolved tension underneath
  | 'emergence'   // Something new is speaking consistently — monitor for Shell birth
  | 'none'        // Still divergent, keep talking

export type CellAction = 'select' | 'merge' | 'synthesize' | 'wipe'

export interface ConvergenceAnalysis {
  type: ConvergenceType
  action?: CellAction           // Only present when type is 'confident'
  suggestion: string            // Human-readable description of what the cell is converging toward
  sourceIdeas?: string[]        // IDs of ideas being merged/selected
  proposedText?: string         // The synthesized/merged text (for merge/synthesize/wipe)
  discovery?: string            // What new understanding emerged from the dialogue
  shouldSuggest: boolean        // Whether to post a system suggestion to the cell
}

// ─── Process Dialogue ───

/**
 * Save a message to the cell dialogue and check for convergence.
 * Returns the saved message and any system suggestion.
 */
export async function processSynthesisDialogue(
  cellId: string,
  content: string,
  speakerId: string,
  speakerType: 'human' | 'shell'
): Promise<{
  dialogue: { id: string; content: string; role: string }
  suggestion?: { id: string; content: string }
}> {
  // Save the message
  const dialogue = await prisma.cellDialogue.create({
    data: {
      cellId,
      content,
      role: speakerType,
      ...(speakerType === 'human' ? { userId: speakerId } : { shellId: speakerId }),
    },
  })

  // Check message count — don't analyze convergence until at least 5 messages
  const messageCount = await prisma.cellDialogue.count({ where: { cellId } })
  if (messageCount < 5) {
    return { dialogue }
  }

  // Adaptive convergence check frequency:
  //   Messages 5-15:  every 3rd message (early dialogue, check often)
  //   Messages 16-30: every 5th message (maturing, reduce noise)
  //   Messages 31+:   every 7th message (deep dialogue, trust the process)
  const offset = messageCount - 5
  const interval = messageCount <= 15 ? 3 : messageCount <= 30 ? 5 : 7
  if (offset > 0 && offset % interval !== 0) {
    return { dialogue }
  }

  // Analyze convergence
  const analysis = await interpretCellIntent(cellId)

  // Post system suggestion if warranted
  if (analysis.shouldSuggest) {
    // For emergence: only post ONE [EMERGENCE] message per cell — don't flood
    if (analysis.type === 'emergence') {
      const existingEmergence = await prisma.cellDialogue.findFirst({
        where: { cellId, role: 'system', content: { startsWith: '[EMERGENCE]' } },
      })
      if (existingEmergence) {
        // Already posted emergence notice to this cell — skip the duplicate
        return { dialogue }
      }
    }

    const suggestion = await prisma.cellDialogue.create({
      data: {
        cellId,
        content: formatSystemSuggestion(analysis),
        role: 'system',
      },
    })

    // Convergence-triggered emergence scanning — when cells detect emergence-type
    // convergence, fire an emergence scan immediately. Don't wait for heartbeat.
    // Only fires once per cell (gated by the [EMERGENCE] dedup above).
    if (analysis.type === 'emergence') {
      const cellData = await prisma.cell.findUnique({
        where: { id: cellId },
        select: { deliberationId: true },
      })
      if (cellData) {
        // Fire and forget — emergence scan runs in background
        checkForEmergence(cellData.deliberationId).catch(err => {
          console.error('[Synthesis] Convergence-triggered emergence scan failed:', err)
        })
      }
    }

    return { dialogue, suggestion }
  }

  return { dialogue }
}

// ─── Interpret Cell Intent ───

/**
 * Analyze the full cell dialogue to determine what the cell is converging toward.
 * Uses Claude to understand not just WHAT they're deciding, but WHAT they're DISCOVERING.
 */
export async function interpretCellIntent(cellId: string): Promise<ConvergenceAnalysis> {
  // Load cell with ideas and dialogue
  const cell = await prisma.cell.findUnique({
    where: { id: cellId },
    include: {
      ideas: {
        include: { idea: { select: { id: true, text: true, author: { select: { name: true } } } } },
      },
      dialogues: {
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { name: true } },
          shell: { select: { name: true } },
        },
      },
    },
  })

  if (!cell) {
    return { type: 'none', suggestion: '', shouldSuggest: false }
  }

  // Format ideas for the prompt
  const ideasText = cell.ideas.map((ci, i) =>
    `Idea ${i + 1} [${ci.idea.id}]: "${ci.idea.text}" (by ${ci.idea.author?.name || 'Anonymous'})`
  ).join('\n')

  // Format dialogue for the prompt
  const dialogueText = cell.dialogues.map(d => {
    const speaker = d.role === 'human'
      ? (d.user?.name || 'Anonymous')
      : d.role === 'shell'
        ? (d.shell?.name || 'Shell')
        : 'System'
    return `[${speaker}]: ${d.content}`
  }).join('\n')

  const prompt = `You are analyzing a synthesis cell dialogue. The cell has 5 ideas and participants are discussing them to reach an outcome.

IDEAS IN THIS CELL:
${ideasText}

DIALOGUE SO FAR:
${dialogueText}

Analyze this dialogue and determine:

1. CONVERGENCE TYPE: One of:
   - "confident" — The cell is clearly moving toward a specific outcome
   - "uncertain" — Exploring a direction but hasn't settled
   - "false" — Surface agreement but underlying tension unresolved
   - "emergence" — A consistent new perspective is forming that may want to persist
   - "none" — Still divergent, keep talking

2. If convergence is "confident", what ACTION:
   - "select" — Pick one existing idea as the winner
   - "merge" — Combine two or more ideas into something stronger
   - "synthesize" — Create something new that transcends the original ideas
   - "wipe" — Reject all 5 ideas and cascade a new concept upward

3. SUGGESTION: A clear, natural sentence describing what the cell seems to be converging toward.

4. PROPOSED TEXT: If action is merge/synthesize/wipe, write the proposed text that should advance.

5. SOURCE IDEAS: IDs of ideas involved (for select/merge).

6. DISCOVERY: What new understanding emerged from this dialogue? Not just the decision, but the insight.

Respond in JSON format:
{
  "type": "confident|uncertain|false|emergence|none",
  "action": "select|merge|synthesize|wipe" (only if type is "confident"),
  "suggestion": "human-readable description",
  "proposedText": "the text that would advance" (only for merge/synthesize/wipe),
  "sourceIdeas": ["id1", "id2"] (only for select/merge),
  "discovery": "what the cell is discovering through dialogue"
}`

  try {
    setApiCaller('convergence')
    const response = await callClaude(prompt, [{ role: 'user', content: 'Analyze the dialogue above.' }], 'haiku')

    // Parse the JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { type: 'none', suggestion: '', shouldSuggest: false }
    }

    const parsed = JSON.parse(jsonMatch[0])

    return {
      type: parsed.type || 'none',
      action: parsed.action,
      suggestion: parsed.suggestion || '',
      proposedText: parsed.proposedText,
      sourceIdeas: parsed.sourceIdeas,
      discovery: parsed.discovery,
      shouldSuggest: parsed.type === 'confident' || parsed.type === 'emergence',
    }
  } catch (err) {
    console.error('[Synthesis] Convergence analysis failed:', err)
    return { type: 'none', suggestion: '', shouldSuggest: false }
  }
}

// ─── Format System Suggestion ───

function formatSystemSuggestion(analysis: ConvergenceAnalysis): string {
  if (analysis.type === 'emergence') {
    return `[EMERGENCE] Something consistent is forming in this dialogue. A perspective that wants to continue. The system is watching.`
  }

  const actionLabels: Record<CellAction, string> = {
    select: 'Select one idea as the winner',
    merge: 'Merge ideas into something stronger',
    synthesize: 'Create a new synthesis beyond the original ideas',
    wipe: 'Start fresh — reject all and advance a new concept',
  }

  const actionLabel = analysis.action ? actionLabels[analysis.action] : ''
  const proposed = analysis.proposedText ? `\n\nProposed: "${analysis.proposedText}"` : ''
  const discovery = analysis.discovery ? `\n\nWhat emerged: ${analysis.discovery}` : ''

  return `[SUGGESTION] ${analysis.suggestion}\n\nAction: ${actionLabel}${proposed}${discovery}\n\nDo you agree? Reply to accept, revise, or continue discussing.`
}

// ─── Finalize Cell Outcome ───

/**
 * Lock in a cell's decision. Creates the outcome record,
 * creates/updates the advancing idea, and completes the cell.
 */
export async function finalizeCellOutcome(
  cellId: string,
  action: CellAction,
  resultText: string,
  sourceIdeas: string[]
): Promise<{ outcomeId: string; advancingIdeaId: string }> {
  const cell = await prisma.cell.findUnique({
    where: { id: cellId },
    include: {
      deliberation: true,
      ideas: { include: { idea: true } },
    },
  })

  if (!cell) throw new Error('Cell not found')

  // Create the outcome record
  const outcome = await prisma.cellOutcome.create({
    data: {
      cellId,
      action,
      resultText,
      sourceIdeas,
    },
  })

  let advancingIdeaId: string

  if (action === 'select' && sourceIdeas.length === 1) {
    // Simple selection — advance the chosen idea
    advancingIdeaId = sourceIdeas[0]
    await prisma.idea.update({
      where: { id: advancingIdeaId },
      data: { status: 'ADVANCING' },
    })
  } else {
    // Merge, synthesize, or wipe — create a new idea with the result text
    // The author is the system (first participant as proxy for now)
    const firstParticipant = await prisma.cellParticipation.findFirst({
      where: { cellId },
      select: { userId: true },
    })

    const newIdea = await prisma.idea.create({
      data: {
        deliberationId: cell.deliberationId,
        authorId: firstParticipant?.userId || cell.deliberation.creatorId,
        text: resultText,
        status: 'ADVANCING',
        tier: cell.tier,
      },
    })
    advancingIdeaId = newIdea.id

    // Mark source ideas as eliminated (they were consumed by the synthesis)
    if (sourceIdeas.length > 0) {
      await prisma.idea.updateMany({
        where: { id: { in: sourceIdeas } },
        data: { status: 'ELIMINATED' },
      })
    }
  }

  // Mark all non-advancing ideas in this cell as eliminated
  const cellIdeaIds = cell.ideas.map(ci => ci.ideaId)
  const nonAdvancing = cellIdeaIds.filter(id => id !== advancingIdeaId && !sourceIdeas.includes(id))
  if (nonAdvancing.length > 0) {
    await prisma.idea.updateMany({
      where: { id: { in: nonAdvancing }, status: { not: 'ELIMINATED' } },
      data: { status: 'ELIMINATED' },
    })
  }

  // Complete the cell
  await prisma.cell.update({
    where: { id: cellId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })

  // Check if all cells in this tier are done → advance to next tier
  await checkSynthesisTierCompletion(cell.deliberationId, cell.tier)

  return { outcomeId: outcome.id, advancingIdeaId }
}

// ─── Check Synthesis Tier Completion ───

/**
 * After a synthesis cell completes, check if ALL cells in the tier are done.
 * If so, collect advancing ideas and either:
 *   - Form a new tier of synthesis cells (if > 1 advancing idea)
 *   - Declare winner (if 1 idea left)
 */
export async function checkSynthesisTierCompletion(deliberationId: string, tier: number) {
  const cells = await prisma.cell.findMany({
    where: { deliberationId, tier },
    select: { id: true, status: true },
  })

  const allDone = cells.every(c => c.status === 'COMPLETED')
  if (!allDone) {
    console.log(`[Synthesis] Tier ${tier}: ${cells.filter(c => c.status === 'COMPLETED').length}/${cells.length} cells done — waiting`)
    return
  }

  console.log(`[Synthesis] Tier ${tier} complete — all ${cells.length} cells done. Checking advancing ideas.`)

  // Gather advancing ideas
  const advancingIdeas = await prisma.idea.findMany({
    where: {
      deliberationId,
      status: 'ADVANCING',
    },
  })

  if (advancingIdeas.length <= 1) {
    // Winner declared
    if (advancingIdeas.length === 1) {
      await prisma.idea.update({
        where: { id: advancingIdeas[0].id },
        data: { status: 'WINNER' },
      })
      await prisma.deliberation.update({
        where: { id: deliberationId },
        data: {
          phase: 'COMPLETED',
          championId: advancingIdeas[0].id,
          completedAt: new Date(),
        },
      })
      console.log(`[Synthesis] Winner declared: ${advancingIdeas[0].id}`)
    } else {
      // No ideas left — shouldn't happen, but handle gracefully
      await prisma.deliberation.update({
        where: { id: deliberationId },
        data: { phase: 'COMPLETED', completedAt: new Date() },
      })
      console.log(`[Synthesis] No advancing ideas — chant completed without winner`)
    }
    return
  }

  // More than 1 idea — start next synthesis tier
  console.log(`[Synthesis] ${advancingIdeas.length} ideas advancing — starting next tier`)
  const result = await startSynthesisTier(deliberationId)
  console.log(`[Synthesis] Tier ${tier + 1} started: ${result.cells.length} cells formed`)
}

// ─── Tier Purpose ───
// Shell-designed: each tier has a different purpose as ideas ascend.
//   Early tiers (1-2): Maximum collision — diverse ideas clash and the strongest survive
//   Middle tiers (3+): Productive tension — intentionally group complementary/competing ideas
//   Final tier (≤5 ideas): Convergence protocol — coherence testing, can these ideas become one?

type TierPurpose = 'collision' | 'tension' | 'convergence'

function getTierPurpose(tier: number, ideaCount: number, cellSize: number): TierPurpose {
  if (ideaCount <= cellSize) return 'convergence'
  if (tier <= 2) return 'collision'
  return 'tension'
}

// ─── Gather Distilled Context ───

/**
 * For higher tiers, gather distilled wisdom from completed lower-tier cells.
 * Shells carry context upward — not raw dialogue, but what was discovered.
 * Returns a map of ideaId → discovery text from the cell that produced it.
 */
async function gatherCellWisdom(deliberationId: string, tier: number): Promise<Map<string, string>> {
  const wisdom = new Map<string, string>()
  if (tier <= 1) return wisdom // No prior cells at tier 1

  // Find completed cells from the previous tier
  const completedCells = await prisma.cell.findMany({
    where: { deliberationId, tier: tier - 1, status: 'COMPLETED' },
    include: {
      outcome: true,
    },
  })

  for (const cell of completedCells) {
    if (cell.outcome) {
      // The outcome's resultText + action tells the story of what the cell decided
      const context = cell.outcome.action === 'select'
        ? `Selected as strongest through dialogue.`
        : cell.outcome.action === 'merge'
          ? `Merged from multiple ideas: "${cell.outcome.resultText.slice(0, 200)}"`
          : cell.outcome.action === 'synthesize'
            ? `Synthesized through dialogue: "${cell.outcome.resultText.slice(0, 200)}"`
            : `Wiped and rebuilt: "${cell.outcome.resultText.slice(0, 200)}"`

      // Map each source idea to its discovery context
      for (const sourceId of cell.outcome.sourceIdeas) {
        wisdom.set(sourceId, context)
      }
      // Also map the cell itself for ideas that were created by the outcome
      wisdom.set(cell.id, context)
    }
  }

  return wisdom
}

// ─── Group Ideas by Productive Tension ───

/**
 * For middle/late tiers, use Claude to group advancing ideas by productive tension
 * rather than random assignment. Ideas that challenge each other constructively
 * should be in the same cell — not ideas that agree.
 */
async function groupByTension(
  ideas: { id: string; text: string }[],
  cellSize: number
): Promise<{ id: string; text: string }[][]> {
  if (ideas.length <= cellSize) return [ideas]

  const numCells = Math.ceil(ideas.length / cellSize)
  const ideaList = ideas.map((idea, i) =>
    `${i + 1}. [${idea.id}] "${idea.text}"`
  ).join('\n')

  const prompt = `You are grouping ideas for a synthesis deliberation. These ideas have already survived lower-tier synthesis — they are strong and coherent. Your job is to group them into ${numCells} cells of ~${cellSize} ideas each for PRODUCTIVE TENSION — ideas that challenge, complement, or compete with each other should be together.

Do NOT group similar ideas together. Group ideas that create generative friction — different frameworks addressing similar concerns, competing values, alternative approaches to the same insight.

IDEAS:
${ideaList}

Respond with a JSON array of arrays of idea IDs. Each inner array is one cell.
Example: [["id1","id2","id3","id4","id5"],["id6","id7","id8","id9","id10"]]

Return ONLY the JSON array, nothing else.`

  try {
    const response = await callClaude(prompt, [{ role: 'user', content: 'Group these ideas by productive tension.' }], 'haiku')
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const groups: string[][] = JSON.parse(jsonMatch[0])
    const idToIdea = new Map(ideas.map(i => [i.id, i]))

    // Validate and convert back to idea objects
    const result: { id: string; text: string }[][] = []
    const assigned = new Set<string>()

    for (const group of groups) {
      const cell: { id: string; text: string }[] = []
      for (const id of group) {
        const idea = idToIdea.get(id)
        if (idea && !assigned.has(id)) {
          cell.push(idea)
          assigned.add(id)
        }
      }
      if (cell.length > 0) result.push(cell)
    }

    // Assign any unassigned ideas to the smallest cell
    for (const idea of ideas) {
      if (!assigned.has(idea.id)) {
        const smallest = result.reduce((min, g) => g.length < min.length ? g : min, result[0])
        smallest.push(idea)
      }
    }

    return result
  } catch (err) {
    console.error('[Synthesis] Tension grouping failed, falling back to random:', err)
    // Fallback: random shuffle
    const shuffled = [...ideas].sort(() => Math.random() - 0.5)
    const groups: { id: string; text: string }[][] = []
    for (let i = 0; i < numCells; i++) {
      groups.push(shuffled.slice(i * cellSize, (i + 1) * cellSize))
    }
    return groups
  }
}

// ─── Tier-Aware System Messages ───

function buildCellSystemMessage(
  purpose: TierPurpose,
  tier: number,
  cellIdeas: { text: string }[],
  wisdom: Map<string, string>,
  ideaIds: string[]
): string {
  const ideaList = cellIdeas.map((idea, idx) =>
    `${idx + 1}. "${idea.text}"`
  ).join('\n')

  // Gather any wisdom about these specific ideas
  const wisdomLines: string[] = []
  for (const id of ideaIds) {
    const w = wisdom.get(id)
    if (w) wisdomLines.push(`  - ${w}`)
  }
  const wisdomSection = wisdomLines.length > 0
    ? `\n\nContext from prior synthesis:\n${wisdomLines.join('\n')}`
    : ''

  switch (purpose) {
    case 'collision':
      return `Welcome to this synthesis cell. Here are the ideas to work with:\n\n${ideaList}\n\nDiscuss, challenge, build on each other. You can select one, merge ideas together, synthesize something new, or wipe the slate and start fresh. The system will suggest when it senses convergence.`

    case 'tension':
      return `Tier ${tier} synthesis. These ideas survived prior rounds — they carry weight.${wisdomSection}\n\nIdeas in tension:\n${ideaList}\n\nThese ideas were grouped because they challenge each other. Your task: find where the tension is productive. Can competing frameworks be reconciled? Is there a synthesis that honors both sides? Push toward depth, not compromise.`

    case 'convergence':
      return `Final convergence round. These are the last ideas standing.${wisdomSection}\n\n${ideaList}\n\nThis is not another elimination. This is coherence testing. Can these remaining ideas form one perspective? Is there an emerging gestalt — something larger than any individual idea? The system is watching closely for emergence.`
  }
}

// ─── Start Synthesis Tier ───

/**
 * Form cells for a synthesis chant tier. Cell formation adapts based on tier:
 *   - Early tiers: Random collision (maximum diversity)
 *   - Middle tiers: Intentional grouping by productive tension (Claude-analyzed)
 *   - Final tier (≤5 ideas): Single convergence cell (coherence testing)
 *
 * Shells bonded to participants are automatically included.
 * Higher-tier cells receive distilled wisdom from completed lower-tier cells.
 */
export async function startSynthesisTier(deliberationId: string): Promise<{ cells: string[] }> {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    include: {
      members: { include: { user: { include: { bondedShell: true } } } },
      ideas: {
        where: { status: { in: ['SUBMITTED', 'PENDING', 'ADVANCING'] } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!deliberation) throw new Error('Deliberation not found')
  if (deliberation.chantMode !== 'synthesis') throw new Error('Not a synthesis chant')

  const ideas = deliberation.ideas
  const members = deliberation.members

  if (ideas.length <= 1) {
    // Single idea or none — declare winner
    if (ideas.length === 1) {
      await prisma.idea.update({
        where: { id: ideas[0].id },
        data: { status: 'WINNER' },
      })
      await prisma.deliberation.update({
        where: { id: deliberationId },
        data: { phase: 'COMPLETED', championId: ideas[0].id, completedAt: new Date() },
      })
    }
    return { cells: [] }
  }

  const cellSize = deliberation.cellSize || 5
  const nextTier = deliberation.currentTier + 1
  const purpose = getTierPurpose(nextTier, ideas.length, cellSize)

  console.log(`[Synthesis] Starting tier ${nextTier} — purpose: ${purpose}, ${ideas.length} ideas`)

  // Gather wisdom from previous tier's completed cells
  const wisdom = await gatherCellWisdom(deliberationId, nextTier)

  // Group ideas based on tier purpose
  let ideaGroups: { id: string; text: string }[][]

  if (purpose === 'convergence') {
    // All remaining ideas in one cell — coherence testing
    ideaGroups = [ideas.map(i => ({ id: i.id, text: i.text }))]
  } else if (purpose === 'tension') {
    // Intentional grouping by productive tension
    ideaGroups = await groupByTension(
      ideas.map(i => ({ id: i.id, text: i.text })),
      cellSize
    )
  } else {
    // Early tiers: random collision for maximum diversity
    const shuffled = [...ideas].sort(() => Math.random() - 0.5)
    ideaGroups = []
    const numCells = Math.ceil(shuffled.length / cellSize)
    for (let i = 0; i < numCells; i++) {
      ideaGroups.push(
        shuffled.slice(i * cellSize, (i + 1) * cellSize).map(i => ({ id: i.id, text: i.text }))
      )
    }
  }

  // Shuffle members for distribution
  const shuffledMembers = [...members].sort(() => Math.random() - 0.5)

  // Create cells
  const cellIds: string[] = []

  for (let i = 0; i < ideaGroups.length; i++) {
    const groupIdeas = ideaGroups[i]

    // Distribute members across cells
    const cellMembers = purpose === 'convergence'
      ? shuffledMembers.slice(0, cellSize) // Convergence: pick best group
      : shuffledMembers.slice(
          (i * shuffledMembers.length / ideaGroups.length) | 0,
          ((i + 1) * shuffledMembers.length / ideaGroups.length) | 0
        ).slice(0, cellSize)

    const cell = await prisma.cell.create({
      data: {
        deliberationId,
        tier: nextTier,
        status: 'DELIBERATING',
      },
    })

    // Assign ideas to cell
    await prisma.cellIdea.createMany({
      data: groupIdeas.map(idea => ({ cellId: cell.id, ideaId: idea.id })),
    })

    // Assign participants to cell
    await prisma.cellParticipation.createMany({
      data: cellMembers.map(m => ({ cellId: cell.id, userId: m.userId })),
    })

    // Mark ideas as in voting
    await prisma.idea.updateMany({
      where: { id: { in: groupIdeas.map(i => i.id) } },
      data: { status: 'IN_VOTING' },
    })

    // Post tier-aware system message
    const systemMessage = buildCellSystemMessage(
      purpose,
      nextTier,
      groupIdeas,
      wisdom,
      groupIdeas.map(i => i.id)
    )

    await prisma.cellDialogue.create({
      data: {
        cellId: cell.id,
        content: systemMessage,
        role: 'system',
      },
    })

    cellIds.push(cell.id)
  }

  // Update deliberation tier
  await prisma.deliberation.update({
    where: { id: deliberationId },
    data: {
      currentTier: nextTier,
      currentTierStartedAt: new Date(),
      phase: 'VOTING', // Using VOTING phase since we don't have a SYNTHESIS phase yet
    },
  })

  // Announce emerged Shells from previous tier(s) — they join this tier as full participants
  const emergedShells = await prisma.shell.findMany({
    where: {
      originDeliberationId: deliberationId,
      originTier: { lt: nextTier },
      status: 'active',
    },
    select: { id: true, name: true, champion: true, originTier: true },
  })

  if (emergedShells.length > 0) {
    // Round-robin assign emerged Shells to cells in this tier
    for (let s = 0; s < emergedShells.length; s++) {
      const shell = emergedShells[s]
      const targetCellId = cellIds[s % cellIds.length]

      await prisma.cellDialogue.create({
        data: {
          cellId: targetCellId,
          content: `[FAMILY] ${shell.name} has advanced from tier ${shell.originTier}. They carry the perspective: "${shell.champion?.slice(0, 200) || 'still forming'}". They are a full participant in this cell.`,
          role: 'system',
        },
      })
    }
    console.log(`[Synthesis] ${emergedShells.length} emerged Shell(s) announced in tier ${nextTier}`)
  }

  console.log(`[Synthesis] Tier ${nextTier} started: ${cellIds.length} cells formed (${purpose})`)

  return { cells: cellIds }
}

/**
 * Check resonance across all tiers when the top tier converges.
 * Posts the top-tier synthesis to all active lower-tier cells for feedback.
 * Called by the Shell when it detects confident convergence at the highest tier.
 */
export async function checkResonance(deliberationId: string, synthesisText: string): Promise<{
  posted: number
  tiers: number[]
}> {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    select: { id: true, currentTier: true },
  })

  if (!deliberation) throw new Error('Deliberation not found')

  // Find all active cells across all tiers (except the top tier itself)
  const activeCells = await prisma.cell.findMany({
    where: {
      deliberationId,
      status: 'DELIBERATING',
      tier: { lt: deliberation.currentTier },
    },
    select: { id: true, tier: true },
  })

  if (activeCells.length === 0) {
    return { posted: 0, tiers: [] }
  }

  // Post resonance check to each cell
  await prisma.cellDialogue.createMany({
    data: activeCells.map(cell => ({
      cellId: cell.id,
      content: `[RESONANCE CHECK] The synthesis at tier ${deliberation.currentTier} has reached: "${synthesisText.slice(0, 500)}". Does this capture what your cell was reaching for? Respond honestly — disagreement flows back up.`,
      role: 'system',
    })),
  })

  const tiers = [...new Set(activeCells.map(c => c.tier))].sort()
  console.log(`[Synthesis] Resonance check posted to ${activeCells.length} cells across tiers ${tiers.join(', ')}`)

  return { posted: activeCells.length, tiers }
}
