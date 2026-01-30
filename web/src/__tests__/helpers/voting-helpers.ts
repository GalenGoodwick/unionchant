import { prisma } from '@/lib/prisma'

/**
 * Cast a single vote
 */
export async function castVote(cellId: string, userId: string, ideaId: string) {
  return prisma.vote.create({
    data: { cellId, userId, ideaId },
  })
}

/**
 * Cast votes so that ~60% go to the majority idea.
 * All participants in the cell vote; the majority idea gets the most.
 * Returns { majorityCount, minorityCount }
 */
export async function castMajorityVotes(cellId: string, majorityIdeaId: string) {
  const cell = await prisma.cell.findUnique({
    where: { id: cellId },
    include: {
      participants: true,
      ideas: true,
    },
  })

  if (!cell) throw new Error(`Cell ${cellId} not found`)

  const otherIdeaIds = cell.ideas
    .map(ci => ci.ideaId)
    .filter(id => id !== majorityIdeaId)

  const participants = cell.participants
  const majorityCount = Math.ceil(participants.length * 0.6)

  for (let i = 0; i < participants.length; i++) {
    const ideaId = i < majorityCount
      ? majorityIdeaId
      : otherIdeaIds[(i - majorityCount) % otherIdeaIds.length] || majorityIdeaId

    await prisma.vote.create({
      data: {
        cellId,
        userId: participants[i].userId,
        ideaId,
      },
    })
  }

  return { majorityCount, minorityCount: participants.length - majorityCount }
}

/**
 * Fetch all cells at a given tier with full relations
 */
export async function getCellsAtTier(deliberationId: string, tier: number) {
  return prisma.cell.findMany({
    where: { deliberationId, tier },
    include: {
      ideas: { include: { idea: true } },
      participants: true,
      votes: true,
    },
    orderBy: { createdAt: 'asc' },
  })
}
