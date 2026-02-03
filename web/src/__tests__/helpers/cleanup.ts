import { prisma } from '@/lib/prisma'
import { getCreatedIds, resetCreatedIds } from './factories'

/**
 * Delete all test data in FK-safe order.
 * Also catches side-effect entities created by voting logic (cells, votes, etc.)
 */
export async function cleanupTestData() {
  const ids = getCreatedIds()

  // Find all deliberation IDs we created (voting logic creates cells, votes, etc. under these)
  const deliberationIds = ids.deliberations

  if (deliberationIds.length > 0) {
    // Delete side-effect entities by deliberationId in FK-safe order
    // Predictions reference cells, ideas, users, and deliberations
    await prisma.prediction.deleteMany({
      where: { deliberationId: { in: deliberationIds } },
    })

    // Get all cell IDs under our deliberations
    const cells = await prisma.cell.findMany({
      where: { deliberationId: { in: deliberationIds } },
      select: { id: true },
    })
    const cellIds = cells.map(c => c.id)

    if (cellIds.length > 0) {
      // Votes reference cells
      await prisma.vote.deleteMany({
        where: { cellId: { in: cellIds } },
      })

      // Comments have self-referencing replyToId — clear those first
      await prisma.comment.updateMany({
        where: { cellId: { in: cellIds } },
        data: { replyToId: null },
      })
      await prisma.comment.deleteMany({
        where: { cellId: { in: cellIds } },
      })

      // CellIdeas reference cells
      await prisma.cellIdea.deleteMany({
        where: { cellId: { in: cellIds } },
      })

      // CellParticipations reference cells
      await prisma.cellParticipation.deleteMany({
        where: { cellId: { in: cellIds } },
      })

      // Cells themselves
      await prisma.cell.deleteMany({
        where: { id: { in: cellIds } },
      })
    }

    // IdeaRevisions + IdeaRevisionVotes (cascade from ideas)
    const ideaIds = await prisma.idea.findMany({
      where: { deliberationId: { in: deliberationIds } },
      select: { id: true },
    })
    const allIdeaIds = ideaIds.map(i => i.id)
    if (allIdeaIds.length > 0) {
      const revisions = await prisma.ideaRevision.findMany({
        where: { ideaId: { in: allIdeaIds } },
        select: { id: true },
      })
      const revisionIds = revisions.map(r => r.id)
      if (revisionIds.length > 0) {
        await prisma.ideaRevisionVote.deleteMany({
          where: { revisionId: { in: revisionIds } },
        })
        await prisma.ideaRevision.deleteMany({
          where: { id: { in: revisionIds } },
        })
      }
    }

    // Ideas reference deliberations
    await prisma.idea.deleteMany({
      where: { deliberationId: { in: deliberationIds } },
    })

    // Members reference deliberations
    await prisma.deliberationMember.deleteMany({
      where: { deliberationId: { in: deliberationIds } },
    })

    // Deliberations themselves
    await prisma.deliberation.deleteMany({
      where: { id: { in: deliberationIds } },
    })
  }

  // Users (created by us)
  if (ids.users.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: ids.users } },
    })
  }

  resetCreatedIds()
}
