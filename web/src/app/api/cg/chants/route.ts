import { NextRequest, NextResponse } from 'next/server'
import { verifyCGAuth } from '../auth'
import { resolveCGUser, resolveCGCommunity } from '@/lib/cg-user'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'

// POST /api/cg/chants — Create a chant from CG plugin
export async function POST(req: NextRequest) {
  try {
    const auth = verifyCGAuth(req)
    if (!auth.authenticated) return auth.response

    const body = await req.json()
    const { cgUserId, cgUsername, cgImageUrl, cgCommunityId, cgCommunityName, question, description, allocationMode, continuousFlow, ideaGoal } = body

    if (!cgUserId || !cgUsername || !cgCommunityId || !cgCommunityName || !question?.trim()) {
      return NextResponse.json({ error: 'cgUserId, cgUsername, cgCommunityId, cgCommunityName, and question are required' }, { status: 400 })
    }

    if (question.trim().length > 200) {
      return NextResponse.json({ error: 'Question too long (max 200 characters)' }, { status: 400 })
    }

    if (description && description.trim().length > 500) {
      return NextResponse.json({ error: 'Description too long (max 500 characters)' }, { status: 400 })
    }

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

    const user = await resolveCGUser(cgUserId, cgUsername, cgImageUrl)
    const community = await resolveCGCommunity(cgCommunityId, cgCommunityName, user.id)

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
        allocationMode: allocationMode === 'balanced' ? 'balanced' : 'fcfs',
        continuousFlow: continuousFlow !== false, // default ON
        ideaGoal: ideaGoal ?? 5,
        members: {
          create: { userId: user.id, role: 'CREATOR' },
        },
      },
    })

    return NextResponse.json({
      id: deliberation.id,
      question: deliberation.question,
      description: deliberation.description,
      phase: deliberation.phase,
      inviteCode: deliberation.inviteCode,
      createdAt: deliberation.createdAt,
      url: `https://unitychant.com/chants/${deliberation.id}`,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating CG chant:', error)
    return NextResponse.json({ error: 'Failed to create chant' }, { status: 500 })
  }
}

// GET /api/cg/chants?cgCommunityId=... — List active chants for a CG community
export async function GET(req: NextRequest) {
  try {
    const auth = verifyCGAuth(req)
    if (!auth.authenticated) return auth.response

    const { searchParams } = new URL(req.url)
    const cgCommunityId = searchParams.get('cgCommunityId')

    if (!cgCommunityId) {
      return NextResponse.json({ error: 'cgCommunityId query param required' }, { status: 400 })
    }

    const community = await prisma.community.findUnique({
      where: { cgCommunityId },
      select: { id: true },
    })

    if (!community) {
      return NextResponse.json([])
    }

    const chants = await prisma.deliberation.findMany({
      where: { communityId: community.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        question: true,
        description: true,
        phase: true,
        currentTier: true,
        allocationMode: true,
        championId: true,
        createdAt: true,
        creator: { select: { name: true, cgId: true } },
        _count: { select: { members: true, ideas: true } },
      },
    })

    return NextResponse.json(chants)
  } catch (error) {
    console.error('Error listing CG chants:', error)
    return NextResponse.json({ error: 'Failed to list chants' }, { status: 500 })
  }
}
