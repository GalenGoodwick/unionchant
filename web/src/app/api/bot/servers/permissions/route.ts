import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../auth'
import { prisma } from '@/lib/prisma'

// GET /api/bot/servers/permissions?guildId=... — Get chant creation permissions
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
      select: { postingPermission: true, chantRoleId: true },
    })

    if (!community) {
      return NextResponse.json({ error: 'Server not registered' }, { status: 404 })
    }

    return NextResponse.json({
      postingPermission: community.postingPermission,
      chantRoleId: community.chantRoleId,
    })
  } catch (error) {
    console.error('Error fetching permissions:', error)
    return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 })
  }
}

// POST /api/bot/servers/permissions — Update chant creation permissions
export async function POST(req: NextRequest) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const { guildId, postingPermission, chantRoleId } = await req.json()
    if (!guildId || !postingPermission) {
      return NextResponse.json({ error: 'guildId and postingPermission required' }, { status: 400 })
    }

    if (!['anyone', 'admins', 'role'].includes(postingPermission)) {
      return NextResponse.json({ error: 'postingPermission must be "anyone", "admins", or "role"' }, { status: 400 })
    }

    if (postingPermission === 'role' && !chantRoleId) {
      return NextResponse.json({ error: 'chantRoleId required when postingPermission is "role"' }, { status: 400 })
    }

    const community = await prisma.community.findUnique({
      where: { discordGuildId: guildId },
    })

    if (!community) {
      return NextResponse.json({ error: 'Server not registered' }, { status: 404 })
    }

    await prisma.community.update({
      where: { id: community.id },
      data: {
        postingPermission,
        chantRoleId: postingPermission === 'role' ? chantRoleId : null,
      },
    })

    return NextResponse.json({ success: true, postingPermission, chantRoleId: postingPermission === 'role' ? chantRoleId : null })
  } catch (error) {
    console.error('Error setting permissions:', error)
    return NextResponse.json({ error: 'Failed to set permissions' }, { status: 500 })
  }
}
