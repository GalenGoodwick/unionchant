import { prisma } from './prisma'

/**
 * Update pairwise agreement scores after a cell completes.
 * For each pair of voters in the cell, check if they voted for the same idea.
 * Always store userAId < userBId lexicographically to avoid duplicates.
 */
export async function updateAgreementScores(cellId: string) {
  try {
    // Get all votes in this cell
    const votes = await prisma.vote.findMany({
      where: { cellId, isSecondVote: false },
      select: { userId: true, ideaId: true },
    })

    if (votes.length < 2) return

    // Build pairs
    for (let i = 0; i < votes.length; i++) {
      for (let j = i + 1; j < votes.length; j++) {
        const a = votes[i]
        const b = votes[j]

        // Ensure lexicographic ordering
        const [userAId, userBId] = a.userId < b.userId
          ? [a.userId, b.userId]
          : [b.userId, a.userId]

        const agreed = a.ideaId === b.ideaId

        await prisma.agreementScore.upsert({
          where: { userAId_userBId: { userAId, userBId } },
          create: {
            userAId,
            userBId,
            agreeCount: agreed ? 1 : 0,
            disagreeCount: agreed ? 0 : 1,
            totalCells: 1,
          },
          update: {
            agreeCount: { increment: agreed ? 1 : 0 },
            disagreeCount: { increment: agreed ? 0 : 1 },
            totalCells: { increment: 1 },
          },
        })
      }
    }
  } catch (error) {
    console.error('Error updating agreement scores:', error)
  }
}
