import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../auth'
import { resolveDiscordUser } from '@/lib/bot-user'

// POST /api/bot/users — Resolve/create user from Discord info
export async function POST(req: NextRequest) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const body = await req.json()
    const { discordUserId, discordUsername, discordAvatar } = body

    if (!discordUserId || !discordUsername) {
      return NextResponse.json({ error: 'discordUserId and discordUsername are required' }, { status: 400 })
    }

    const user = await resolveDiscordUser(discordUserId, discordUsername, discordAvatar)

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      discordId: user.discordId,
    })
  } catch (error) {
    console.error('Error resolving user:', error)
    return NextResponse.json({ error: 'Failed to resolve user' }, { status: 500 })
  }
}
