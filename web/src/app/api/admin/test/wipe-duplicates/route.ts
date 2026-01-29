import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// POST /api/admin/test/wipe-duplicates - Delete duplicate deliberations (keep oldest)
export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find all deliberations grouped by question
    const allDelibs = await prisma.deliberation.findMany({
      select: { id: true, question: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    })

    // Group by question
    const byQuestion = new Map<string, typeof allDelibs>()
    for (const d of allDelibs) {
      const existing = byQuestion.get(d.question) || []
      existing.push(d)
      byQuestion.set(d.question, existing)
    }

    // Find duplicates (more than one with same question)
    const toDelete: string[] = []
    for (const [question, delibs] of byQuestion) {
      if (delibs.length > 1) {
        // Keep the oldest (first), delete the rest
        for (let i = 1; i < delibs.length; i++) {
          toDelete.push(delibs[i].id)
        }
      }
    }

    let deleted = 0
    for (const id of toDelete) {
      // Delete in order due to foreign keys
      await prisma.vote.deleteMany({ where: { cell: { deliberationId: id } } })
      await prisma.commentUpvote.deleteMany({ where: { comment: { cell: { deliberationId: id } } } })
      await prisma.comment.deleteMany({ where: { cell: { deliberationId: id } } })
      await prisma.cellIdea.deleteMany({ where: { cell: { deliberationId: id } } })
      await prisma.cellParticipation.deleteMany({ where: { cell: { deliberationId: id } } })
      await prisma.cell.deleteMany({ where: { deliberationId: id } })
      await prisma.prediction.deleteMany({ where: { deliberationId: id } })
      await prisma.idea.deleteMany({ where: { deliberationId: id } })
      await prisma.deliberationMember.deleteMany({ where: { deliberationId: id } })
      await prisma.deliberation.delete({ where: { id } })
      deleted++
    }

    return NextResponse.json({
      success: true,
      duplicatesDeleted: deleted
    })
  } catch (error) {
    console.error('Error wiping duplicates:', error)
    return NextResponse.json({
      error: 'Failed to wipe duplicates',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 })
  }
}
