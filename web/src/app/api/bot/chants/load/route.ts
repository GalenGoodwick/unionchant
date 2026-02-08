import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../auth'
import { resolveDiscordUser } from '@/lib/bot-user'
import { prisma } from '@/lib/prisma'

// POST /api/bot/chants/load — Load an existing chant into a server
export async function POST(req: NextRequest) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const body = await req.json()
    const { guildId, discordUserId, discordUsername, inviteCode } = body

    if (!guildId || !discordUserId || !discordUsername || !inviteCode) {
      return NextResponse.json(
        { error: 'guildId, discordUserId, discordUsername, and inviteCode are required' },
        { status: 400 },
      )
    }

    // Find the community for this guild
    const community = await prisma.community.findUnique({
      where: { discordGuildId: guildId },
    })

    if (!community) {
      return NextResponse.json({ error: 'Server not registered.' }, { status: 404 })
    }

    // Find the chant by invite code
    const deliberation = await prisma.deliberation.findUnique({
      where: { inviteCode },
      include: {
        creator: { select: { name: true, discordId: true } },
        community: { select: { name: true } },
        servers: true,
        _count: { select: { members: true, ideas: true } },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'No chant found with that invite code.' }, { status: 404 })
    }

    if (deliberation.phase === 'COMPLETED') {
      return NextResponse.json({ error: 'This chant has already completed.' }, { status: 400 })
    }

    // Check if already loaded
    const existing = deliberation.servers.find(s => s.communityId === community.id)
    if (existing) {
      return NextResponse.json(
        { error: 'This chant is already loaded in your server.' },
        { status: 409 },
      )
    }

    // Create the link
    await prisma.deliberationServer.create({
      data: {
        deliberationId: deliberation.id,
        communityId: community.id,
        isOrigin: false,
      },
    })

    // Also make the loading user a member of the deliberation
    const user = await resolveDiscordUser(discordUserId, discordUsername)
    await prisma.deliberationMember.upsert({
      where: { deliberationId_userId: { deliberationId: deliberation.id, userId: user.id } },
      update: {},
      create: { deliberationId: deliberation.id, userId: user.id, role: 'PARTICIPANT' },
    })

    const serverCount = deliberation.servers.length + 1 // +1 for the one we just added

    return NextResponse.json({
      id: deliberation.id,
      question: deliberation.question,
      description: deliberation.description,
      phase: deliberation.phase,
      allocationMode: deliberation.allocationMode,
      currentTier: deliberation.currentTier,
      inviteCode: deliberation.inviteCode,
      createdAt: deliberation.createdAt,
      origin: deliberation.community?.name ?? 'Unknown',
      creator: deliberation.creator.name ?? 'Unknown',
      memberCount: deliberation._count.members,
      ideaCount: deliberation._count.ideas,
      serverCount,
      url: `https://unitychant.com/chants/${deliberation.id}`,
    })
  } catch (error) {
    console.error('Error loading chant:', error)
    return NextResponse.json({ error: 'Failed to load chant' }, { status: 500 })
  }
}
