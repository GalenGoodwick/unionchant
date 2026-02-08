import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../auth'
import { resolveDiscordUser } from '@/lib/bot-user'
import { prisma } from '@/lib/prisma'

// POST /api/bot/servers — Register Discord server as a Community
export async function POST(req: NextRequest) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const body = await req.json()
    const { guildId, guildName, ownerDiscordId, ownerUsername, discordInviteUrl } = body

    if (!guildId || !guildName || !ownerDiscordId || !ownerUsername) {
      return NextResponse.json({ error: 'guildId, guildName, ownerDiscordId, ownerUsername are required' }, { status: 400 })
    }

    // Check if community already exists for this guild
    const existing = await prisma.community.findUnique({
      where: { discordGuildId: guildId },
    })

    if (existing) {
      return NextResponse.json(existing)
    }

    // Resolve the guild owner as a Unity Chant user
    const owner = await resolveDiscordUser(ownerDiscordId, ownerUsername)

    // Create slug from guild name (handle collisions)
    const baseSlug = guildName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
    let slug = `${baseSlug}-${guildId.slice(-6)}`
    const slugTaken = await prisma.community.findUnique({ where: { slug }, select: { id: true } })
    if (slugTaken) {
      slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`
    }

    const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

    const community = await prisma.community.create({
      data: {
        name: guildName,
        slug,
        description: `Discord server: ${guildName}`,
        isPublic: true,
        inviteCode,
        discordGuildId: guildId,
        ...(discordInviteUrl ? { discordInviteUrl } : {}),
        creatorId: owner.id,
        members: {
          create: {
            userId: owner.id,
            role: 'OWNER',
          },
        },
      },
    })

    return NextResponse.json(community, { status: 201 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error registering server:', msg, error)
    return NextResponse.json({ error: `Failed to register server: ${msg}` }, { status: 500 })
  }
}

// DELETE /api/bot/servers — Remove Discord server's community (bot removed from guild)
export async function DELETE(req: NextRequest) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const body = await req.json()
    const { guildId } = body

    if (!guildId) {
      return NextResponse.json({ error: 'guildId is required' }, { status: 400 })
    }

    const community = await prisma.community.findUnique({
      where: { discordGuildId: guildId },
      select: { id: true, name: true },
    })

    if (!community) {
      return NextResponse.json({ error: 'Community not found for this guild' }, { status: 404 })
    }

    console.log(`[Bot] Deleting community ${community.id} (${community.name}) — bot removed from guild ${guildId}`)

    // Find all deliberations in this community and delete them fully
    const deliberations = await prisma.deliberation.findMany({
      where: { communityId: community.id },
      select: { id: true },
    })

    for (const delib of deliberations) {
      const did = delib.id
      console.log(`[Bot] Deleting deliberation ${did}...`)

      await prisma.notification.deleteMany({ where: { deliberationId: did } })
      await prisma.prediction.deleteMany({ where: { deliberationId: did } })
      await prisma.watch.deleteMany({ where: { deliberationId: did } })
      await prisma.vote.deleteMany({ where: { cell: { deliberationId: did } } })
      await prisma.commentUpvote.deleteMany({
        where: { OR: [{ comment: { cell: { deliberationId: did } } }, { comment: { idea: { deliberationId: did } } }] },
      })
      await prisma.comment.updateMany({
        where: { OR: [{ cell: { deliberationId: did } }, { idea: { deliberationId: did } }] },
        data: { replyToId: null },
      })
      await prisma.comment.deleteMany({
        where: { OR: [{ cell: { deliberationId: did } }, { idea: { deliberationId: did } }] },
      })
      await prisma.cellIdea.deleteMany({ where: { cell: { deliberationId: did } } })
      await prisma.cellParticipation.deleteMany({ where: { cell: { deliberationId: did } } })
      await prisma.cell.deleteMany({ where: { deliberationId: did } })
      await prisma.idea.deleteMany({ where: { deliberationId: did } })
      await prisma.deliberationMember.deleteMany({ where: { deliberationId: did } })
      await prisma.deliberation.delete({ where: { id: did } })
    }

    console.log(`[Bot] Deleted ${deliberations.length} deliberation(s)`)

    // Delete bans, chat messages, members, then community
    await prisma.communityBan.deleteMany({ where: { communityId: community.id } })
    await prisma.groupMessage.deleteMany({ where: { communityId: community.id } })
    await prisma.communityMember.deleteMany({ where: { communityId: community.id } })
    await prisma.community.delete({ where: { id: community.id } })

    console.log(`[Bot] Successfully deleted community ${community.id}`)

    return NextResponse.json({ success: true, deleted: community.id })
  } catch (error) {
    console.error('Error deleting server community:', error)
    return NextResponse.json({ error: 'Failed to delete community' }, { status: 500 })
  }
}
