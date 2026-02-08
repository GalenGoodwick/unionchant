import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../auth'
import { prisma } from '@/lib/prisma'

// GET /api/bot/servers/default-chant?guildId=... — Get current default chant
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
      select: { defaultChantId: true },
    })

    if (!community) {
      return NextResponse.json({ error: 'Server not registered' }, { status: 404 })
    }

    if (!community.defaultChantId) {
      return NextResponse.json({ defaultChantId: null, question: null })
    }

    // Verify the chant still exists and is active
    const chant = await prisma.deliberation.findUnique({
      where: { id: community.defaultChantId },
      select: { id: true, question: true, phase: true },
    })

    if (!chant || chant.phase === 'COMPLETED') {
      // Clear stale default
      await prisma.community.update({
        where: { discordGuildId: guildId },
        data: { defaultChantId: null },
      })
      return NextResponse.json({ defaultChantId: null, question: null })
    }

    return NextResponse.json({ defaultChantId: chant.id, question: chant.question })
  } catch (error) {
    console.error('Error fetching default chant:', error)
    return NextResponse.json({ error: 'Failed to fetch default chant' }, { status: 500 })
  }
}

// POST /api/bot/servers/default-chant — Set default chant
export async function POST(req: NextRequest) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const { guildId, deliberationId } = await req.json()
    if (!guildId || !deliberationId) {
      return NextResponse.json({ error: 'guildId and deliberationId required' }, { status: 400 })
    }

    const community = await prisma.community.findUnique({
      where: { discordGuildId: guildId },
    })

    if (!community) {
      return NextResponse.json({ error: 'Server not registered' }, { status: 404 })
    }

    // Verify the chant exists and is active
    const chant = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
      select: { id: true, question: true, phase: true },
    })

    if (!chant) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (chant.phase === 'COMPLETED') {
      return NextResponse.json({ error: 'Cannot set a completed chant as default' }, { status: 400 })
    }

    await prisma.community.update({
      where: { id: community.id },
      data: { defaultChantId: deliberationId },
    })

    return NextResponse.json({ success: true, defaultChantId: chant.id, question: chant.question })
  } catch (error) {
    console.error('Error setting default chant:', error)
    return NextResponse.json({ error: 'Failed to set default chant' }, { status: 500 })
  }
}

// DELETE /api/bot/servers/default-chant — Clear default chant
export async function DELETE(req: NextRequest) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const { guildId } = await req.json()
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
      data: { defaultChantId: null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error clearing default chant:', error)
    return NextResponse.json({ error: 'Failed to clear default chant' }, { status: 500 })
  }
}
