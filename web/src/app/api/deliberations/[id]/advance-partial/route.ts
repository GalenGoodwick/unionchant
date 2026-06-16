import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAdvanceWithPartialCompletion, checkTierCompletion, processCellResults, forcePartialBatchResolution } from '@/lib/voting'

// POST /api/deliberations/[id]/advance-partial
// Advance tier with only completed cells (don't force incomplete cells)
// Enabled when all batches have ≥1 complete cell
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

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: {
        id: true,
        creatorId: true,
        phase: true,
        currentTier: true,
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    const isCreator = deliberation.creatorId === user.id
    const isAdmin = user.role === 'ADMIN'

    if (!isCreator && !isAdmin) {
      return NextResponse.json({ error: 'Only the creator can advance tiers' }, { status: 403 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Deliberation is not in voting phase' }, { status: 400 })
    }

    // Check if all batches have at least 1 complete cell
    const { canAdvance, batchStatus } = await canAdvanceWithPartialCompletion(id, deliberation.currentTier)

    if (!canAdvance) {
      return NextResponse.json({
        error: 'Cannot advance yet',
        message: 'Not all batches have at least 1 complete cell',
        batchStatus,
      }, { status: 400 })
    }

    // STEP 1: Process all incomplete cells (finalize with whatever votes they have)
    const incompleteCells = await prisma.cell.findMany({
      where: {
        deliberationId: id,
        tier: deliberation.currentTier,
        status: { not: 'COMPLETED' },
      },
      select: { id: true },
    })

    console.log(`Partial advancement: processing ${incompleteCells.length} incomplete cells`)

    for (const cell of incompleteCells) {
      await processCellResults(cell.id, true)
    }

    // STEP 2: Force batch resolution for batches with at least 1 completed cell
    await forcePartialBatchResolution(id, deliberation.currentTier)

    // STEP 3: Normal tier completion (creates next tier or declares winner)
    await checkTierCompletion(id, deliberation.currentTier)

    const updated = await prisma.deliberation.findUnique({
      where: { id },
      select: { currentTier: true, phase: true },
    })

    return NextResponse.json({
      success: true,
      message: 'Tier advanced with current participation',
      previousTier: deliberation.currentTier,
      currentTier: updated?.currentTier,
      phase: updated?.phase,
      batchStatus,
    })
  } catch (error) {
    console.error('Error advancing tier with partial completion:', error)
    return NextResponse.json({ error: 'Failed to advance tier' }, { status: 500 })
  }
}

// GET /api/deliberations/[id]/advance-partial
// Check if partial advancement is available
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: { phase: true, currentTier: true },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ canAdvance: false, reason: 'Not in voting phase' })
    }

    const { canAdvance, batchStatus } = await canAdvanceWithPartialCompletion(id, deliberation.currentTier)

    return NextResponse.json({
      canAdvance,
      currentTier: deliberation.currentTier,
      batchStatus,
    })
  } catch (error) {
    console.error('Error checking partial advancement:', error)
    return NextResponse.json({ error: 'Failed to check advancement status' }, { status: 500 })
  }
}
