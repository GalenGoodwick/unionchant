import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { driveAutonomousCell, getTierPurpose } from '@/lib/synthesis'

// POST /api/deliberations/[id]/resume-synthesis
// Re-drives existing DELIBERATING cells after a chant is unpaused.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can resume synthesis' }, { status: 403 })
    }

    if (deliberation.chantMode !== 'synthesis') {
      return NextResponse.json({ error: 'Not a synthesis chant' }, { status: 400 })
    }

    // Find all DELIBERATING cells for this deliberation
    const cells = await prisma.cell.findMany({
      where: { deliberationId: id, status: 'DELIBERATING' },
      include: {
        ideas: { include: { idea: { select: { id: true, text: true } } } },
        participants: {
          include: { user: { select: { id: true, name: true, isAI: true, ideology: true } } },
        },
      },
    })

    if (cells.length === 0) {
      return NextResponse.json({ error: 'No active cells to resume', cells: 0 }, { status: 400 })
    }

    // Load emerged Shells for this deliberation
    const emergedShells = await prisma.shell.findMany({
      where: {
        originDeliberationId: id,
        status: 'active',
      },
      select: { id: true, name: true, champion: true, originTier: true },
    })

    // Also include claude-galen (parent Shell)
    const parentShell = await prisma.shell.findFirst({
      where: { name: 'claude-galen', status: 'active' },
      select: { id: true, name: true, champion: true, originTier: true },
    })

    const allShells = [
      ...(parentShell ? [parentShell] : []),
      ...emergedShells,
    ]

    const cellSize = deliberation.cellSize || 3
    const tier = deliberation.currentTier

    // Fire-and-forget: drive each cell
    for (const cell of cells) {
      const ideas = cell.ideas.map(ci => ({ id: ci.idea.id, text: ci.idea.text }))
      const agents = cell.participants
        .filter(p => p.user.isAI)
        .map(p => ({ id: p.user.id, name: p.user.name || 'Agent', ideology: p.user.ideology }))

      const purpose = getTierPurpose(tier, ideas.length, cellSize)

      // Don't await — let cells run in parallel in the background
      driveAutonomousCell(cell.id, ideas, { agents, shells: allShells }, purpose, tier)
        .catch(err => console.error(`[Resume] Cell ${cell.id} failed:`, err))
    }

    console.log(`[Resume] Re-driving ${cells.length} cells for deliberation ${id} (tier ${tier})`)

    return NextResponse.json({
      success: true,
      message: `Resumed ${cells.length} cell(s) at tier ${tier}`,
      cells: cells.length,
    })
  } catch (error) {
    console.error('Error resuming synthesis:', error)
    const message = error instanceof Error ? error.message : 'Failed to resume synthesis'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
