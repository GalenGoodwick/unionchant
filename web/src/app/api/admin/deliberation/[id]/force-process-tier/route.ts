import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'
import { requireAdminVerified } from '@/lib/admin'

// POST /api/admin/deliberation/[id]/force-process-tier
// Force process all active voting cells in current tier
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const { id } = await params

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
    return NextResponse.json({ error: 'Failed to process tier' }, { status: 500 })
  }
}
