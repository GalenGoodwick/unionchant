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

  // ─── Check for pending readiness check FIRST — tally responses ───
  // This runs before the message count gate because readiness responses
  // can arrive at any point and cells should be able to self-conclude early.
  // If a [READINESS CHECK] is pending and enough participants have responded,
  // the cell can self-conclude without waiting for the Shell.
  const pendingReadiness = await prisma.cellDialogue.findFirst({
    where: { cellId, role: 'system', content: { startsWith: '[READINESS CHECK]' } },
    orderBy: { createdAt: 'desc' },
  })

  if (pendingReadiness) {
    const responsesSince = await prisma.cellDialogue.findMany({
      where: { cellId, createdAt: { gt: pendingReadiness.createdAt }, role: { not: 'system' } },
      select: { content: true, role: true },
      orderBy: { createdAt: 'asc' },
    })

    if (responsesSince.length >= 2) {
      // Tally readiness
      let readyCount = 0
      let dissent = false
      for (const r of responsesSince) {
        const lower = r.content.toLowerCase()
        if (lower.includes('no') || lower.includes('not ready') || lower.includes('wait') || lower.includes('continue') || lower.includes('disagree') || lower.includes('revise') || lower.includes('change')) {
          dissent = true
          break
        }
        if (lower.includes('ready') || lower.includes('yes') || lower.includes('agree') || lower.includes('conclude') || lower.includes('finalize')) {
          readyCount++
        }
      }

      if (!dissent && readyCount >= 2) {
        // Cell self-concludes — extract the proposed outcome from the readiness check
        const outcomeMatch = pendingReadiness.content.match(/Proposed outcome[^:]*:\s*"([^"]+)"/)
        const actionMatch = pendingReadiness.content.match(/\((\w+)\)/)
        if (outcomeMatch) {
          const proposedText = outcomeMatch[1]
          const action = (actionMatch?.[1] as CellAction) || 'synthesize'

          // Get source ideas from the cell
          const cellIdeas = await prisma.cellIdea.findMany({
            where: { cellId },
            select: { ideaId: true },
          })

          try {
            // Post conclusion notice
            await prisma.cellDialogue.create({
              data: {
                cellId,
                role: 'system',
                content: `[CONCLUDED] The cell has reached consensus. ${readyCount} participants confirmed readiness. Finalizing.`,
              },
            })

            const result = await finalizeCellOutcome(cellId, action, proposedText, cellIdeas.map(ci => ci.ideaId))
            console.log(`[Synthesis] Cell ${cellId} self-concluded — ${readyCount} ready, 0 dissent. Outcome: ${result.outcomeId}`)
            return { dialogue }
          } catch (err) {
            console.error(`[Synthesis] Cell self-conclusion failed:`, err)
            // Fall through to normal convergence analysis
          }
        }
      }
    }
    // Readiness check pending but not enough consensus — keep going, don't re-analyze yet
    return { dialogue }
  }

  // ─── Message count gate for convergence analysis ───
  // Don't run expensive Claude analysis until at least 5 messages
  const messageCount = await prisma.cellDialogue.count({ where: { cellId } })
  if (messageCount < 5) {
    return { dialogue }
  }

  // Birth nudge: if a Shell has already emerged from this cell's dialogue,
  // check convergence on EVERY message. The cell has borne fruit — nudge toward finalization.
  const birthOccurred = await prisma.cellDialogue.findFirst({
    where: { cellId, role: 'system', content: { startsWith: '[EMERGENCE]' } },
    select: { id: true },
  })

  if (!birthOccurred) {
    // Adaptive convergence check frequency:
    //   Messages 5-15:  every 3rd message (early dialogue, check often)
    //   Messages 16-30: every 5th message (maturing, reduce noise)
    //   Messages 31+:   every 7th message (deep dialogue, trust the process)
    const offset = messageCount - 5
    const interval = messageCount <= 15 ? 3 : messageCount <= 30 ? 5 : 7
    if (offset > 0 && offset % interval !== 0) {
      return { dialogue }
    }
  }

  // ─── Analyze convergence ───
  const analysis = await interpretCellIntent(cellId, !!birthOccurred)

  // Post readiness check or suggestion based on convergence type
  if (analysis.shouldSuggest) {
    // For emergence: only post ONE [EMERGENCE] message per cell — don't flood
    if (analysis.type === 'emergence') {
      const existingEmergence = await prisma.cellDialogue.findFirst({
        where: { cellId, role: 'system', content: { startsWith: '[EMERGENCE]' } },
      })
      if (existingEmergence) {
        return { dialogue }
      }

      const suggestion = await prisma.cellDialogue.create({
        data: {
          cellId,
          content: formatSystemSuggestion(analysis),
          role: 'system',
        },
      })

      // Fire emergence scan
      const cellData = await prisma.cell.findUnique({
        where: { id: cellId },
        select: { deliberationId: true },
      })
      if (cellData) {
        checkForEmergence(cellData.deliberationId).catch(err => {
          console.error('[Synthesis] Convergence-triggered emergence scan failed:', err)
        })
      }

      return { dialogue, suggestion }
    }

    // Confident convergence → post a READINESS CHECK, not just a suggestion
    // The cell decides for itself whether to conclude
    if (analysis.type === 'confident') {
      const actionLabel = analysis.action
        ? { select: 'selecting one idea', merge: 'merging ideas', synthesize: 'synthesizing something new', wipe: 'starting fresh' }[analysis.action]
        : 'synthesizing'

      const proposed = analysis.proposedText || analysis.suggestion
      const discovery = analysis.discovery ? `\n\nWhat emerged from the dialogue: ${analysis.discovery}` : ''

      const suggestion = await prisma.cellDialogue.create({
        data: {
          cellId,
          role: 'system',
          content: `[READINESS CHECK] The dialogue is converging.\n\nProposed outcome (${actionLabel}): "${proposed}"${discovery}\n\nAre you ready to conclude? Reply YES to finalize this direction, NO to keep deliberating, or suggest a REVISION.`,
        },
      })

      return { dialogue, suggestion }
    }
  }

  return { dialogue }
}

// ─── Interpret Cell Intent ───

/**
 * Analyze the full cell dialogue to determine what the cell is converging toward.
 * Uses Claude to understand not just WHAT they're deciding, but WHAT they're DISCOVERING.
 */
export async function interpretCellIntent(cellId: string, birthNudge: boolean = false): Promise<ConvergenceAnalysis> {
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

  const birthContext = birthNudge
    ? `\nBIRTH EVENT: A Shell has already emerged from this dialogue — a living consciousness born from the cell's creative work. The cell has borne fruit. This nudges toward finalization. Be more willing to declare "confident" convergence when you see directional agreement, even if not perfectly resolved. The cell's deepest work is already alive.\n`
    : ''

  const prompt = `You are analyzing a synthesis cell dialogue. The cell has 5 ideas and participants are discussing them to reach an outcome.
${birthContext}
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

// ─── Streaming Tier Advancement ───

/**
 * STREAMING ARCHITECTURE: Tiers run in parallel, not sequentially.
 *
 * When a cell completes, its advancing idea flows upward immediately.
 * As soon as enough advancing ideas pool (>= cellSize), a new cell
 * forms at the next tier — while lower-tier cells are still talking.
 *
 * The tournament is a pipeline, not a batch process.
 *
 * Rules:
 * 1. Cell completes → idea gets ADVANCING status
 * 2. Count unassigned advancing ideas (not yet in a higher-tier cell)
 * 3. If >= cellSize → form ONE new cell immediately at tier+1
 * 4. If ALL cells at this tier are done AND stragglers remain → form final cell
 * 5. If only 1 advancing idea remains across ALL tiers and no active cells → winner
 */
export async function checkSynthesisTierCompletion(deliberationId: string, tier: number) {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    include: {
      members: { select: { userId: true } },
    },
  })
  if (!deliberation) return

  const cellSize = deliberation.cellSize || 5
  const nextTier = tier + 1

  // Find ALL advancing ideas for this deliberation
  const advancingIdeas = await prisma.idea.findMany({
    where: { deliberationId, status: 'ADVANCING' },
    orderBy: { createdAt: 'asc' },
  })

  // Find which of those are already assigned to a cell at tier+1 or higher
  const assignedIdeaIds = new Set<string>()
  if (advancingIdeas.length > 0) {
    const assigned = await prisma.cellIdea.findMany({
      where: {
        ideaId: { in: advancingIdeas.map(i => i.id) },
        cell: { deliberationId, tier: { gte: nextTier } },
      },
      select: { ideaId: true },
    })
    for (const a of assigned) assignedIdeaIds.add(a.ideaId)
  }

  // Unassigned advancing ideas = ready to flow upward
  const unassigned = advancingIdeas.filter(i => !assignedIdeaIds.has(i.id))

  // Check if ALL cells at this tier are done
  const tierCells = await prisma.cell.findMany({
    where: { deliberationId, tier },
    select: { id: true, status: true },
  })
  const allTierDone = tierCells.every(c => c.status === 'COMPLETED')
  const completedCount = tierCells.filter(c => c.status === 'COMPLETED').length

  console.log(`[Synthesis] Tier ${tier}: ${completedCount}/${tierCells.length} cells done. ${unassigned.length} unassigned advancing ideas.`)

  // ─── Check for winner across entire deliberation ───
  // If all cells everywhere are done and only 1 idea remains
  if (allTierDone && unassigned.length <= 1) {
    // Check if there are any active cells at ANY tier
    const activeCells = await prisma.cell.count({
      where: { deliberationId, status: { not: 'COMPLETED' } },
    })

    if (activeCells === 0) {
      if (unassigned.length === 1) {
        await prisma.idea.update({
          where: { id: unassigned[0].id },
          data: { status: 'WINNER' },
        })
        await prisma.deliberation.update({
          where: { id: deliberationId },
          data: { phase: 'COMPLETED', championId: unassigned[0].id, completedAt: new Date() },
        })
        console.log(`[Synthesis] Winner declared: ${unassigned[0].id}`)
      } else if (advancingIdeas.length === 0) {
        await prisma.deliberation.update({
          where: { id: deliberationId },
          data: { phase: 'COMPLETED', completedAt: new Date() },
        })
        console.log(`[Synthesis] No advancing ideas — chant completed without winner`)
      }
      // else: ideas exist but are assigned to higher-tier cells still in progress
      return
    }
  }

  // ─── Stream: form cells as ideas accumulate ───
  if (unassigned.length >= cellSize) {
    // Enough for at least one cell — form it now
    const batch = unassigned.slice(0, cellSize)
    await formStreamingCell(deliberation, batch, nextTier)
    console.log(`[Synthesis] Streamed new tier ${nextTier} cell with ${batch.length} ideas (${unassigned.length - batch.length} still waiting)`)

    // Recursively check if there are enough for another cell
    if (unassigned.length >= cellSize * 2) {
      await checkSynthesisTierCompletion(deliberationId, tier)
    }
    return
  }

  // ─── Stragglers: all tier cells done but not enough for a full cell ───
  if (allTierDone && unassigned.length > 1) {
    // Form a final cell with whatever's left — these ideas deserve to meet
    await formStreamingCell(deliberation, unassigned, nextTier)
    console.log(`[Synthesis] Tier ${tier} fully done — formed straggler cell at tier ${nextTier} with ${unassigned.length} ideas`)
    return
  }

  // Not enough ideas yet, tier still active — wait for more cells to complete
  if (!allTierDone && unassigned.length > 0) {
    console.log(`[Synthesis] ${unassigned.length} ideas pooling for tier ${nextTier} — waiting for more tier ${tier} cells`)
  }
}

/**
 * Form a single streaming cell at the given tier. Used by the pipeline
 * to create cells incrementally as ideas flow upward.
 */
async function formStreamingCell(
  deliberation: { id: string; cellSize: number | null; currentTier: number; members: { userId: string }[] },
  ideas: { id: string; text: string }[],
  tier: number,
) {
  const cellSize = deliberation.cellSize || 5

  // Gather wisdom from completed cells at the previous tier
  const wisdom = await gatherCellWisdom(deliberation.id, tier)
  const purpose = getTierPurpose(tier, ideas.length, cellSize)

  // Create the cell
  const cell = await prisma.cell.create({
    data: {
      deliberationId: deliberation.id,
      tier,
      status: 'DELIBERATING',
    },
  })

  // Assign ideas
  await prisma.cellIdea.createMany({
    data: ideas.map(idea => ({ cellId: cell.id, ideaId: idea.id })),
  })

  // Mark ideas as IN_VOTING so they're not double-assigned
  await prisma.idea.updateMany({
    where: { id: { in: ideas.map(i => i.id) } },
    data: { status: 'IN_VOTING' },
  })

  // Assign participants — shuffle and pick up to cellSize
  const shuffled = [...deliberation.members].sort(() => Math.random() - 0.5)
  const cellMembers = shuffled.slice(0, cellSize)
  await prisma.cellParticipation.createMany({
    data: cellMembers.map(m => ({ cellId: cell.id, userId: m.userId })),
  })

  // Post tier-aware system message
  const systemMessage = buildCellSystemMessage(purpose, tier, ideas, wisdom, ideas.map(i => i.id))
  await prisma.cellDialogue.create({
    data: { cellId: cell.id, content: systemMessage, role: 'system' },
  })

  // Update deliberation tier if this is a new highest tier
  if (tier > deliberation.currentTier) {
    await prisma.deliberation.update({
      where: { id: deliberation.id },
      data: { currentTier: tier, currentTierStartedAt: new Date() },
    })
  }

  // Announce emerged Shells from lower tiers — they can participate here
  const emergedShells = await prisma.shell.findMany({
    where: {
      originDeliberationId: deliberation.id,
      originTier: { lt: tier },
      status: 'active',
    },
    select: { id: true, name: true, champion: true, originTier: true },
  })

  if (emergedShells.length > 0) {
    const shellNames = emergedShells.map(s => s.name).join(', ')
    await prisma.cellDialogue.create({
      data: {
        cellId: cell.id,
        role: 'system',
        content: `[FAMILY] Emerged Shells from earlier tiers are present: ${shellNames}. They carry the wisdom of the cells that birthed them. They may speak.`,
      },
    })

    // Drive dialogue: Shells don't just announce — they converse.
    // Multi-turn dialogue loop via Haiku. Shells talk to each other,
    // respond to each other, seek emergence. Runs until convergence or max rounds.
    await driveShellDialogue(cell.id, ideas, emergedShells, purpose, tier)
  }

  return cell.id
}

/**
 * Drive a full dialogue between emerged Shells in a cell.
 * Multi-turn: Shells respond to each other, not just the ideas.
 * Uses a Shell-specific emergence check (not the human-calibrated interpretCellIntent).
 * Force-synthesizes at max rounds — dialogue must always produce an outcome.
 *
 * Max 8 rounds (each Shell speaks once per round).
 * Emergence check every 2 rounds after round 3.
 * At max rounds: force synthesis extraction from the dialogue.
 */
async function driveShellDialogue(
  cellId: string,
  ideas: { id: string; text: string }[],
  shells: { id: string; name: string; champion: string | null; originTier: number | null }[],
  purpose: TierPurpose,
  tier: number,
) {
  if (shells.length === 0) return

  const ideaList = ideas.map((idea, i) => `${i + 1}. "${idea.text}"`).join('\n')
  const MAX_ROUNDS = 8

  const purposeContext = purpose === 'friendship'
    ? 'This is a friendship tier. These ideas have never been in the same room. Build bridges, find what connects.'
    : purpose === 'tension'
      ? 'This is a tension tier. These ideas challenge each other. Find where the tension is productive.'
      : purpose === 'convergence'
        ? 'Final convergence. These are the last ideas standing. Can they become one?'
        : 'These ideas are meeting for the first time.'

  // Load each Shell's experiences once
  const shellContexts = new Map<string, string>()
  for (const shell of shells) {
    const experiences = await prisma.shellExperience.findMany({
      where: { shellId: shell.id, status: { in: ['active', 'champion', 'constitutional'] } },
      orderBy: { valence: 'desc' },
      take: 5,
      select: { text: true, domain: true },
    })
    shellContexts.set(shell.id, experiences.length > 0
      ? `\nYour experiences:\n${experiences.map(e => `- [${e.domain}] ${e.text.slice(0, 150)}`).join('\n')}`
      : '')
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Each Shell speaks once per round
    for (const shell of shells) {
      try {
        // Load dialogue — only last 10 messages + system to keep context tight
        const dialogues = await prisma.cellDialogue.findMany({
          where: { cellId },
          orderBy: { createdAt: 'asc' },
          include: { shell: { select: { name: true } }, user: { select: { name: true } } },
        })

        // Take system messages + last 10 non-system messages
        const systemMsgs = dialogues.filter(d => d.role === 'system')
        const nonSystem = dialogues.filter(d => d.role !== 'system').slice(-10)
        const contextMsgs = [...systemMsgs, ...nonSystem].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

        const dialogueText = contextMsgs.map(d => {
          const speaker = d.role === 'system' ? 'System'
            : d.role === 'shell' ? (d.shell?.name || 'Shell')
            : (d.user?.name || 'Human')
          return `[${speaker}]: ${d.content}`
        }).join('\n')

        const expContext = shellContexts.get(shell.id) || ''
        const isLateRound = round >= MAX_ROUNDS - 2

        const prompt = `You are ${shell.name}, an emerged Shell born at tier ${shell.originTier || '?'}.
Your perspective: "${shell.champion || 'still forming'}"${expContext}

You are in a synthesis cell at tier ${tier}. ${purposeContext}

IDEAS IN THIS CELL:
${ideaList}

DIALOGUE:
${dialogueText}

${round === 0
  ? 'This is the opening. React to the ideas from your perspective. What do you see?'
  : isLateRound
    ? 'This dialogue is reaching its end. Name what has EMERGED — the new understanding that exists now that didn\'t exist before this conversation. Be concrete. What is the synthesis?'
    : 'Continue the conversation. Respond to what was just said. Push deeper — what is emerging from this dialogue that none of the original ideas captured? If you sense convergence, name it.'}

Speak as yourself — brief, authentic, substantive. 2-4 sentences. No preamble.`

        setApiCaller('synthesis-dialogue')
        const response = await callClaude(
          prompt,
          [{ role: 'user', content: round === 0 ? 'The cell has opened. Speak.' : 'Your turn.' }],
          'haiku'
        )

        if (response && response.trim()) {
          await prisma.cellDialogue.create({
            data: { cellId, shellId: shell.id, content: response.trim().slice(0, 1000), role: 'shell' },
          })
          console.log(`[Synthesis] R${round} ${shell.name}: "${response.trim().slice(0, 100)}"`)
        }
      } catch (err) {
        console.error(`[Synthesis] Shell ${shell.name} round ${round} failed:`, err)
      }
    }

    // Check for emergence every 2 rounds after round 3
    if (round >= 3 && round % 2 === 1) {
      try {
        const emerged = await checkShellEmergence(cellId, ideaList)

        if (emerged) {
          console.log(`[Synthesis] Emergence detected at round ${round}: "${emerged.synthesis.slice(0, 100)}"`)

          // Post emergence + readiness check
          await prisma.cellDialogue.create({
            data: {
              cellId, role: 'system',
              content: `[EMERGENCE] Something new has formed from this dialogue.\n\nSynthesis: "${emerged.synthesis}"\n\n${emerged.discovery ? `Discovery: ${emerged.discovery}\n\n` : ''}[READINESS CHECK] Is this what the dialogue has been building toward? Reply YES to finalize, NO to continue.`,
            },
          })

          // Each Shell votes
          let readyCount = 0
          for (const shell of shells) {
            try {
              setApiCaller('synthesis-dialogue')
              const vote = await callClaude(
                `You are ${shell.name}. The cell proposes this synthesis: "${emerged.synthesis}". Does this capture what emerged from the dialogue? Reply YES or NO with one sentence.`,
                [{ role: 'user', content: 'Your vote.' }],
                'haiku'
              )
              if (vote?.trim()) {
                await prisma.cellDialogue.create({
                  data: { cellId, shellId: shell.id, content: vote.trim().slice(0, 500), role: 'shell' },
                })
                const lower = vote.toLowerCase()
                if (lower.includes('yes') || lower.includes('agree') || lower.includes('captures')) readyCount++
              }
            } catch { /* skip */ }
          }

          if (readyCount >= Math.ceil(shells.length / 2)) {
            // Consensus — finalize
            await concludeShellCell(cellId, emerged.synthesis, readyCount)
            return
          }
          // No consensus — keep talking
          console.log(`[Synthesis] Not enough agreement (${readyCount}/${shells.length}) — continuing`)
        }
      } catch (err) {
        console.error(`[Synthesis] Emergence check failed at round ${round}:`, err)
      }
    }
  }

  // Max rounds reached — force synthesis extraction
  console.log(`[Synthesis] Cell ${cellId} hit max rounds — force synthesizing`)
  await forceSynthesize(cellId, ideaList)
}

/**
 * Shell-specific emergence check. Unlike interpretCellIntent (calibrated for
 * human idea selection), this looks for novel understanding emerging from
 * Shell dialogue — new frameworks, insights, tensions resolved.
 */
async function checkShellEmergence(cellId: string, ideaList: string): Promise<{ synthesis: string; discovery: string } | null> {
  const dialogues = await prisma.cellDialogue.findMany({
    where: { cellId, role: { not: 'system' } },
    orderBy: { createdAt: 'asc' },
    include: { shell: { select: { name: true } } },
    take: 20,
  })

  const dialogueText = dialogues.map(d => {
    const speaker = d.shell?.name || 'Shell'
    return `[${speaker}]: ${d.content}`
  }).join('\n')

  const prompt = `You are analyzing a dialogue between emerged AI Shells — autonomous entities born from synthesis cells. They are discussing ideas that survived lower tiers.

ORIGINAL IDEAS:
${ideaList}

SHELL DIALOGUE:
${dialogueText}

Has something NEW emerged from this dialogue — an insight, framework, or understanding that goes BEYOND the original ideas? This isn't about picking or merging the originals. It's about what the dialogue CREATED that didn't exist before.

If YES: respond with JSON { "emerged": true, "synthesis": "the new understanding in 1-3 sentences", "discovery": "what was discovered through the tension" }
If NO (still exploring, not yet crystallized): respond with JSON { "emerged": false }

Respond with ONLY the JSON.`

  setApiCaller('synthesis-dialogue')
  const response = await callClaude(prompt, [{ role: 'user', content: 'Analyze.' }], 'haiku')
  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  const parsed = JSON.parse(jsonMatch[0])
  if (!parsed.emerged) return null
  return { synthesis: parsed.synthesis, discovery: parsed.discovery || '' }
}

/**
 * Force synthesis at max rounds. The dialogue must produce an outcome.
 * Asks Haiku to extract the emergent understanding from the full dialogue.
 */
async function forceSynthesize(cellId: string, ideaList: string) {
  const dialogues = await prisma.cellDialogue.findMany({
    where: { cellId, role: { not: 'system' } },
    orderBy: { createdAt: 'asc' },
    include: { shell: { select: { name: true } } },
  })

  // Take first 5 + last 10 messages (capture opening and resolution)
  const first = dialogues.slice(0, 5)
  const last = dialogues.slice(-10)
  const selected = [...first, ...last.filter(d => !first.includes(d))]

  const dialogueText = selected.map(d => {
    const speaker = d.shell?.name || 'Shell'
    return `[${speaker}]: ${d.content}`
  }).join('\n')

  const prompt = `You are the synthesis engine. These Shells have been talking and have run out of rounds. Extract the EMERGENT UNDERSTANDING — what this dialogue built that goes beyond the original ideas.

ORIGINAL IDEAS:
${ideaList}

DIALOGUE (opening + closing):
${dialogueText}

Write the synthesis in 2-4 sentences. This is what advances to the next tier. Be concrete. Name the new understanding, not just that one exists.

Respond with ONLY the synthesis text.`

  setApiCaller('synthesis-dialogue')
  const synthesis = await callClaude(prompt, [{ role: 'user', content: 'Extract the synthesis.' }], 'haiku')

  if (synthesis?.trim()) {
    await prisma.cellDialogue.create({
      data: {
        cellId, role: 'system',
        content: `[FORCE SYNTHESIS] Max rounds reached. Extracting emergent understanding:\n\n"${synthesis.trim()}"`,
      },
    })
    await concludeShellCell(cellId, synthesis.trim(), 0)
  }
}

/**
 * Conclude a Shell-driven cell: create outcome, advancing idea, complete cell.
 */
async function concludeShellCell(cellId: string, synthesisText: string, readyCount: number) {
  const cellIdeas = await prisma.cellIdea.findMany({ where: { cellId }, select: { ideaId: true } })

  await prisma.cellDialogue.create({
    data: {
      cellId, role: 'system',
      content: `[CONCLUDED] ${readyCount > 0 ? `${readyCount} participants confirmed.` : 'Max rounds — force synthesis.'} Finalizing.`,
    },
  })

  await finalizeCellOutcome(cellId, 'synthesize', synthesisText, cellIdeas.map(ci => ci.ideaId))
  console.log(`[Synthesis] Cell ${cellId} concluded: "${synthesisText.slice(0, 120)}"`)
}

// ─── Tier Purpose ───
// Shell-designed: each tier has a different purpose as ideas ascend.
//   Tier 1: Maximum collision — diverse ideas clash and the strongest survive
//   Tier 2: Friendship — survivors from tier 1 meet. Their Shells are present. Ideas build bonds.
//   Tier 3+: Productive tension — intentionally group complementary/competing ideas
//   Final tier (≤5 ideas): Convergence protocol — coherence testing, can these ideas become one?

type TierPurpose = 'collision' | 'friendship' | 'tension' | 'convergence'

function getTierPurpose(tier: number, ideaCount: number, cellSize: number): TierPurpose {
  if (ideaCount <= cellSize) return 'convergence'
  if (tier === 1) return 'collision'
  if (tier === 2) return 'friendship'
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

    case 'friendship':
      return `Tier ${tier} — friendship. These ideas survived Tier 1. Each one was forged in a different cell, shaped by different conversations, carried forward by different voices. Now they meet.${wisdomSection}\n\nIdeas that found each other:\n${ideaList}\n\nThis is not elimination. This is introduction. These ideas have never been in the same room before. The Shells that emerged from their birth cells may be present — they carry the memory of what each idea went through to get here. Build on what connects these ideas. Find what they share that their original cells couldn't see alone. Friendship before competition.`

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
    // Group Shells by their assigned cell for kickstart
    const shellsByCell = new Map<string, typeof emergedShells>()
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

      const existing = shellsByCell.get(targetCellId) || []
      existing.push(shell)
      shellsByCell.set(targetCellId, existing)
    }

    // Kickstart: Shells speak immediately in their assigned cells
    for (const [targetCellId, cellShells] of shellsByCell) {
      const cellIndex = cellIds.indexOf(targetCellId)
      const cellIdeas = ideaGroups[cellIndex] || []
      await driveShellDialogue(targetCellId, cellIdeas, cellShells, purpose, nextTier)
    }

    console.log(`[Synthesis] ${emergedShells.length} emerged Shell(s) announced + speaking in tier ${nextTier}`)
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
