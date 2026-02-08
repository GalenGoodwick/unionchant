import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../auth'
import { prisma } from '@/lib/prisma'

// POST /api/bot/chants/unload — Remove a loaded chant from a server
export async function POST(req: NextRequest) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const { guildId, deliberationId } = await req.json()

    if (!guildId || !deliberationId) {
      return NextResponse.json(
        { error: 'guildId and deliberationId are required' },
        { status: 400 },
      )
    }

    const community = await prisma.community.findUnique({
      where: { discordGuildId: guildId },
      select: { id: true },
    })

    if (!community) {
      return NextResponse.json({ error: 'Server not registered' }, { status: 404 })
    }

    const serverLink = await prisma.deliberationServer.findUnique({
      where: {
        deliberationId_communityId: {
          deliberationId,
          communityId: community.id,
        },
      },
      include: {
        deliberation: { select: { question: true } },
      },
    })

    if (!serverLink) {
      return NextResponse.json({ error: 'This chant is not loaded in your server' }, { status: 404 })
    }

    if (serverLink.isOrigin) {
      return NextResponse.json(
        { error: 'Cannot unload a chant created in this server. Use delete instead.' },
        { status: 400 },
      )
    }

    await prisma.deliberationServer.delete({
      where: { id: serverLink.id },
    })

    // Clear default if this was the default chant
    await prisma.community.updateMany({
      where: { id: community.id, defaultChantId: deliberationId },
      data: { defaultChantId: null },
    })

    return NextResponse.json({
      success: true,
      question: serverLink.deliberation.question,
    })
  } catch (error) {
    console.error('Error unloading chant:', error)
    return NextResponse.json({ error: 'Failed to unload chant' }, { status: 500 })
  }
}
