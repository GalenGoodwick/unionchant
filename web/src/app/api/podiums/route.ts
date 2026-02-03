import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'
import { invalidatePodiumCache } from '@/lib/podium-cache'

// GET /api/podiums - List podium posts
export async function GET(req: NextRequest) {
  try {
    const authorId = req.nextUrl.searchParams.get('authorId')
    const deliberationId = req.nextUrl.searchParams.get('deliberationId')
    const search = req.nextUrl.searchParams.get('search')
    const unlinked = req.nextUrl.searchParams.get('unlinked')
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '20'), 50)
    const cursor = req.nextUrl.searchParams.get('cursor')

    const where: Record<string, unknown> = {}
    if (authorId) where.authorId = authorId
    if (deliberationId) {
      where.deliberationLinks = { some: { deliberationId } }
    }
    if (search) where.title = { contains: search, mode: 'insensitive' }
    if (unlinked === 'true') {
      where.deliberationLinks = { none: {} }
    }

    const podiums = await prisma.podium.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      include: {
        author: {
          select: { id: true, name: true, image: true, isAI: true },
        },
        deliberationLinks: {
          include: {
            deliberation: {
              select: {
                id: true,
                question: true,
                phase: true,
                _count: { select: { members: true, ideas: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    const hasMore = podiums.length > limit
    if (hasMore) podiums.pop()

    // Flatten for backwards-compat: add `deliberations` array to each podium
    const items = podiums.map(p => ({
      ...p,
      deliberations: p.deliberationLinks.map(l => l.deliberation),
    }))

    return NextResponse.json({
      items,
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
    if (bodyText.trim().length > 10000) {
      return NextResponse.json({ error: 'Body too long (max 10,000 chars)' }, { status: 400 })
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
        ...(deliberationId ? {
          deliberationLinks: {
            create: { deliberationId },
          },
        } : {}),
      },
      include: {
        author: { select: { id: true, name: true, image: true } },
        deliberationLinks: {
          include: {
            deliberation: { select: { id: true, question: true, phase: true } },
          },
        },
      },
    })

    invalidatePodiumCache()
    return NextResponse.json({
      ...podium,
      deliberations: podium.deliberationLinks.map(l => l.deliberation),
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating podium:', error)
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }
}
