/**
 * Meta-Deliberation System
 *
 * Handles the central "What should we decide next?" deliberation
 * and auto-spawning of deliberations from winning ideas.
 */

import prisma from './prisma'
import type { Idea } from '@prisma/client'

/**
 * Handle when a META or spawnsDeliberation deliberation crowns a champion.
 * Creates a new SPAWNED deliberation from the winning idea
 * and auto-joins all voters who supported it.
 */
export async function handleMetaChampion(
  deliberationId: string,
  championIdea: Idea
) {
  // Fetch parent deliberation for settings
  const parentDeliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
  })

  if (!parentDeliberation) {
    throw new Error('Parent deliberation not found')
  }

  // Determine description based on parent type
  const description = parentDeliberation.type === 'META'
    ? 'This topic was chosen by the community in the daily deliberation.'
    : `This question emerged from: "${parentDeliberation.question}"`

  // Calculate submission settings based on parent's spawned settings
  const now = new Date()
  let submissionEndsAt: Date | null = null
  let submissionDurationMs: number | null = null
  let ideaGoal: number | null = null

  const spawnedStartMode = parentDeliberation.spawnedStartMode || 'timer'

  if (spawnedStartMode === 'timer') {
    const hours = parentDeliberation.spawnedSubmissionHours || 24
    submissionDurationMs = hours * 60 * 60 * 1000
    submissionEndsAt = new Date(now.getTime() + submissionDurationMs)
  } else if (spawnedStartMode === 'ideas') {
    ideaGoal = parentDeliberation.spawnedIdeaGoal || 10
  }
  // If 'manual', both remain null

  // 1. Create new deliberation from champion
  const newDeliberation = await prisma.deliberation.create({
    data: {
      question: championIdea.text,
      description,
      type: 'SPAWNED',
      spawnedFromId: deliberationId,
      autoJoinVoters: true,
      isPublic: true,
      creatorId: championIdea.authorId, // Original proposer becomes creator
      // Settings from parent's spawned config
      submissionDurationMs: submissionDurationMs || 86400000,
      submissionEndsAt,
      ideaGoal,
      votingTimeoutMs: parentDeliberation.votingTimeoutMs || 3600000,
      accumulationEnabled: true,
      accumulationTimeoutMs: 86400000, // 24 hours
    },
  })

  // 2. Auto-join everyone who voted for this idea
  const voters = await prisma.vote.findMany({
    where: { ideaId: championIdea.id },
    select: { userId: true },
    distinct: ['userId'],
  })

  if (voters.length > 0) {
    await prisma.deliberationMember.createMany({
      data: voters.map((v) => ({
        deliberationId: newDeliberation.id,
        userId: v.userId,
        role: 'PARTICIPANT' as const,
      })),
      skipDuplicates: true,
    })
  }

  // 3. Also add the idea author as a member
  await prisma.deliberationMember.upsert({
    where: {
      deliberationId_userId: {
        deliberationId: newDeliberation.id,
        userId: championIdea.authorId,
      },
    },
    update: {},
    create: {
      deliberationId: newDeliberation.id,
      userId: championIdea.authorId,
      role: 'CREATOR',
    },
  })

  // 4. Only start next cycle for recurring META deliberations
  if (parentDeliberation.isRecurring && parentDeliberation.type === 'META') {
    await createNextMetaDeliberation(parentDeliberation)
  }

  return newDeliberation
}

/**
 * Create the next meta-deliberation in a recurring cycle.
 */
export async function createNextMetaDeliberation(
  previousDeliberation: {
    creatorId: string
    recurringSchedule: string | null
    submissionDurationMs: number
    votingTimeoutMs: number
  }
) {
  const now = new Date()

  // Calculate next occurrence based on schedule
  let nextOccurrence: Date | null = null
  if (previousDeliberation.recurringSchedule === 'daily') {
    nextOccurrence = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  } else if (previousDeliberation.recurringSchedule === 'weekly') {
    nextOccurrence = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  }

  // Calculate submission end time
  const submissionEndsAt = new Date(
    now.getTime() + previousDeliberation.submissionDurationMs
  )

  const newMeta = await prisma.deliberation.create({
    data: {
      question: 'What should we decide next?',
      description: 'Submit topics you want the community to deliberate on. The winning topic will become a new deliberation.',
      type: 'META',
      isPublic: true,
      isRecurring: true,
      recurringSchedule: previousDeliberation.recurringSchedule,
      nextOccurrence,
      creatorId: previousDeliberation.creatorId,
      submissionDurationMs: previousDeliberation.submissionDurationMs,
      votingTimeoutMs: previousDeliberation.votingTimeoutMs,
      accumulationEnabled: false, // Meta-deliberations don't use accumulation
      submissionEndsAt,
    },
  })

  return newMeta
}

/**
 * Start the initial meta-deliberation for the platform.
 * Should be called once to bootstrap the system.
 */
export async function initializeMetaDeliberation(
  creatorId: string,
  schedule: 'daily' | 'weekly' = 'daily'
) {
  const now = new Date()

  // Default: 20 hours submission, 4 hours voting
  const submissionDurationMs = 20 * 60 * 60 * 1000 // 20 hours
  const votingTimeoutMs = 4 * 60 * 60 * 1000 // 4 hours

  const submissionEndsAt = new Date(now.getTime() + submissionDurationMs)

  // Calculate next occurrence
  let nextOccurrence: Date
  if (schedule === 'daily') {
    nextOccurrence = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  } else {
    nextOccurrence = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  }

  const metaDeliberation = await prisma.deliberation.create({
    data: {
      question: 'What should we decide next?',
      description: 'Submit topics you want the community to deliberate on. The winning topic will become a new deliberation.',
      type: 'META',
      isPublic: true,
      isRecurring: true,
      recurringSchedule: schedule,
      nextOccurrence,
      creatorId,
      submissionDurationMs,
      votingTimeoutMs,
      accumulationEnabled: false,
      submissionEndsAt,
    },
  })

  return metaDeliberation
}

/**
 * Get the current active meta-deliberation.
 */
export async function getCurrentMetaDeliberation() {
  return prisma.deliberation.findFirst({
    where: {
      type: 'META',
      phase: { in: ['SUBMISSION', 'VOTING'] },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          ideas: true,
          members: true,
        },
      },
    },
  })
}

/**
 * Get recently spawned deliberations (from meta-deliberation winners).
 */
export async function getSpawnedDeliberations(limit = 10) {
  return prisma.deliberation.findMany({
    where: {
      type: 'SPAWNED',
      phase: { not: 'COMPLETED' },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      _count: {
        select: {
          members: true,
          ideas: true,
        },
      },
      spawnedFrom: {
        select: {
          id: true,
          question: true,
        },
      },
    },
  })
}
