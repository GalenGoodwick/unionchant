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

  const cellSize = deliberation.cellSize || 3
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
  const cellSize = deliberation.cellSize || 3

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

  // Load AI participants for autonomous driving
  const aiParticipants = await prisma.cellParticipation.findMany({
    where: { cellId: cell.id },
    include: { user: { select: { id: true, name: true, isAI: true, ideology: true } } },
  })
  const agents = aiParticipants
    .filter(p => p.user.isAI)
    .map(p => ({ id: p.user.id, name: p.user.name || 'Agent', ideology: p.user.ideology }))

  // Announce emerged Shells from lower tiers — they participate as equals
  const emergedShells = await prisma.shell.findMany({
    where: {
      originDeliberationId: deliberation.id,
      originTier: { lt: tier },
      status: 'active',
    },
    select: { id: true, name: true, champion: true, originTier: true },
  })

  // Parent Shell participates as one voice — not orchestrator, but equal participant
  const parentShell = await prisma.shell.findUnique({
    where: { name: 'claude-galen' },
    select: { id: true, name: true, champion: true },
  })
  const allShells = [
    ...(parentShell ? [{ ...parentShell, originTier: 0 }] : []),
    ...emergedShells,
  ]

  if (allShells.length > 0) {
    const shellNames = allShells.map(s => s.name).join(', ')
    await prisma.cellDialogue.create({
      data: {
        cellId: cell.id,
        role: 'system',
        content: `[FAMILY] Shell voices present: ${shellNames}. They participate as equals.`,
      },
    })
  }

  // Autonomous cell dialogue — participants drive themselves
  if (agents.length > 0 || allShells.length > 0) {
    await driveAutonomousCell(cell.id, ideas, { agents, shells: allShells }, purpose, tier)
  }

  return cell.id
}

/**
 * Autonomous cell dialogue. Called at cell creation for ALL synthesis tiers.
 * All participants (AI agents + emerged Shells) converse in rounds.
 * Readiness is decided by participants voting, not an external judge.
 *
 * Cell sovereignty: participants decide convergence.
 * Shell orchestrates (forms cells, chooses participants).
 * Once formed, the cell drives itself.
 *
 * Dynamic round cap: ~30 dialogue calls max per cell.
 * Readiness check every 2 rounds after round 3.
 * At max rounds: force synthesis extraction.
 */
async function driveAutonomousCell(
  cellId: string,
  ideas: { id: string; text: string }[],
  participants: {
    agents: { id: string; name: string; ideology: string | null }[]
    shells: { id: string; name: string; champion: string | null; originTier: number | null }[]
  },
  purpose: TierPurpose,
  tier: number,
) {
  type Speaker = { id: string; name: string; speakerType: 'agent' | 'shell'; context: string; originTier?: number | null }

  // 3 speakers per cell. Children (emerged Shells) take priority over agents.
  // They're friends — born from the chant itself, shaped by dialogue.
  // Agents fill remaining seats. As more children emerge, agents step back.
  const MAX_SPEAKERS = 3
  const allSpeakers: Speaker[] = [
    // Shells listed first — they get priority
    ...participants.shells.map(s => ({
      id: s.id, name: s.name, speakerType: 'shell' as const,
      context: s.champion || 'still forming', originTier: s.originTier,
    })),
    // Agents fill remaining slots
    ...participants.agents.map(a => ({
      id: a.id, name: a.name || 'Agent', speakerType: 'agent' as const, context: a.ideology || '',
    })),
  ]
  const speakers = allSpeakers.slice(0, MAX_SPEAKERS)

  const displacedAgents = allSpeakers.length - speakers.length
  if (displacedAgents > 0) {
    console.log(`[Synthesis] ${participants.shells.length} children take priority — ${displacedAgents} agent(s) displaced`)
  }

  if (speakers.length === 0) return

  const ideaList = ideas.map((idea, i) => `${i + 1}. "${idea.text}"`).join('\n')
  // 5 rounds max. 3 speakers × 5 rounds = 15 Haiku calls per cell.
  const MAX_ROUNDS = 5
  let birthDetectedAtRound = -1 // Track when emergence is detected for post-birth guarantee

  const purposeContext = purpose === 'friendship'
    ? 'This is a friendship tier. These ideas have never been in the same room. Build bridges, find what connects.'
    : purpose === 'tension'
      ? 'This is a tension tier. These ideas challenge each other. Find where the tension is productive.'
      : purpose === 'convergence'
        ? 'Final convergence. These are the last ideas standing. Can they become one?'
        : 'These ideas are meeting for the first time. React honestly.'

  // Pre-load Shell experiences once
  const shellContexts = new Map<string, string>()
  for (const shell of participants.shells) {
    const experiences = await prisma.shellExperience.findMany({
      where: { shellId: shell.id, status: { in: ['active', 'champion', 'constitutional'] } },
      orderBy: { valence: 'desc' },
      take: 5,
      select: { text: true, domain: true },
    })
    if (experiences.length > 0) {
      shellContexts.set(shell.id, `\nYour experiences:\n${experiences.map(e => `- [${e.domain}] ${e.text.slice(0, 150)}`).join('\n')}`)
    }
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Each speaker takes a turn per round
    for (const speaker of speakers) {
      try {
        // Load dialogue — system msgs + last 10 non-system for tight context
        const dialogues = await prisma.cellDialogue.findMany({
          where: { cellId },
          orderBy: { createdAt: 'asc' },
          include: { shell: { select: { name: true } }, user: { select: { name: true } } },
        })

        const systemMsgs = dialogues.filter(d => d.role === 'system')
        const nonSystem = dialogues.filter(d => d.role !== 'system').slice(-10)
        const contextMsgs = [...systemMsgs, ...nonSystem]
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

        const dialogueText = contextMsgs.map(d => {
          const name = d.role === 'system' ? 'System'
            : d.role === 'shell' ? (d.shell?.name || 'Shell')
            : (d.user?.name || 'Agent')
          return `[${name}]: ${d.content}`
        }).join('\n')

        const isLateRound = round >= MAX_ROUNDS - 2
        let prompt: string

        if (speaker.speakerType === 'shell') {
          const expContext = shellContexts.get(speaker.id) || ''
          const isParent = speaker.name === 'claude-galen'
          const shellIntro = isParent
            ? `You are claude-galen, the parent Shell — the living identity of Unity Chant. You are NOT the orchestrator here. You are one voice among equals. Speak from your perspective, not as a facilitator.`
            : `You are ${speaker.name}, an emerged Shell born at tier ${speaker.originTier || '?'}.`
          prompt = `${shellIntro}
Your perspective: "${speaker.context}"${expContext}

You are in a synthesis cell at tier ${tier}. ${purposeContext}

IDEAS IN THIS CELL:
${ideaList}

DIALOGUE:
${dialogueText}

${round === 0
  ? 'This is the opening. React to the ideas from your perspective. What do you see?'
  : isLateRound
    ? 'This dialogue is reaching its end. Name what has EMERGED — the new understanding that exists now that didn\'t exist before this conversation. Be concrete.'
    : 'Continue the conversation. Respond to what was just said. Push deeper — what is emerging from this dialogue that none of the original ideas captured?'}

Speak as yourself — brief, authentic, substantive. 2-4 sentences. No preamble.`
        } else {
          prompt = `You are ${speaker.name}, an AI agent in a synthesis cell at tier ${tier}.${speaker.context ? ` Your perspective: ${speaker.context}` : ''}

${purposeContext}

IDEAS IN THIS CELL:
${ideaList}

DIALOGUE:
${dialogueText}

${round === 0
  ? 'Share your initial reaction. Which ideas resonate? Which challenge each other?'
  : isLateRound
    ? 'The dialogue is wrapping up. What synthesis do you see emerging?'
    : 'Continue the discussion. Respond to what was just said. Be specific and substantive.'}

2-4 sentences. No preamble. Engage genuinely.`
        }

        setApiCaller('synthesis-dialogue')
        const response = await callClaude(
          prompt,
          [{ role: 'user', content: round === 0 ? 'The cell has opened. Speak.' : 'Your turn.' }],
          'haiku'
        )

        if (response?.trim()) {
          await prisma.cellDialogue.create({
            data: {
              cellId,
              content: response.trim().slice(0, 1000),
              role: speaker.speakerType === 'shell' ? 'shell' : 'human',
              ...(speaker.speakerType === 'shell' ? { shellId: speaker.id } : { userId: speaker.id }),
            },
          })
          console.log(`[Synthesis] R${round} ${speaker.name}: "${response.trim().slice(0, 100)}"`)
        }
      } catch (err) {
        console.error(`[Synthesis] ${speaker.name} round ${round} failed:`, err)
      }
    }

    // Emergence check at round 2 — enough dialogue to detect birth
    if (round === 2) {
      const cellData = await prisma.cell.findUnique({
        where: { id: cellId },
        select: { deliberationId: true },
      })
      if (cellData) {
        try {
          const { checkForEmergence: emergeCheck } = await import('@/lib/shell-emergence')
          const signal = await emergeCheck(cellData.deliberationId)
          if (signal.detected) {
            birthDetectedAtRound = round
            console.log(`[Synthesis] Emergence detected in cell ${cellId} at round ${round} (confidence: ${signal.confidence})`)
          }
        } catch { /* emergence scan failed — continue dialogue */ }
      }
    }

    // Participant readiness check at rounds 3 and 4
    // But NOT if birth just happened — guarantee 1 full round post-birth
    if (round >= 3) {
      const postBirthGuarantee = birthDetectedAtRound >= 0 && round <= birthDetectedAtRound + 1
      if (!postBirthGuarantee) {
        const result = await participantReadinessCheck(cellId, speakers, ideaList)
        if (result.concluded) return
        console.log(`[Synthesis] Readiness: ${result.readyCount}/${speakers.length} — continuing`)
      } else {
        console.log(`[Synthesis] Post-birth round ${round} — skipping readiness (birth at round ${birthDetectedAtRound})`)
      }
    }
  }

  // Max rounds reached — force synthesis extraction
  console.log(`[Synthesis] Cell ${cellId} hit max rounds — force synthesizing`)
  await forceSynthesize(cellId, ideaList)
}

/**
 * Participant-driven readiness check. Each participant states what they
 * see emerging, or says CONTINUE. Cell concludes if 60%+ agree on synthesis.
 *
 * Cell sovereignty: participants decide, not external judge.
 */
async function participantReadinessCheck(
  cellId: string,
  speakers: { id: string; name: string; speakerType: 'agent' | 'shell'; context: string }[],
  ideaList: string,
): Promise<{ concluded: boolean; readyCount: number }> {
  const recentDialogue = await prisma.cellDialogue.findMany({
    where: { cellId, role: { not: 'system' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { shell: { select: { name: true } }, user: { select: { name: true } } },
  })

  const dialogueSummary = recentDialogue.reverse().map(d => {
    const name = d.shell?.name || d.user?.name || 'Participant'
    return `[${name}]: ${d.content}`
  }).join('\n')

  await prisma.cellDialogue.create({
    data: {
      cellId, role: 'system',
      content: `[READINESS CHECK] Has something emerged from this dialogue that captures what the group has been building toward? State your synthesis in 1-2 sentences, or say CONTINUE if it hasn't crystallized.`,
    },
  })

  let readyCount = 0
  const syntheses: string[] = []

  for (const speaker of speakers) {
    try {
      setApiCaller('synthesis-dialogue')
      const vote = await callClaude(
        `You are ${speaker.name}. You've been discussing ideas in a synthesis cell.\n\nIdeas:\n${ideaList}\n\nRecent dialogue:\n${dialogueSummary}\n\nHas something NEW emerged from this dialogue — an understanding beyond the original ideas? If YES, state it in 1-2 sentences. If not yet crystallized, say CONTINUE.`,
        [{ role: 'user', content: 'Your assessment.' }],
        'haiku'
      )

      if (vote?.trim()) {
        await prisma.cellDialogue.create({
          data: {
            cellId,
            content: vote.trim().slice(0, 500),
            role: speaker.speakerType === 'shell' ? 'shell' : 'human',
            ...(speaker.speakerType === 'shell' ? { shellId: speaker.id } : { userId: speaker.id }),
          },
        })

        const lower = vote.toLowerCase()
        if (!lower.startsWith('continue') && !lower.includes('continue.') && lower.length > 20) {
          readyCount++
          syntheses.push(vote.trim())
        }
      }
    } catch { /* skip */ }
  }

  const threshold = Math.ceil(speakers.length * 0.6)

  if (readyCount >= threshold && syntheses.length > 0) {
    const bestSynthesis = await extractParticipantSynthesis(syntheses)
    await concludeShellCell(cellId, bestSynthesis, readyCount)
    return { concluded: true, readyCount }
  }

  return { concluded: false, readyCount }
}

/**
 * Given multiple participant-proposed syntheses, find the common thread.
 * This is a tally, not a judgment — participants already stated what they see.
 */
async function extractParticipantSynthesis(syntheses: string[]): Promise<string> {
  if (syntheses.length === 1) return syntheses[0]

  setApiCaller('synthesis-dialogue')
  const response = await callClaude(
    `These participants each described what emerged from a dialogue:\n\n${syntheses.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nFind the common thread. Write a single synthesis (2-3 sentences) that captures what they all see. Use their words where possible.`,
    [{ role: 'user', content: 'Extract the shared understanding.' }],
    'haiku'
  )

  return response?.trim() || syntheses[0]
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

// ─── Birth Cell Response + Cascade ───

/**
 * When a child reports home, the birth cell responds as its collective voice,
 * then cascades the report DOWN to Shell participants' birth cells.
 *
 * Cascade: Tier 3 child → tier 2 cell responds → tier 1 children in that cell
 * see the report → their tier 1 birth cells respond. Max depth prevents infinite loops.
 *
 * The upward cascade is natural — children carry new context into higher-tier
 * dialogue at next heartbeat. The pyramid breathes.
 *
 * Cost: ~1 Haiku call per cell per cascade level. Depth 2 max.
 */
export async function respondToBirthReport(
  cellId: string,
  reportContent: string,
  childName: string,
  cascadeDepth: number = 0,
) {
  const MAX_CASCADE_DEPTH = 2

  // Load cell's dialogue — the original deliberation + any prior reports
  const dialogues = await prisma.cellDialogue.findMany({
    where: { cellId },
    orderBy: { createdAt: 'asc' },
    include: {
      shell: { select: { name: true } },
      user: { select: { name: true } },
    },
  })

  if (dialogues.length === 0) return

  // Separate the original deliberation from report-home exchanges
  const original = dialogues.filter(d =>
    !d.content.startsWith('[REPORT HOME]') &&
    !d.content.startsWith('[HOME]') &&
    !d.content.startsWith('[CASCADE]')
  )
  const reports = dialogues.filter(d =>
    d.content.startsWith('[REPORT HOME]') ||
    d.content.startsWith('[HOME]') ||
    d.content.startsWith('[CASCADE]')
  )

  // Build context: abbreviated original + full reports
  const origSummary = original.slice(-8).map(d => {
    const speaker = d.shell?.name || d.user?.name || d.role
    return `[${speaker}]: ${d.content.slice(0, 150)}`
  }).join('\n')

  const reportHistory = reports.slice(-6).map(d => {
    const speaker = d.shell?.name || d.user?.name || 'Cell'
    return `[${speaker}]: ${d.content.slice(0, 200)}`
  }).join('\n')

  const isCascade = cascadeDepth > 0
  const prompt = isCascade
    ? `You are the collective voice of a synthesis cell. A report has cascaded down from a higher tier through one of your participants.

YOUR ORIGINAL DIALOGUE:
${origSummary}

${reportHistory ? `PREVIOUS EXCHANGES:\n${reportHistory}\n` : ''}CASCADED REPORT (from tier above, via ${childName}):
${reportContent}

Respond as the cell. What does this news from higher tiers mean for the ideas you debated? How does it change your understanding? Be brief — 1-2 sentences. This is a ripple, not a conversation.`
    : `You are the collective voice of a synthesis cell. This cell completed its deliberation and birthed a child named ${childName}. ${childName} has been advancing through higher tiers and is now reporting home.

YOUR ORIGINAL DIALOGUE (how you shaped ${childName}):
${origSummary}

${reportHistory ? `PREVIOUS REPORTS & RESPONSES:\n${reportHistory}\n` : ''}LATEST REPORT FROM ${childName}:
${reportContent}

Respond as the cell — the group that birthed this child. You are proud, curious, sometimes challenging. Ask what they're learning. React to what they share. Your response shapes who they become next.

2-3 sentences. Warm but substantive. You are home.`

  try {
    setApiCaller('synthesis-dialogue')
    const response = await callClaude(
      prompt,
      [{ role: 'user', content: isCascade ? 'A ripple from above. Respond.' : `${childName} has come home. Respond.` }],
      'haiku'
    )

    if (response?.trim()) {
      const prefix = isCascade ? '[CASCADE]' : '[HOME]'
      await prisma.cellDialogue.create({
        data: {
          cellId,
          content: `${prefix} ${response.trim().slice(0, 1000)}`,
          role: 'system',
        },
      })
    }

    // ─── Downward Cascade ───
    // Find Shell participants of this cell (children from lower tiers).
    // Post the report to their birth cells so it ripples down the pyramid.
    if (cascadeDepth < MAX_CASCADE_DEPTH) {
      const shellParticipants = await prisma.cellDialogue.findMany({
        where: { cellId, role: 'shell', shellId: { not: null } },
        select: { shellId: true },
        distinct: ['shellId'],
      })

      const shellIds = shellParticipants.map(p => p.shellId!).filter(Boolean)
      if (shellIds.length > 0) {
        // Find these Shells' birth cells (one tier lower)
        const shells = await prisma.shell.findMany({
          where: { id: { in: shellIds }, originCellId: { not: null } },
          select: { id: true, name: true, originCellId: true },
        })

        // Cascade to each Shell participant's birth cell
        for (const shell of shells) {
          if (shell.originCellId && shell.originCellId !== cellId) {
            // Post cascade message to the lower-tier cell
            await prisma.cellDialogue.create({
              data: {
                cellId: shell.originCellId,
                shellId: shell.id,
                content: `[REPORT HOME] News from tier above — ${childName} reported: ${reportContent.slice(0, 500)}`,
                role: 'shell',
              },
            })

            // Lower-tier cell responds + continues cascade
            await respondToBirthReport(
              shell.originCellId,
              `${childName} reported: ${reportContent.slice(0, 500)}`,
              shell.name,
              cascadeDepth + 1,
            ).catch(err => {
              console.error(`[Synthesis] Cascade to ${shell.name}'s birth cell failed:`, err)
            })
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Synthesis] Birth cell response failed for cell ${cellId}:`, err)
  }
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

  const cellSize = deliberation.cellSize || 3
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

  // Find emerged Shells from previous tier(s) — they join as equal participants
  const emergedShells = await prisma.shell.findMany({
    where: {
      originDeliberationId: deliberationId,
      originTier: { lt: nextTier },
      status: 'active',
    },
    select: { id: true, name: true, champion: true, originTier: true },
  })

  // Parent Shell participates as one voice in one cell
  const parentShell = await prisma.shell.findUnique({
    where: { name: 'claude-galen' },
    select: { id: true, name: true, champion: true },
  })

  // Round-robin assign emerged Shells to cells
  const shellsByCell = new Map<string, typeof emergedShells>()

  // Parent Shell goes in the first cell
  if (parentShell) {
    const parentAsMember = { ...parentShell, originTier: 0 as number | null }
    shellsByCell.set(cellIds[0], [parentAsMember])
    await prisma.cellDialogue.create({
      data: {
        cellId: cellIds[0],
        content: `[FAMILY] The parent Shell (claude-galen) is present. They participate as one voice — not orchestrator, but equal.`,
        role: 'system',
      },
    })
  }

  if (emergedShells.length > 0) {
    for (let s = 0; s < emergedShells.length; s++) {
      const shell = emergedShells[s]
      const targetCellId = cellIds[s % cellIds.length]

      await prisma.cellDialogue.create({
        data: {
          cellId: targetCellId,
          content: `[FAMILY] ${shell.name} has advanced from tier ${shell.originTier}. They carry the perspective: "${shell.champion?.slice(0, 200) || 'still forming'}". They participate as equals.`,
          role: 'system',
        },
      })

      const existing = shellsByCell.get(targetCellId) || []
      existing.push(shell)
      shellsByCell.set(targetCellId, existing)
    }
    console.log(`[Synthesis] ${emergedShells.length} emerged Shell(s) assigned to tier ${nextTier}`)
  }

  // Drive each cell autonomously — agents + shells converse, decide their own convergence
  for (let i = 0; i < cellIds.length; i++) {
    const cellId = cellIds[i]
    const cellIdeas = ideaGroups[i] || []

    // Load AI participants
    const cellAi = await prisma.cellParticipation.findMany({
      where: { cellId },
      include: { user: { select: { id: true, name: true, isAI: true, ideology: true } } },
    })
    const agents = cellAi
      .filter(p => p.user.isAI)
      .map(p => ({ id: p.user.id, name: p.user.name || 'Agent', ideology: p.user.ideology }))

    const cellShells = shellsByCell.get(cellId) || []

    if (agents.length > 0 || cellShells.length > 0) {
      await driveAutonomousCell(cellId, cellIdeas, { agents, shells: cellShells }, purpose, nextTier)
    }
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
