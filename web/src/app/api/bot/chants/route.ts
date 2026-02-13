import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../auth'
import { resolveDiscordUser } from '@/lib/bot-user'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'

// POST /api/bot/chants — Create a Chant in a server's community
export async function POST(req: NextRequest) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const body = await req.json()
    const { guildId, discordUserId, discordUsername, question, description, allocationMode, continuousFlow, ideaGoal } = body

    if (!guildId || !discordUserId || !discordUsername || !question?.trim()) {
      return NextResponse.json({ error: 'guildId, discordUserId, discordUsername, and question are required' }, { status: 400 })
    }

    // Validate allocation mode
    const mode = allocationMode === 'fcfs' ? 'fcfs' : 'balanced'

    if (question.trim().length > 200) {
      return NextResponse.json({ error: 'Question too long (max 200 characters)' }, { status: 400 })
    }

    if (description && description.trim().length > 500) {
      return NextResponse.json({ error: 'Description too long (max 500 characters)' }, { status: 400 })
    }

    // Content moderation
    const modQ = moderateContent(question)
    if (!modQ.allowed) {
      return NextResponse.json({ error: modQ.reason }, { status: 400 })
    }
    if (description) {
      const modD = moderateContent(description)
      if (!modD.allowed) {
        return NextResponse.json({ error: modD.reason }, { status: 400 })
      }
    }

    // Find the community for this guild
    const community = await prisma.community.findUnique({
      where: { discordGuildId: guildId },
    })

    if (!community) {
      return NextResponse.json({ error: 'Server not registered. Bot should auto-register on join.' }, { status: 404 })
    }

    // Resolve the Discord user
    const user = await resolveDiscordUser(discordUserId, discordUsername)

    // Ensure user is a community member
    await prisma.communityMember.upsert({
      where: { communityId_userId: { communityId: community.id, userId: user.id } },
      update: { lastActiveAt: new Date() },
      create: { communityId: community.id, userId: user.id, role: 'MEMBER' },
    })

    const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

    const deliberation = await prisma.deliberation.create({
      data: {
        question: question.trim(),
        description: description?.trim() || null,
        isPublic: true,
        inviteCode,
        creatorId: user.id,
        communityId: community.id,
        allocationMode: mode,
        continuousFlow: continuousFlow !== false, // default ON
        votingTimeoutMs: 0, // continuous flow: no tier timer unless explicitly set
        ideaGoal: ideaGoal ?? 5,
        allowAI: false, // Discord chants are human-only
        members: {
          create: {
            userId: user.id,
            role: 'CREATOR',
          },
        },
      },
    })

    // Auto-set as default chant for this server
    await prisma.community.update({
      where: { id: community.id },
      data: { defaultChantId: deliberation.id },
    })

    return NextResponse.json({
      id: deliberation.id,
      question: deliberation.question,
      description: deliberation.description,
      phase: deliberation.phase,
      allocationMode: mode,
      inviteCode: deliberation.inviteCode,
      createdAt: deliberation.createdAt,
      url: `https://unitychant.com/chants/${deliberation.id}`,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating chant:', error)
    return NextResponse.json({ error: 'Failed to create chant' }, { status: 500 })
  }
}

// GET /api/bot/chants — List active chants for a guild
export async function GET(req: NextRequest) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const { searchParams } = new URL(req.url)
    const guildId = searchParams.get('guildId')

    if (!guildId) {
      return NextResponse.json({ error: 'guildId query param required' }, { status: 400 })
    }

    const community = await prisma.community.findUnique({
      where: { discordGuildId: guildId },
      select: { id: true },
    })

    if (!community) {
      return NextResponse.json({ error: 'Server not registered' }, { status: 404 })
    }

    // Get chants created in this server OR loaded into this server
    const chants = await prisma.deliberation.findMany({
      where: {
        phase: { not: 'COMPLETED' },
        communityId: community.id,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        question: true,
        phase: true,
        currentTier: true,
        createdAt: true,
        communityId: true,
        creator: { select: { name: true, discordId: true } },
        _count: { select: { members: true, ideas: true } },
      },
    })

    const result = chants.map(c => ({
      ...c,
      isOrigin: c.communityId === community.id,
      serverCount: 1,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error listing chants:', error)
    return NextResponse.json({ error: 'Failed to list chants' }, { status: 500 })
  }
}
