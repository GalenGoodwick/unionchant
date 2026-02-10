import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../../auth'
import { resolveDiscordUser } from '@/lib/bot-user'
import { prisma } from '@/lib/prisma'
import { startVotingPhase } from '@/lib/voting'

// POST /api/bot/chants/[id]/start — Start voting phase (creator only)
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

    if (deliberation.phase !== 'SUBMISSION') {
      return NextResponse.json({ error: 'Chant is not in submission phase' }, { status: 400 })
    }

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can start voting' }, { status: 403 })
    }

    const result = await startVotingPhase(id)
    if (!result.success) {
      return NextResponse.json({ error: result.message, reason: result.reason }, { status: 400 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error starting voting:', error)
    return NextResponse.json({ error: 'Failed to start voting' }, { status: 500 })
  }
}
