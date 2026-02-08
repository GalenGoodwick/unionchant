import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../../auth'
import { resolveDiscordUser } from '@/lib/bot-user'
import { prisma } from '@/lib/prisma'
import { startVotingPhase } from '@/lib/voting'

// POST /api/bot/chants/[id]/start — Start voting phase.
// If multiple servers have loaded the chant, requires majority approval.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const body = await req.json()
    const { discordUserId, discordUsername, guildId } = body

    if (!discordUserId || !discordUsername) {
      return NextResponse.json({ error: 'discordUserId and discordUsername are required' }, { status: 400 })
    }

    const user = await resolveDiscordUser(discordUserId, discordUsername)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: { servers: true },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'SUBMISSION') {
      return NextResponse.json({ error: 'Chant is not in submission phase' }, { status: 400 })
    }

    const servers = deliberation.servers

    // If only one server (or none tracked), use original behavior — creator starts directly
    if (servers.length <= 1) {
      if (deliberation.creatorId !== user.id) {
        return NextResponse.json({ error: 'Only the creator can start voting' }, { status: 403 })
      }

      const result = await startVotingPhase(id)
      if (!result.success) {
        return NextResponse.json({ error: result.message, reason: result.reason }, { status: 400 })
      }
      return NextResponse.json(result)
    }

    // Multi-server: find which community this guild belongs to
    let serverEntry: typeof servers[number] | undefined = undefined
    if (guildId) {
      const community = await prisma.community.findUnique({
        where: { discordGuildId: guildId },
        select: { id: true },
      })
      if (community) {
        serverEntry = servers.find(s => s.communityId === community.id)
      }
    }

    if (!serverEntry) {
      return NextResponse.json({ error: 'Your server has not loaded this chant' }, { status: 403 })
    }

    // Record this server's approval
    if (!serverEntry.startVoteApproved) {
      await prisma.deliberationServer.update({
        where: { id: serverEntry.id },
        data: { startVoteApproved: true },
      })
    }

    // Check majority
    const approvedCount = servers.filter(s => s.startVoteApproved).length + (serverEntry.startVoteApproved ? 0 : 1)
    const totalServers = servers.length
    const threshold = Math.floor(totalServers / 2) + 1

    if (approvedCount < threshold) {
      return NextResponse.json({
        success: false,
        pendingApproval: true,
        approved: approvedCount,
        needed: threshold,
        total: totalServers,
        message: `Facilitator vote recorded. ${approvedCount}/${threshold} approvals needed to start voting.`,
      })
    }

    // Majority reached — start voting
    const result = await startVotingPhase(id)
    if (!result.success) {
      return NextResponse.json({ error: result.message, reason: result.reason }, { status: 400 })
    }

    // Reset all approvals for future use
    await prisma.deliberationServer.updateMany({
      where: { deliberationId: id },
      data: { startVoteApproved: false },
    })

    return NextResponse.json({
      ...result,
      approved: approvedCount,
      needed: threshold,
      total: totalServers,
    })
  } catch (error) {
    console.error('Error starting voting:', error)
    return NextResponse.json({ error: 'Failed to start voting' }, { status: 500 })
  }
}
