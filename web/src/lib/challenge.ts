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
 * Ideas with 2+ losses are retired if we have enough challengers
 */
function applyRetirementLogic(
  pendingIdeas: { id: string; losses: number }[],
  benchedIdeas: { id: string; losses: number }[],
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

  // Sort by losses (highest first) for retirement priority
  const sorted = [...allIdeas].sort((a, b) => b.losses - a.losses)

  // How many can we retire while maintaining minimum pool?
  const canRetire = total - minNeeded

  const toRetire: string[] = []
  const toCompete: string[] = []
  const toBench: string[] = []

  for (const idea of sorted) {
    if (idea.losses >= 2 && toRetire.length < canRetire) {
      // Retire this idea - it has 2+ losses and we have room
      toRetire.push(idea.id)
    } else if (idea.losses >= 2) {
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

  // ATOMIC GUARD: Claim the challenge round transition.
  // Only one concurrent caller can succeed — others get count=0 and bail out.
  const claimed = await prisma.deliberation.updateMany({
    where: {
      id: deliberationId,
      phase: 'ACCUMULATING',
      challengeRound: deliberation.challengeRound,
    },
    data: {
      // Temporarily mark as transitioning by bumping challengeRound
      // Phase stays ACCUMULATING until cells are created (updated at end)
      challengeRound: deliberation.challengeRound + 1,
    },
  })

  if (claimed.count === 0) {
    console.log(`startChallengeRound: another caller already claimed challenge for ${deliberationId}`)
    return null
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
    (i: { status: string; isNew: boolean }) => i.status === 'PENDING' && i.isNew
  )

  // Get benched ideas (previous losers that can re-enter)
  const benchedIdeas = deliberation.ideas.filter(
    (i: { status: string }) => i.status === 'BENCHED'
  )

  // Calculate minimum pool size based on champion's tier
  const championTier = deliberation.championEnteredTier || 2
  const minNeeded = getMinPoolSize(championTier)

  // If no challengers at all, extend or complete
  if (pendingIdeas.length === 0 && benchedIdeas.length === 0) {
    // Check if we've already extended too many times (max 3 extensions with no challengers)
    // After 3 challenge rounds with no challengers, the champion stands and deliberation completes
    const maxExtensions = 3
    if (deliberation.challengeRound >= maxExtensions) {
      console.log(`startChallengeRound: ${maxExtensions} rounds with no challengers, completing deliberation ${deliberationId}`)
      await prisma.deliberation.update({
        where: { id: deliberationId },
        data: {
          challengeRound: deliberation.challengeRound, // revert
          phase: 'COMPLETED',
          completedAt: new Date(),
          accumulationEndsAt: null,
        },
      })
      return { completed: true, reason: `No challengers after ${maxExtensions} rounds` }
    }

    // Revert challengeRound bump (no actual round starting) and extend
    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: {
        challengeRound: deliberation.challengeRound, // revert
        accumulationEndsAt: new Date(Date.now() + deliberation.accumulationTimeoutMs),
      },
    })
    return { extended: true, reason: 'No challengers' }
  }

  // Apply retirement logic
  const { toRetire, toCompete, toBench } = applyRetirementLogic(
    pendingIdeas.map(i => ({ id: i.id, losses: i.losses })),
    benchedIdeas.map(i => ({ id: i.id, losses: i.losses })),
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
    // Revert challengeRound bump and extend
    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: {
        challengeRound: deliberation.challengeRound, // revert
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
        ideas: {
          create: cellIdeaIds.map(ideaId => ({ ideaId })),
        },
        participants: {
          create: actualMembers.map(member => ({ userId: member.userId })),
        },
      },
    })
  }

  // Update deliberation state and start tier timer
  // challengeRound already incremented by atomic guard above
  const newChallengeRound = deliberation.challengeRound + 1
  await prisma.deliberation.update({
    where: { id: deliberationId },
    data: {
      phase: 'VOTING',
      currentTier: 1,
      currentTierStartedAt: new Date(),
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
