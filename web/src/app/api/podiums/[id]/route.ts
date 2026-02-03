import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { moderateContent } from '@/lib/moderation'
import { invalidatePodiumCache } from '@/lib/podium-cache'

// GET /api/podiums/[id] - Get a single podium post
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const podium = await prisma.podium.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, name: true, image: true, bio: true, status: true },
        },
        deliberation: {
          select: {
            id: true,
            question: true,
            description: true,
            phase: true,
            _count: { select: { members: true, ideas: true } },
          },
        },
      },
    })

    if (!podium) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Increment view count (fire and forget)
    prisma.podium.update({
      where: { id },
      data: { views: { increment: 1 } },
    }).catch(err => console.error('Failed to increment podium views:', err))

    return NextResponse.json(podium)
  } catch (error) {
    console.error('Error fetching podium:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

// PATCH /api/podiums/[id] - Update a podium post
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    })

    const podium = await prisma.podium.findUnique({
      where: { id },
      select: { authorId: true },
    })

    if (!podium) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isAdmin = user?.role === 'ADMIN'
    const isAuthor = podium.authorId === user?.id

    const body = await req.json()
    const data: Record<string, unknown> = {}

    // deliberationId linking — podium author, deliberation creator, or admin can link
    if (body.deliberationId !== undefined) {
      if (body.deliberationId) {
        const delib = await prisma.deliberation.findUnique({
          where: { id: body.deliberationId },
          select: { id: true, creatorId: true },
        })
        if (!delib) {
          return NextResponse.json({ error: 'Linked deliberation not found' }, { status: 404 })
        }
        const isDelibCreator = delib.creatorId === user?.id
        if (!isAuthor && !isDelibCreator && !isAdmin) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        data.deliberationId = body.deliberationId
      } else {
        // Unlinking — only podium author or admin
        if (!isAuthor && !isAdmin) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        data.deliberationId = null
      }
    }

    // All other fields require podium author or admin
    const hasOtherFields = body.title !== undefined || body.body !== undefined || body.pinned !== undefined
    if (hasOtherFields && !isAuthor && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Admin-only: toggle pinned
    if (body.pinned !== undefined && isAdmin) {
      data.pinned = !!body.pinned
    }

    if (body.title !== undefined) {
      const title = body.title.trim()
      if (!title) {
        return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
      }
      if (title.length > 200) {
        return NextResponse.json({ error: 'Title too long (max 200 chars)' }, { status: 400 })
      }
      const check = moderateContent(title)
      if (!check.allowed) {
        return NextResponse.json({ error: `Title: ${check.reason}` }, { status: 400 })
      }
      data.title = title
    }

    if (body.body !== undefined) {
      const bodyText = body.body.trim()
      if (!bodyText) {
        return NextResponse.json({ error: 'Body cannot be empty' }, { status: 400 })
      }
      const check = moderateContent(bodyText)
      if (!check.allowed) {
        return NextResponse.json({ error: `Body: ${check.reason}` }, { status: 400 })
      }
      data.body = bodyText
    }

    const updated = await prisma.podium.update({
      where: { id },
      data,
      include: {
        author: { select: { id: true, name: true, image: true } },
        deliberation: { select: { id: true, question: true, phase: true } },
      },
    })

    invalidatePodiumCache()
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating podium:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

// DELETE /api/podiums/[id] - Delete a podium post
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    })

    const podium = await prisma.podium.findUnique({
      where: { id },
      select: { authorId: true },
    })

    if (!podium) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Author or admin can delete
    if (podium.authorId !== user?.id && user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.podium.delete({ where: { id } })

    invalidatePodiumCache()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting podium:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
