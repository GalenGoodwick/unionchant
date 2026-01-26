import { prisma } from './prisma'
import { sendPushToDeliberation, notifications } from './push'

const CELL_SIZE = 5
const IDEAS_PER_CELL = 5
const MIN_POOL_SIZE = 5 // Minimum ideas needed to challenge champion

/**
 * Calculate minimum pool size based on tier
 * Higher tiers need more challengers
 */
function getMinPoolSize(championTier: number): number {
  return Math.max(MIN_POOL_SIZE, championTier * 2)
}

/**
 * Apply retirement logic to challengers
 * Ideas with 2+ tier1Losses are retired if we have enough challengers
 */
function applyRetirementLogic(
  pendingIdeas: { id: string; tier1Losses: number }[],
  benchedIdeas: { id: string; tier1Losses: number }[],
  minNeeded: number
): { toRetire: string[]; toCompete: string[]; toBench: string[] } {
  // Combine pending and benched ideas
  const allIdeas = [...pendingIdeas, ...benchedIdeas]
  const total = allIdeas.length

  // If we don't have enough ideas, no one gets retired
  if (total <= minNeeded) {
    return {
      toRetire: [],
      toCompete: allIdeas.map(i => i.id),
      toBench: [],
    }
  }

  // Sort by tier1Losses (highest first) for retirement priority
  const sorted = [...allIdeas].sort((a, b) => b.tier1Losses - a.tier1Losses)

  // How many can we retire while maintaining minimum pool?
  const canRetire = total - minNeeded

  const toRetire: string[] = []
  const toCompete: string[] = []
  const toBench: string[] = []

  for (const idea of sorted) {
    if (idea.tier1Losses >= 2 && toRetire.length < canRetire) {
      // Retire this idea - it has 2+ losses and we have room
      toRetire.push(idea.id)
    } else if (idea.tier1Losses >= 2) {
      // Can't retire but has losses - bench it
      toBench.push(idea.id)
    } else {
      // No losses or only 1 loss - competes
      toCompete.push(idea.id)
    }
  }

  return { toRetire, toCompete, toBench }
}

/**
 * Start a challenge round for a deliberation
 */
export async function startChallengeRound(deliberationId: string) {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    include: {
      ideas: true,
      members: { where: { role: { in: ['CREATOR', 'PARTICIPANT'] } } },
    },
  })

  if (!deliberation) {
    throw new Error('Deliberation not found')
  }

  if (deliberation.phase !== 'ACCUMULATING') {
    throw new Error('Deliberation is not in accumulation phase')
  }

  // Get the current champion
  const champion = await prisma.idea.findFirst({
    where: {
      deliberationId,
      OR: [
        { status: 'WINNER' },
        { isChampion: true }
      ]
    },
  })

  if (!champion) {
    throw new Error('No champion found for challenge round')
  }

  // Get accumulated ideas (new submissions during accumulation)
  const pendingIdeas = deliberation.ideas.filter(
    i => i.status === 'PENDING' && i.isNew
  )

  // Get benched ideas (previous losers that can re-enter)
  const benchedIdeas = deliberation.ideas.filter(
    i => i.status === 'BENCHED'
  )

  // Calculate minimum pool size based on champion's tier
  const championTier = deliberation.championEnteredTier || 2
  const minNeeded = getMinPoolSize(championTier)

  // If no challengers at all, extend accumulation period
  if (pendingIdeas.length === 0 && benchedIdeas.length === 0) {
    // No challengers - extend accumulation
    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: {
        accumulationEndsAt: new Date(Date.now() + deliberation.accumulationTimeoutMs),
      },
    })
    return { extended: true, reason: 'No challengers' }
  }

  // Apply retirement logic
  const { toRetire, toCompete, toBench } = applyRetirementLogic(
    pendingIdeas.map(i => ({ id: i.id, tier1Losses: i.tier1Losses })),
    benchedIdeas.map(i => ({ id: i.id, tier1Losses: i.tier1Losses })),
    minNeeded
  )

  // Update idea statuses
  if (toRetire.length > 0) {
    await prisma.idea.updateMany({
      where: { id: { in: toRetire } },
      data: { status: 'RETIRED' },
    })
  }

  if (toBench.length > 0) {
    await prisma.idea.updateMany({
      where: { id: { in: toBench } },
      data: { status: 'BENCHED' },
    })
  }

  // If not enough challengers after retirement, extend
  if (toCompete.length < 1) {
    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: {
        accumulationEndsAt: new Date(Date.now() + deliberation.accumulationTimeoutMs),
      },
    })
    return { extended: true, reason: 'Not enough challengers after retirement' }
  }

  // Set champion to DEFENDING status
  await prisma.idea.update({
    where: { id: champion.id },
    data: { status: 'DEFENDING', isChampion: true },
  })

  // Mark competing ideas as IN_VOTING
  await prisma.idea.updateMany({
    where: { id: { in: toCompete } },
    data: { status: 'IN_VOTING', tier: 1, isNew: false },
  })

  // Create Tier 1 cells for challengers
  const shuffledIdeas = toCompete.sort(() => Math.random() - 0.5)
  const shuffledMembers = [...deliberation.members].sort(() => Math.random() - 0.5)
  const numCells = Math.ceil(shuffledIdeas.length / IDEAS_PER_CELL)

  for (let i = 0; i < numCells; i++) {
    const cellIdeaIds = shuffledIdeas.slice(i * IDEAS_PER_CELL, (i + 1) * IDEAS_PER_CELL)
    const cellMembers = shuffledMembers.slice(i * CELL_SIZE, (i + 1) * CELL_SIZE)
    const actualMembers = cellMembers.length > 0 ? cellMembers : shuffledMembers.slice(0, CELL_SIZE)

    await prisma.cell.create({
      data: {
        deliberationId,
        tier: 1,
        status: 'VOTING',
        votingStartedAt: new Date(),
        votingDeadline: new Date(Date.now() + deliberation.votingTimeoutMs),
        ideas: {
          create: cellIdeaIds.map(ideaId => ({ ideaId })),
        },
        participants: {
          create: actualMembers.map(member => ({ userId: member.userId })),
        },
      },
    })
  }

  // Update deliberation state
  const newChallengeRound = deliberation.challengeRound + 1
  await prisma.deliberation.update({
    where: { id: deliberationId },
    data: {
      phase: 'VOTING',
      currentTier: 1,
      challengeRound: newChallengeRound,
      accumulationEndsAt: null,
    },
  })

  // Send notification
  sendPushToDeliberation(
    deliberationId,
    notifications.challengeRoundStarting(deliberation.question, deliberationId, newChallengeRound)
  ).catch(err => console.error('Failed to send push notifications:', err))

  return {
    extended: false,
    challengeRound: newChallengeRound,
    challengers: toCompete.length,
    retired: toRetire.length,
    benched: toBench.length,
  }
}
