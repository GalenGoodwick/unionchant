import { NextRequest, NextResponse } from 'next/server'
import { resolveSimulatorUser } from '@/lib/simulator-auth'
import { prisma } from '@/lib/prisma'
import { processHeartbeat, ensureDynamicCellAssignment } from '@/lib/dynamic-cells'

// POST /api/deliberations/[id]/heartbeat — Presence ping for dynamic cells
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await resolveSimulatorUser(req)

    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const userId = auth.user.id

    // Verify deliberation exists, is in voting phase, and uses continuous flow
    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: {
        id: true,
        phase: true,
        continuousFlow: true,
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
    }

    if (!deliberation.continuousFlow) {
      return NextResponse.json({ error: 'Dynamic cells only available in endless mode' }, { status: 400 })
    }

    // Ensure user is a member
    await prisma.deliberationMember.upsert({
      where: { deliberationId_userId: { deliberationId: id, userId } },
      create: { deliberationId: id, userId },
      update: {},
    })

    // Check if user is already in a dynamic cell — if not, assign them
    const existingParticipation = await prisma.cellParticipation.findFirst({
      where: {
        userId,
        cell: {
          deliberationId: id,
          dynamicStatus: { not: null },
          status: { not: 'COMPLETED' },
        },
      },
    })

    if (!existingParticipation) {
      await ensureDynamicCellAssignment(id, userId)
    }

    // Process heartbeat — runs rebalance, returns cell state
    const state = await processHeartbeat(id, userId)

    return NextResponse.json(state)
  } catch (error) {
    console.error('Error in heartbeat:', error)
    return NextResponse.json({ error: 'Failed to process heartbeat' }, { status: 500 })
  }
}
