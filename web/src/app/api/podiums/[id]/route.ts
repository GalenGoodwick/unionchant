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
        deliberationLinks: {
          include: {
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
          orderBy: { createdAt: 'desc' },
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

    return NextResponse.json({
      ...podium,
      deliberations: podium.deliberationLinks.map(l => l.deliberation),
    })
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

    // deliberationId linking — any authenticated user can add/remove links
    if (body.deliberationId !== undefined) {
      if (body.deliberationId) {
        const delib = await prisma.deliberation.findUnique({
          where: { id: body.deliberationId },
          select: { id: true },
        })
        if (!delib) {
          return NextResponse.json({ error: 'Linked deliberation not found' }, { status: 404 })
        }
        // Create junction entry (upsert to avoid duplicates)
        await prisma.podiumDeliberation.upsert({
          where: { podiumId_deliberationId: { podiumId: id, deliberationId: body.deliberationId } },
          create: { podiumId: id, deliberationId: body.deliberationId },
          update: {},
        })
      }
    }

    // Remove a specific link
    if (body.removeDeliberationId) {
      await prisma.podiumDeliberation.deleteMany({
        where: { podiumId: id, deliberationId: body.removeDeliberationId },
      })
    }

    // All other fields require author or admin
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

    // Only run update if there are fields to change
    if (Object.keys(data).length > 0) {
      await prisma.podium.update({ where: { id }, data })
    }

    // Return full updated podium
    const updated = await prisma.podium.findUnique({
      where: { id },
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
      ...updated,
      deliberations: updated?.deliberationLinks.map(l => l.deliberation) || [],
    })
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
