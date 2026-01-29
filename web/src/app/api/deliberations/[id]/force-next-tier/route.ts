import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'

// POST /api/deliberations/[id]/force-next-tier
// Allow creator to force process all active voting cells (facilitator mode)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        cells: {
          where: { status: 'VOTING' },
        },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Check authorization: must be creator or admin
    const isCreator = deliberation.creatorId === user.id
    const isAdmin = user.role === 'ADMIN'

    if (!isCreator && !isAdmin) {
      return NextResponse.json({ error: 'Only the creator can advance tiers' }, { status: 403 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Deliberation is not in voting phase' }, { status: 400 })
    }

    if (deliberation.cells.length === 0) {
      return NextResponse.json({ error: 'No active voting cells' }, { status: 400 })
    }

    // Process all active cells with timeout=true to force completion
    let cellsProcessed = 0
    for (const cell of deliberation.cells) {
      await processCellResults(cell.id, true) // true = treat as timeout
      cellsProcessed++
    }

    return NextResponse.json({
      success: true,
      cellsProcessed,
      tier: deliberation.currentTier,
    })
  } catch (error) {
    console.error('Error force processing tier:', error)
    return NextResponse.json({ error: 'Failed to advance tier' }, { status: 500 })
  }
}
