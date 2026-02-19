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
import { callClaude } from '@/lib/claude'

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

  // Don't check convergence on every message — every 3rd message after the first 5
  if (messageCount > 5 && (messageCount - 5) % 3 !== 0) {
    return { dialogue }
  }

  // Analyze convergence
  const analysis = await interpretCellIntent(cellId)

  // Post system suggestion if warranted
  if (analysis.shouldSuggest) {
    const suggestion = await prisma.cellDialogue.create({
      data: {
        cellId,
        content: formatSystemSuggestion(analysis),
        role: 'system',
      },
    })
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

  return { outcomeId: outcome.id, advancingIdeaId }
}

// ─── Start Synthesis Tier ───

/**
 * Form cells for a synthesis chant tier. Same structure as classic
 * (5 participants, 5 ideas per cell) but cells start in DELIBERATING
 * status with dialogue enabled. Bonded Shells are automatically included.
 */
export async function startSynthesisTier(deliberationId: string): Promise<{ cells: string[] }> {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    include: {
      members: { include: { user: { include: { bondedShell: true } } } },
      ideas: {
        where: { status: { in: ['PENDING', 'ADVANCING'] } },
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

  // Shuffle ideas and members
  const shuffledIdeas = [...ideas].sort(() => Math.random() - 0.5)
  const shuffledMembers = [...members].sort(() => Math.random() - 0.5)

  // Create cells: each gets up to cellSize ideas and cellSize participants
  const cellIds: string[] = []
  const numCells = Math.ceil(shuffledIdeas.length / cellSize)

  for (let i = 0; i < numCells; i++) {
    const cellIdeas = shuffledIdeas.slice(i * cellSize, (i + 1) * cellSize)
    const cellMembers = shuffledMembers.slice(
      (i * shuffledMembers.length / numCells) | 0,
      ((i + 1) * shuffledMembers.length / numCells) | 0
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
      data: cellIdeas.map(idea => ({ cellId: cell.id, ideaId: idea.id })),
    })

    // Assign participants to cell
    await prisma.cellParticipation.createMany({
      data: cellMembers.map(m => ({ cellId: cell.id, userId: m.userId })),
    })

    // Mark ideas as in voting
    await prisma.idea.updateMany({
      where: { id: { in: cellIdeas.map(i => i.id) } },
      data: { status: 'IN_VOTING' },
    })

    // Post initial system message with the ideas
    const ideaList = cellIdeas.map((idea, idx) =>
      `${idx + 1}. "${idea.text}"`
    ).join('\n')

    await prisma.cellDialogue.create({
      data: {
        cellId: cell.id,
        content: `Welcome to this synthesis cell. Here are the ideas to work with:\n\n${ideaList}\n\nDiscuss, challenge, build on each other. You can select one, merge ideas together, synthesize something new, or wipe the slate and start fresh. The system will suggest when it senses convergence.`,
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

  return { cells: cellIds }
}
