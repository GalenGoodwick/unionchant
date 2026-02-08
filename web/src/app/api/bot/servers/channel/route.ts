import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../auth'
import { prisma } from '@/lib/prisma'

// GET /api/bot/servers/channel?guildId=... — Get announcement channel
export async function GET(req: NextRequest) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const guildId = req.nextUrl.searchParams.get('guildId')
    if (!guildId) {
      return NextResponse.json({ error: 'guildId required' }, { status: 400 })
    }

    const community = await prisma.community.findUnique({
      where: { discordGuildId: guildId },
      select: { discordChannelId: true },
    })

    if (!community) {
      return NextResponse.json({ error: 'Server not registered' }, { status: 404 })
    }

    return NextResponse.json({ channelId: community.discordChannelId })
  } catch (error) {
    console.error('Error fetching channel:', error)
    return NextResponse.json({ error: 'Failed to fetch channel' }, { status: 500 })
  }
}

// POST /api/bot/servers/channel — Set announcement channel
export async function POST(req: NextRequest) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const { guildId, channelId } = await req.json()
    if (!guildId) {
      return NextResponse.json({ error: 'guildId required' }, { status: 400 })
    }

    const community = await prisma.community.findUnique({
      where: { discordGuildId: guildId },
    })

    if (!community) {
      return NextResponse.json({ error: 'Server not registered' }, { status: 404 })
    }

    await prisma.community.update({
      where: { id: community.id },
      data: { discordChannelId: channelId || null },
    })

    return NextResponse.json({ success: true, channelId: channelId || null })
  } catch (error) {
    console.error('Error setting channel:', error)
    return NextResponse.json({ error: 'Failed to set channel' }, { status: 500 })
  }
}
