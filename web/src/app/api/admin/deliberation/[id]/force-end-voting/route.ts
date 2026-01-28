import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'

// Check if user is admin
async function isAdmin(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  })
  return user?.role === 'ADMIN'
}

// POST /api/admin/deliberation/[id]/force-end-voting
// Force end all voting and pick a winner
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email || !(await isAdmin(session.user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        cells: {
          where: { status: 'VOTING' },
        },
        ideas: {
          where: {
            status: { in: ['IN_VOTING', 'ADVANCING'] },
          },
          orderBy: { totalVotes: 'desc' },
        },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Deliberation is not in voting phase' }, { status: 400 })
    }

    // Process all active cells first
    for (const cell of deliberation.cells) {
      await processCellResults(cell.id, true)
    }

    // Get the idea with most votes as winner
    const ideas = await prisma.idea.findMany({
      where: {
        deliberationId: id,
        status: { in: ['IN_VOTING', 'ADVANCING', 'SUBMITTED', 'PENDING'] },
      },
      orderBy: { totalVotes: 'desc' },
    })

    let winner: typeof ideas[number] | null = null
    if (ideas.length > 0) {
      // Pick the top idea as winner
      winner = ideas[0]

      await prisma.$transaction([
        // Mark winner
        prisma.idea.update({
          where: { id: winner.id },
          data: {
            status: 'WINNER',
            isChampion: !deliberation.accumulationEnabled,
          },
        }),
        // Mark others as eliminated
        prisma.idea.updateMany({
          where: {
            deliberationId: id,
            id: { not: winner.id },
            status: { in: ['IN_VOTING', 'ADVANCING', 'SUBMITTED', 'PENDING'] },
          },
          data: { status: 'ELIMINATED' },
        }),
        // Update deliberation phase
        prisma.deliberation.update({
          where: { id },
          data: {
            phase: deliberation.accumulationEnabled ? 'ACCUMULATING' : 'COMPLETED',
          },
        }),
        // Mark all cells as completed
        prisma.cell.updateMany({
          where: { deliberationId: id, status: 'VOTING' },
          data: { status: 'COMPLETED' },
        }),
      ])
    } else {
      // No ideas - just complete the deliberation
      await prisma.deliberation.update({
        where: { id },
        data: { phase: 'COMPLETED' },
      })
    }

    return NextResponse.json({
      success: true,
      winner: winner?.text || null,
      winnerId: winner?.id || null,
      phase: deliberation.accumulationEnabled ? 'ACCUMULATING' : 'COMPLETED',
    })
  } catch (error) {
    console.error('Error force ending voting:', error)
    return NextResponse.json({ error: 'Failed to end voting' }, { status: 500 })
  }
}
