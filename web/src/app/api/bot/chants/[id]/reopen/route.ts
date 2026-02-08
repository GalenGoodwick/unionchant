import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../../auth'
import { resolveDiscordUser } from '@/lib/bot-user'
import { prisma } from '@/lib/prisma'

// POST /api/bot/chants/[id]/reopen — Reopen a completed deliberation back to submission phase.
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
      select: { id: true, question: true, phase: true, creatorId: true },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can reopen this chant' }, { status: 403 })
    }

    if (deliberation.phase === 'SUBMISSION') {
      return NextResponse.json({ error: 'Chant is already accepting ideas' }, { status: 400 })
    }

    await prisma.deliberation.update({
      where: { id },
      data: {
        phase: 'SUBMISSION',
        submissionEndsAt: null,
      },
    })

    console.log(`[Bot] Reopened deliberation ${id} (${deliberation.question})`)

    return NextResponse.json({ success: true, question: deliberation.question })
  } catch (error) {
    console.error('Error reopening chant:', error)
    return NextResponse.json({ error: 'Failed to reopen chant' }, { status: 500 })
  }
}
