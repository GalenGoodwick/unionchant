import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../../auth'
import { resolveDiscordUser } from '@/lib/bot-user'
import { prisma } from '@/lib/prisma'
import { processCellResults, checkTierCompletion } from '@/lib/voting'

// POST /api/bot/chants/[id]/close — Close submissions (continuous flow). Creator-only.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const body = await req.json()
    const { discordUserId, discordUsername } = body

    if (!discordUserId || !discordUsername) {
      return NextResponse.json({ error: 'discordUserId and discordUsername are required' }, { status: 400 })
    }

    const user = await resolveDiscordUser(discordUserId, discordUsername)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can close submissions' }, { status: 403 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
    }

    if (!deliberation.continuousFlow) {
      return NextResponse.json({ error: 'Continuous flow is not enabled' }, { status: 400 })
    }

    if (deliberation.currentTier !== 1) {
      return NextResponse.json({ error: 'Already past tier 1' }, { status: 400 })
    }

    // Force-complete open cells
    const openCells = await prisma.cell.findMany({
      where: {
        deliberationId: id,
        tier: 1,
        status: { in: ['VOTING', 'DELIBERATING'] },
      },
      select: { id: true },
    })

    let closedCells = 0
    for (const cell of openCells) {
      await processCellResults(cell.id, true)
      closedCells++
    }

    await checkTierCompletion(id, 1)

    const updated = await prisma.deliberation.findUnique({
      where: { id },
      select: { currentTier: true, phase: true },
    })

    return NextResponse.json({
      success: true,
      closedCells,
      currentTier: updated?.currentTier,
      phase: updated?.phase,
    })
  } catch (error) {
    console.error('Error closing submissions:', error)
    return NextResponse.json({ error: 'Failed to close submissions' }, { status: 500 })
  }
}
