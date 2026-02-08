import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../../auth'
import { resolveDiscordUser } from '@/lib/bot-user'
import { prisma } from '@/lib/prisma'
import { processCellResults } from '@/lib/voting'

// POST /api/bot/chants/[id]/advance — Force-advance current tier. Creator-only.
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
      include: {
        cells: {
          where: { status: 'VOTING' },
        },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can advance tiers' }, { status: 403 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
    }

    if (deliberation.cells.length === 0) {
      return NextResponse.json({ error: 'No active voting cells to advance' }, { status: 400 })
    }

    let cellsProcessed = 0
    for (const cell of deliberation.cells) {
      await processCellResults(cell.id, true)
      cellsProcessed++
    }

    return NextResponse.json({
      success: true,
      cellsProcessed,
      tier: deliberation.currentTier,
    })
  } catch (error) {
    console.error('Error advancing tier:', error)
    return NextResponse.json({ error: 'Failed to advance tier' }, { status: 500 })
  }
}
