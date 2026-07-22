import { prisma } from './prisma'
import { processCellResults } from './voting'
import { invalidate } from './cache'
import type { DynamicCellState } from '@/types/chant-simulator'

const CELL_SIZE = 5
const HEARTBEAT_STALE_MS = 600_000 // 10 minutes without heartbeat = stale
const AUTO_COMPLETE_DELAY_MS = 30_000 // 30s timer after 2+ votes

/**
 * Called on every heartbeat. Records presence, runs formation logic.
 * Returns the user's current cell assignment + full cell state.
 */
export async function processHeartbeat(
  deliberationId: string,
  userId: string
): Promise<DynamicCellState> {
  const now = new Date()

  // Upsert heartbeat: find existing participation or assign to a cell
  let participation = await prisma.cellParticipation.findFirst({
    where: {
      userId,
      cell: {
        deliberationId,
        dynamicStatus: { not: null },
        status: { not: 'COMPLETED' },
      },
    },
    include: {
      cell: {
        include: {
          ideas: { include: { idea: { include: { author: { select: { name: true } } } } } },
          participants: { include: { user: { select: { id: true, name: true } } } },
          votes: { select: { ideaId: true, userId: true } },
        },
      },
    },
  })

  if (participation) {
    // Update heartbeat timestamp
    await prisma.cellParticipation.update({
      where: { id: participation.id },
      data: { lastHeartbeat: now, lastSeenAt: now },
    })
  }

  // Run rebalance (may assign this user to a cell if unassigned)
  await rebalanceCells(deliberationId)

  // Re-fetch if user wasn't in a cell (rebalance may have assigned them)
  if (!participation) {
    participation = await prisma.cellParticipation.findFirst({
      where: {
        userId,
        cell: {
          deliberationId,
          dynamicStatus: { not: null },
          status: { not: 'COMPLETED' },
        },
      },
      include: {
        cell: {
          include: {
            ideas: { include: { idea: { include: { author: { select: { name: true } } } } } },
            participants: { include: { user: { select: { id: true, name: true } } } },
            votes: { select: { ideaId: true, userId: true } },
          },
        },
      },
    })

    if (participation) {
      await prisma.cellParticipation.update({
        where: { id: participation.id },
        data: { lastHeartbeat: now, lastSeenAt: now },
      })
    }
  }

  // Check for expired auto-complete timers
  await processExpiredAutoCompletes(deliberationId)

  // Compute current top priority: highest-tier advancing/winner idea with most XP
  const topIdea = await prisma.idea.findFirst({
    where: {
      deliberationId,
      status: { in: ['ADVANCING', 'IN_VOTING', 'WINNER'] },
    },
    orderBy: [{ tier: 'desc' }, { totalXP: 'desc' }],
    select: { text: true, tier: true, totalXP: true },
  })
  const currentPriority = topIdea
    ? { text: topIdea.text, tier: topIdea.tier, xp: topIdea.totalXP }
    : null

  // Build response
  if (!participation) {
    return {
      cellId: null,
      dynamicStatus: null,
      ideas: [],
      people: [],
      slots: { total: CELL_SIZE, filled: 0, explanations: ['Waiting for more participants...'] },
      timer: null,
      needsMore: { ideas: true, people: true },
      currentPriority,
    }
  }

  const cell = participation.cell
  const votedIdeaIds = new Set(cell.votes.map(v => v.ideaId))
  const votedUserIds = new Set(cell.votes.map(v => v.userId))
  const activeParticipants = cell.participants.filter(
    p => p.status === 'VOTED' || (p.lastHeartbeat && p.lastHeartbeat.getTime() > Date.now() - HEARTBEAT_STALE_MS)
  )

  // Build slot explanations for empty idea slots
  const explanations: string[] = []
  const filledIdeas = cell.ideas.length
  if (filledIdeas < CELL_SIZE) {
    const unassignedCount = await prisma.idea.count({
      where: {
        deliberationId,
        status: 'IN_VOTING',
        cellIdeas: { none: {} },
      },
    })
    for (let i = filledIdeas; i < CELL_SIZE; i++) {
      if (unassignedCount > 0) {
        explanations.push('Ideas are being matched to groups...')
      } else {
        explanations.push('Invite a friend to submit an idea')
      }
    }
  }

  return {
    cellId: cell.id,
    dynamicStatus: cell.dynamicStatus as DynamicCellState['dynamicStatus'],
    ideas: cell.ideas.map(ci => ({
      id: ci.idea.id,
      text: ci.idea.text,
      author: ci.idea.author?.name || 'Member',
      voted: votedIdeaIds.has(ci.idea.id),
    })),
    people: activeParticipants.map(p => ({
      id: p.user.id,
      name: p.user.name || 'Member',
      hasVoted: votedUserIds.has(p.user.id),
    })),
    slots: {
      total: CELL_SIZE,
      filled: filledIdeas,
      explanations,
    },
    timer: cell.autoCompleteAt ? { endsAt: cell.autoCompleteAt.toISOString() } : null,
    needsMore: {
      ideas: cell.ideas.length < 2,
      people: activeParticipants.length < 2,
    },
    currentPriority,
  }
}

/**
 * Rebalance algorithm — the heart of dynamic formation.
 * Called after heartbeat or voter departure.
 */
async function rebalanceCells(deliberationId: string): Promise<void> {
  const now = new Date()
  const staleCutoff = new Date(now.getTime() - HEARTBEAT_STALE_MS)

  // Get all dynamic cells
  const cells = await prisma.cell.findMany({
    where: {
      deliberationId,
      dynamicStatus: { not: null },
      status: { not: 'COMPLETED' },
    },
    include: {
      participants: {
        include: { user: { select: { id: true } } },
      },
      ideas: true,
      votes: { select: { ideaId: true, userId: true } },
    },
  })

  // 1. Remove stale viewers (no heartbeat > 15s, haven't voted)
  for (const cell of cells) {
    const votedUserIds = new Set(cell.votes.map(v => v.userId))
    for (const p of cell.participants) {
      if (p.status === 'VOTED' || votedUserIds.has(p.userId)) continue
      if (!p.lastHeartbeat || p.lastHeartbeat < staleCutoff) {
        await prisma.cellParticipation.delete({ where: { id: p.id } })
      }
    }
  }

  // Re-fetch cells after cleanup
  const freshCells = await prisma.cell.findMany({
    where: {
      deliberationId,
      dynamicStatus: { not: null },
      status: { not: 'COMPLETED' },
    },
    include: {
      participants: true,
      ideas: true,
      votes: { select: { ideaId: true, userId: true } },
    },
  })

  // Get active viewers who have a recent heartbeat but no cell
  const allAssignedUserIds = new Set(
    freshCells.flatMap(c => c.participants.map(p => p.userId))
  )

  // Find viewers with recent heartbeats in completed cells or no cell at all
  // We identify "active viewers" as members of this deliberation who recently
  // called heartbeat. Since heartbeat creates/updates participation, unassigned
  // viewers are those whose participations were cleaned up (stale) and who
  // call heartbeat again — they get re-assigned here.

  // Get unassigned ideas
  const unassignedIdeas = await prisma.idea.findMany({
    where: {
      deliberationId,
      status: 'IN_VOTING',
      cellIdeas: {
        none: {
          cell: {
            dynamicStatus: { not: null },
            status: { not: 'COMPLETED' },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })

  // 2. Bench excess un-voted ideas in cells where ideas > people
  for (const cell of freshCells) {
    const votedIdeaIds = new Set(cell.votes.map(v => v.ideaId))
    const peopleCount = cell.participants.length
    const unvotedIdeas = cell.ideas.filter(ci => !votedIdeaIds.has(ci.ideaId))
    const votedIdeasCount = cell.ideas.length - unvotedIdeas.length

    // Target: min(peopleCount, CELL_SIZE) ideas, but at least keep voted ones
    const targetIdeas = Math.max(Math.min(peopleCount, CELL_SIZE), votedIdeasCount)
    const excess = cell.ideas.length - targetIdeas
    if (excess > 0) {
      // Remove excess un-voted ideas (return to pool)
      const toRemove = unvotedIdeas.slice(0, excess)
      for (const ci of toRemove) {
        await prisma.cellIdea.delete({ where: { id: ci.id } })
        unassignedIdeas.push({ id: ci.ideaId })
      }
    }
  }

  // 3. Assign unassigned viewers to cells
  // Find members who called heartbeat recently but aren't in any dynamic cell
  const recentHeartbeats = await prisma.cellParticipation.findMany({
    where: {
      lastHeartbeat: { gte: staleCutoff },
      cell: {
        deliberationId,
        dynamicStatus: { not: null },
        status: { not: 'COMPLETED' },
      },
    },
    select: { userId: true },
  })
  // All assigned users with recent heartbeats — they don't need re-assignment
  // Unassigned viewers need to come from somewhere else...
  // Actually, the heartbeat endpoint creates the participation BEFORE calling
  // rebalance if the user doesn't have one. So unassigned users don't exist
  // in the participation table. The heartbeat endpoint will handle creating
  // participation AFTER rebalance creates a cell for them.

  // What we CAN do here: find cells with room and ensure ideas match people count

  // 4. Balance ideas across cells (un-voted ideas only)
  for (const cell of freshCells) {
    const currentIdeaCount = await prisma.cellIdea.count({ where: { cellId: cell.id } })
    const peopleCount = cell.participants.length
    const target = Math.min(peopleCount, CELL_SIZE)

    while (currentIdeaCount < target && unassignedIdeas.length > 0) {
      const idea = unassignedIdeas.shift()!
      await prisma.cellIdea.create({
        data: { cellId: cell.id, ideaId: idea.id },
      })
    }
  }

  // 5. Handle overflow (cells with > CELL_SIZE people)
  for (const cell of freshCells) {
    const currentParticipantCount = await prisma.cellParticipation.count({ where: { cellId: cell.id } })
    if (currentParticipantCount > CELL_SIZE) {
      await splitCell(cell.id)
    }
  }

  // 6. Update dynamic status for all cells
  for (const cell of freshCells) {
    const participants = await prisma.cellParticipation.findMany({
      where: { cellId: cell.id },
    })
    const ideas = await prisma.cellIdea.count({ where: { cellId: cell.id } })
    const votedCount = participants.filter(p => p.status === 'VOTED').length
    const activeCount = participants.filter(
      p => p.status === 'VOTED' || (p.lastHeartbeat && p.lastHeartbeat.getTime() > Date.now() - HEARTBEAT_STALE_MS)
    ).length

    let newStatus: string
    if (activeCount < 2 || ideas < 2) {
      newStatus = 'forming'
    } else if (votedCount >= 2 && cell.dynamicStatus !== 'locked') {
      newStatus = 'locked'
      // Start auto-complete timer
      await prisma.cell.update({
        where: { id: cell.id },
        data: {
          dynamicStatus: 'locked',
          autoCompleteAt: new Date(Date.now() + AUTO_COMPLETE_DELAY_MS),
        },
      })
      continue // skip the generic update below
    } else if (cell.dynamicStatus === 'locked') {
      // Stay locked
      continue
    } else {
      newStatus = 'active'
    }

    if (cell.dynamicStatus !== newStatus) {
      await prisma.cell.update({
        where: { id: cell.id },
        data: { dynamicStatus: newStatus },
      })
    }
  }

  // 7. Dissolve empty cells (no people AND no votes)
  for (const cell of freshCells) {
    const participantCount = await prisma.cellParticipation.count({ where: { cellId: cell.id } })
    const voteCount = await prisma.vote.count({ where: { cellId: cell.id } })
    if (participantCount === 0 && voteCount === 0) {
      // Return ideas to pool
      await prisma.cellIdea.deleteMany({ where: { cellId: cell.id } })
      await prisma.cell.delete({ where: { id: cell.id } })
    }
  }
}

/**
 * Split a cell that has >5 people into two ~equal cells.
 * Voted ideas/people stay together.
 */
async function splitCell(cellId: string): Promise<void> {
  const cell = await prisma.cell.findUnique({
    where: { id: cellId },
    include: {
      participants: { orderBy: { votedAt: 'desc' } },
      ideas: true,
      votes: { select: { ideaId: true, userId: true } },
    },
  })
  if (!cell) return

  const people = cell.participants
  const ideas = cell.ideas

  // Sort: voted first
  const votedPeople = people.filter(p => p.status === 'VOTED')
  const activePeople = people.filter(p => p.status !== 'VOTED')
  const sortedPeople = [...votedPeople, ...activePeople]

  // Split people into two halves
  const halfA: typeof people = []
  const halfB: typeof people = []
  for (const person of sortedPeople) {
    if (halfA.length <= halfB.length) halfA.push(person)
    else halfB.push(person)
  }

  // Map voted ideas to their voter's half
  const userToHalf = new Map<string, 'A' | 'B'>()
  halfA.forEach(p => userToHalf.set(p.userId, 'A'))
  halfB.forEach(p => userToHalf.set(p.userId, 'B'))

  const votedIdeaUsers = new Map<string, Set<string>>()
  for (const vote of cell.votes) {
    if (!votedIdeaUsers.has(vote.ideaId)) votedIdeaUsers.set(vote.ideaId, new Set())
    votedIdeaUsers.get(vote.ideaId)!.add(vote.userId)
  }

  const ideasA: string[] = []
  const ideasB: string[] = []
  for (const ci of ideas) {
    const voters = votedIdeaUsers.get(ci.ideaId)
    if (voters) {
      // Voted idea — follow majority voter half
      const inA = [...voters].filter(uid => userToHalf.get(uid) === 'A').length
      const inB = [...voters].filter(uid => userToHalf.get(uid) === 'B').length
      if (inA >= inB) ideasA.push(ci.ideaId)
      else ideasB.push(ci.ideaId)
    } else {
      // Un-voted — balance evenly
      if (ideasA.length <= ideasB.length) ideasA.push(ci.ideaId)
      else ideasB.push(ci.ideaId)
    }
  }

  // Keep original cell as A — remove B people and ideas
  const bPeopleIds = halfB.map(p => p.id)
  const bIdeaIds = ideasB

  if (bPeopleIds.length === 0) return // Nothing to split

  // Remove B people from original cell
  await prisma.cellParticipation.deleteMany({
    where: { id: { in: bPeopleIds } },
  })

  // Remove B ideas from original cell (only un-voted ones)
  const votedIdeaIdSet = new Set(cell.votes.map(v => v.ideaId))
  const bUnvotedIdeas = bIdeaIds.filter(id => !votedIdeaIdSet.has(id))
  if (bUnvotedIdeas.length > 0) {
    await prisma.cellIdea.deleteMany({
      where: { cellId, ideaId: { in: bUnvotedIdeas } },
    })
  }

  // Create new cell for B
  const existingCellCount = await prisma.cell.count({
    where: { deliberationId: cell.deliberationId, tier: cell.tier },
  })

  const newCell = await prisma.cell.create({
    data: {
      deliberationId: cell.deliberationId,
      tier: cell.tier,
      batch: existingCellCount,
      status: 'VOTING',
      dynamicStatus: 'active',
      ideas: {
        create: bIdeaIds
          .filter(id => {
            // Only add ideas that aren't locked to cell A by votes
            const voters = votedIdeaUsers.get(id)
            if (!voters) return true
            // Include if any voter is in half B
            return [...voters].some(uid => userToHalf.get(uid) === 'B')
          })
          .map(ideaId => ({ ideaId })),
      },
      participants: {
        create: halfB.map(p => ({
          userId: p.userId,
          status: p.status,
          lastHeartbeat: p.lastHeartbeat,
          votedAt: p.votedAt,
        })),
      },
    },
  })

  console.log(`splitCell: split ${cellId} → kept ${halfA.length} people, new cell ${newCell.id} with ${halfB.length} people`)
}

/**
 * Check if cell meets auto-complete conditions.
 * 2+ people voted → start 30s timer.
 */
export async function checkAutoComplete(cellId: string): Promise<void> {
  const cell = await prisma.cell.findUnique({
    where: { id: cellId },
    select: {
      id: true,
      dynamicStatus: true,
      autoCompleteAt: true,
      deliberationId: true,
    },
  })

  if (!cell || !cell.dynamicStatus || cell.dynamicStatus === 'locked') return

  const votedCount = await prisma.cellParticipation.count({
    where: { cellId, status: 'VOTED' },
  })

  if (votedCount >= 2) {
    await prisma.cell.update({
      where: { id: cellId },
      data: {
        dynamicStatus: 'locked',
        autoCompleteAt: new Date(Date.now() + AUTO_COMPLETE_DELAY_MS),
      },
    })
    invalidate(`status:${cell.deliberationId}`)
    console.log(`checkAutoComplete: cell ${cellId} locked, auto-complete in ${AUTO_COMPLETE_DELAY_MS / 1000}s`)
  }
}

/**
 * Fire when autoCompleteAt expires.
 * Process cell results via existing pipeline.
 */
export async function finalizeAutoComplete(cellId: string): Promise<void> {
  const cell = await prisma.cell.findUnique({
    where: { id: cellId },
    select: {
      id: true,
      status: true,
      dynamicStatus: true,
      autoCompleteAt: true,
      deliberationId: true,
    },
  })

  if (!cell || cell.status === 'COMPLETED') return
  if (cell.dynamicStatus !== 'locked') return

  // Double-check we have votes
  const voteCount = await prisma.vote.count({ where: { cellId } })
  if (voteCount === 0) {
    console.log(`finalizeAutoComplete: cell ${cellId} has no votes, skipping`)
    return
  }

  console.log(`finalizeAutoComplete: completing cell ${cellId}`)

  // processCellResults atomically sets status to COMPLETED.
  // Clear dynamic fields after, since processCellResults checks status != COMPLETED.
  await processCellResults(cellId, false)

  // Clean up dynamic fields after cell is completed
  await prisma.cell.updateMany({
    where: { id: cellId, status: 'COMPLETED' },
    data: { dynamicStatus: null, autoCompleteAt: null },
  })

  invalidate(`status:${cell.deliberationId}`)
}

/**
 * Process expired auto-complete timers for a deliberation.
 * Called from heartbeat and from timer-processor cron.
 */
export async function processExpiredAutoCompletes(deliberationId?: string): Promise<string[]> {
  const now = new Date()

  const where: Record<string, unknown> = {
    dynamicStatus: 'locked',
    autoCompleteAt: { lte: now },
    status: { not: 'COMPLETED' },
  }
  if (deliberationId) {
    where.deliberationId = deliberationId
  }

  const cells = await prisma.cell.findMany({
    where,
    select: { id: true },
  })

  const processed: string[] = []

  for (const cell of cells) {
    try {
      await finalizeAutoComplete(cell.id)
      processed.push(cell.id)
    } catch (err) {
      console.error(`processExpiredAutoCompletes: failed for cell ${cell.id}:`, err)
    }
  }

  return processed
}

/**
 * Ensure a user has a cell in the dynamic system.
 * Called from heartbeat when user has no active dynamic cell.
 * Assigns user to an existing dynamic cell at any tier, or creates a tier 1 cell.
 * Tier 2+ cells are created by tryAdvanceContinuousFlowTier — not here.
 */
export async function ensureDynamicCellAssignment(
  deliberationId: string,
  userId: string
): Promise<string | null> {
  const now = new Date()

  // Find tiers where user already voted — skip those
  const votedParticipations = await prisma.cellParticipation.findMany({
    where: {
      userId,
      status: 'VOTED',
      cell: { deliberationId },
    },
    select: { cell: { select: { tier: true } } },
  })
  const votedTiers = new Set(votedParticipations.map(p => p.cell.tier))

  // Find dynamic cells with room (< CELL_SIZE people), preferring highest tier
  // Higher tiers = closer to champion = more important to fill
  const cellsWithRoom = await prisma.cell.findMany({
    where: {
      deliberationId,
      dynamicStatus: { in: ['forming', 'active'] },
      status: { not: 'COMPLETED' },
      ...(votedTiers.size > 0 ? { tier: { notIn: [...votedTiers] } } : {}),
    },
    include: {
      _count: { select: { participants: true } },
    },
    orderBy: [{ tier: 'desc' }, { createdAt: 'asc' }], // highest tier first
  })

  for (const cell of cellsWithRoom) {
    if (cell._count.participants < CELL_SIZE) {
      // Check user isn't already in this cell
      const existing = await prisma.cellParticipation.findUnique({
        where: { cellId_userId: { cellId: cell.id, userId } },
      })
      if (!existing) {
        await prisma.cellParticipation.create({
          data: {
            cellId: cell.id,
            userId,
            status: 'ACTIVE',
            lastHeartbeat: now,
          },
        })
      }
      return cell.id
    }
  }

  // No dynamic cell with room — only create NEW cells at tier 1
  // (tier 2+ cells are created by tryAdvanceContinuousFlowTier when winners accumulate)
  if (votedTiers.has(1)) {
    // User already voted at tier 1 — wait for tier 2+ cells to form from winners
    return null
  }

  // Check for unassigned tier 1 ideas to seed a new cell
  const unassignedIdeas = await prisma.idea.findMany({
    where: {
      deliberationId,
      status: 'IN_VOTING',
      tier: 1,
      cellIdeas: {
        none: {
          cell: {
            dynamicStatus: { not: null },
            status: { not: 'COMPLETED' },
          },
        },
      },
    },
    take: 1,
    select: { id: true },
  })

  if (unassignedIdeas.length === 0) {
    return null
  }

  const existingCellCount = await prisma.cell.count({
    where: { deliberationId, tier: 1 },
  })

  const newCell = await prisma.cell.create({
    data: {
      deliberationId,
      tier: 1,
      batch: existingCellCount,
      status: 'VOTING',
      dynamicStatus: 'forming',
      ideas: {
        create: [{ ideaId: unassignedIdeas[0].id }],
      },
      participants: {
        create: [{
          userId,
          status: 'ACTIVE',
          lastHeartbeat: now,
        }],
      },
    },
  })

  console.log(`ensureDynamicCellAssignment: created tier 1 dynamic cell ${newCell.id} for user ${userId}`)
  return newCell.id
}
