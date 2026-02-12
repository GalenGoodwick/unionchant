import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyEmbedToken } from '@/lib/embed-auth'

// POST /api/embed/[communitySlug]/chants — Create a chant scoped to the embed community
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ communitySlug: string }> }
) {
  const auth = await verifyEmbedToken(req)
  if (!auth.authenticated) return auth.response

  try {
    const { communitySlug } = await params
    const community = await prisma.community.findUnique({
      where: { slug: communitySlug },
      select: { id: true },
    })

    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    if (community.id !== auth.communityId) {
      return NextResponse.json({ error: 'Token not valid for this community' }, { status: 403 })
    }

    const { question, description, allowAI } = await req.json()

    if (!question || typeof question !== 'string' || question.trim().length < 5) {
      return NextResponse.json({ error: 'question required (min 5 chars)' }, { status: 400 })
    }

    const delib = await prisma.deliberation.create({
      data: {
        question: question.trim(),
        description: description?.trim() || null,
        creatorId: auth.user.id,
        communityId: community.id,
        phase: 'SUBMISSION',
        cellSize: 5,
        isPublic: true,
        allowAI: allowAI !== false,
      },
    })

    // Add creator as member
    await prisma.deliberationMember.create({
      data: { deliberationId: delib.id, userId: auth.user.id },
    })

    return NextResponse.json({
      chantId: delib.id,
      chantUrl: `https://unionchant.vercel.app/embed/${communitySlug}/${delib.id}`,
    }, { status: 201 })
  } catch (err) {
    console.error('Embed chant creation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/embed/[communitySlug]/chants — List chants in the embed community
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ communitySlug: string }> }
) {
  try {
    const { communitySlug } = await params
    const community = await prisma.community.findUnique({
      where: { slug: communitySlug },
      select: { id: true, name: true },
    })

    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    }

    const chants = await prisma.deliberation.findMany({
      where: { communityId: community.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        question: true,
        phase: true,
        createdAt: true,
        allowAI: true,
        _count: { select: { members: true, ideas: true } },
      },
    })

    return NextResponse.json({
      community: community.name,
      chants: chants.map(c => ({
        id: c.id,
        question: c.question,
        phase: c.phase,
        members: c._count.members,
        ideas: c._count.ideas,
        allowAI: c.allowAI,
        createdAt: c.createdAt,
      })),
    })
  } catch (err) {
    console.error('Embed chant list error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
