import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../../auth'
import { resolveDiscordUser } from '@/lib/bot-user'
import { prisma } from '@/lib/prisma'

// POST /api/bot/chants/[id]/extend — Extend voting timer. Creator-only.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const body = await req.json()
    const { discordUserId, discordUsername, extraMs } = body

    if (!discordUserId || !discordUsername) {
      return NextResponse.json({ error: 'discordUserId and discordUsername are required' }, { status: 400 })
    }

    const extraTime = extraMs || 900000 // default 15 minutes

    if (extraTime < 60000 || extraTime > 86400000) {
      return NextResponse.json({ error: 'Extension must be between 1 minute and 24 hours' }, { status: 400 })
    }

    const user = await resolveDiscordUser(discordUserId, discordUsername)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can extend the timer' }, { status: 403 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Chant is not in voting phase' }, { status: 400 })
    }

    // Extend all active cell deadlines
    const activeCells = await prisma.cell.findMany({
      where: {
        deliberationId: id,
        status: { in: ['VOTING', 'DELIBERATING'] },
      },
    })

    const ops = activeCells.map(cell => {
      const updates: Record<string, Date> = {}
      if (cell.votingDeadline) {
        updates.votingDeadline = new Date(cell.votingDeadline.getTime() + extraTime)
      }
      if (cell.secondVoteDeadline) {
        updates.secondVoteDeadline = new Date(cell.secondVoteDeadline.getTime() + extraTime)
      }
      if (cell.discussionEndsAt) {
        updates.discussionEndsAt = new Date(cell.discussionEndsAt.getTime() + extraTime)
      }
      return prisma.cell.update({
        where: { id: cell.id },
        data: updates,
      })
    })

    await prisma.$transaction(ops)

    return NextResponse.json({
      success: true,
      extendedCells: activeCells.length,
      extraMs: extraTime,
    })
  } catch (error) {
    console.error('Error extending timer:', error)
    return NextResponse.json({ error: 'Failed to extend timer' }, { status: 500 })
  }
}
