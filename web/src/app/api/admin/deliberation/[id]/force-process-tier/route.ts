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

// POST /api/admin/deliberation/[id]/force-process-tier
// Force process all active voting cells in current tier
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
