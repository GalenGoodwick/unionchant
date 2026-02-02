import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'

// GET /api/podiums - List podium posts
export async function GET(req: NextRequest) {
  try {
    const authorId = req.nextUrl.searchParams.get('authorId')
    const deliberationId = req.nextUrl.searchParams.get('deliberationId')
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '20'), 50)
    const cursor = req.nextUrl.searchParams.get('cursor')

    const where: Record<string, unknown> = {}
    if (authorId) where.authorId = authorId
    if (deliberationId) where.deliberationId = deliberationId

    const podiums = await prisma.podium.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, name: true, image: true, status: true },
        },
        deliberation: {
          select: {
            id: true,
            question: true,
            phase: true,
            _count: { select: { members: true, ideas: true } },
          },
        },
      },
    })

    const hasMore = podiums.length > limit
    if (hasMore) podiums.pop()

    return NextResponse.json({
      items: podiums,
      nextCursor: hasMore ? podiums[podiums.length - 1]?.id : null,
    })
  } catch (error) {
    console.error('Error listing podiums:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

// POST /api/podiums - Create a podium post
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, status: true },
    })

    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'User not found or inactive' }, { status: 403 })
    }

    const body = await req.json()
    const { title, body: bodyText, deliberationId } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (!bodyText?.trim()) {
      return NextResponse.json({ error: 'Body is required' }, { status: 400 })
    }
    if (title.trim().length > 200) {
      return NextResponse.json({ error: 'Title too long (max 200 chars)' }, { status: 400 })
    }

    // Content moderation
    const titleCheck = moderateContent(title.trim())
    if (!titleCheck.allowed) {
      return NextResponse.json({ error: `Title: ${titleCheck.reason}` }, { status: 400 })
    }
    const bodyCheck = moderateContent(bodyText.trim())
    if (!bodyCheck.allowed) {
      return NextResponse.json({ error: `Body: ${bodyCheck.reason}` }, { status: 400 })
    }

    // Validate deliberation exists if linked
    if (deliberationId) {
      const delib = await prisma.deliberation.findUnique({
        where: { id: deliberationId },
        select: { id: true },
      })
      if (!delib) {
        return NextResponse.json({ error: 'Linked deliberation not found' }, { status: 404 })
      }
    }

    const podium = await prisma.podium.create({
      data: {
        title: title.trim(),
        body: bodyText.trim(),
        authorId: user.id,
        deliberationId: deliberationId || null,
      },
      include: {
        author: { select: { id: true, name: true, image: true } },
        deliberation: { select: { id: true, question: true, phase: true } },
      },
    })

    return NextResponse.json(podium, { status: 201 })
  } catch (error) {
    console.error('Error creating podium:', error)
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }
}
