import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { startVotingPhase } from '@/lib/voting'

// POST /api/admin/test/reopen-world-peace — Reset the pinned world peace chant
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email || !(await isAdmin(session.user.email))) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const deliberation = await prisma.deliberation.findFirst({
      where: { isPinned: true },
      include: { ideas: true, cells: true },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'No pinned chant found' }, { status: 404 })
    }

    // Delete all cells, votes, cell participations, cell ideas
    const cellIds = deliberation.cells.map(c => c.id)
    if (cellIds.length > 0) {
      await prisma.vote.deleteMany({ where: { cellId: { in: cellIds } } })
      await prisma.cellParticipation.deleteMany({ where: { cellId: { in: cellIds } } })
      await prisma.cellIdea.deleteMany({ where: { cellId: { in: cellIds } } })
      await prisma.cell.deleteMany({ where: { id: { in: cellIds } } })
    }

    // Reset all ideas to SUBMITTED
    await prisma.idea.updateMany({
      where: { deliberationId: deliberation.id },
      data: {
        status: 'SUBMITTED',
        isChampion: false,
        tier: 0,
        totalXP: 0,
      },
    })

    // Reset deliberation to continuous flow (no rolling)
    await prisma.deliberation.update({
      where: { id: deliberation.id },
      data: {
        phase: 'SUBMISSION',
        continuousFlow: true,
        accumulationEnabled: false,
        submissionsClosed: false,
        currentTier: 0,
        currentTierStartedAt: null,
        championId: null,
        challengeRound: 0,
        championEnteredTier: null,
        accumulationEndsAt: null,
        completedAt: null,
      },
    })

    // Start voting (will enter FCFS continuous flow)
    await startVotingPhase(deliberation.id)

    return NextResponse.json({
      id: deliberation.id,
      message: 'World peace chant reopened with continuous flow. Voting started.',
      ideas: deliberation.ideas.length,
    })
  } catch (err) {
    console.error('Reopen world peace error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
