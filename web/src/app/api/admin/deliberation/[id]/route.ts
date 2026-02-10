import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminVerified } from '@/lib/admin'

// GET /api/admin/deliberation/[id] - Get full deliberation details for admin
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const { id } = await params

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            ideas: true,
            members: true,
            cells: true,
          },
        },
        ideas: {
          orderBy: [
            { isChampion: 'desc' },
            { status: 'asc' },
            { totalVotes: 'desc' },
          ],
          select: {
            id: true,
            text: true,
            status: true,
            tier: true,
            totalVotes: true,
            totalXP: true,
            isChampion: true,
          },
        },
        cells: {
          orderBy: [
            { status: 'asc' },
            { tier: 'desc' },
            { batch: 'asc' },
            { createdAt: 'desc' },
          ],
          select: {
            id: true,
            tier: true,
            batch: true,
            status: true,
            participants: {
              select: { userId: true, status: true },
            },
            ideas: {
              include: {
                idea: {
                  select: { id: true, text: true, totalVotes: true },
                },
              },
            },
            comments: {
              orderBy: { createdAt: 'desc' },
              take: 50,
              include: {
                user: {
                  select: { name: true },
                },
                idea: {
                  select: { text: true },
                },
              },
            },
            _count: {
              select: { votes: true },
            },
          },
        },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    return NextResponse.json(deliberation)
  } catch (error) {
    console.error('Error fetching deliberation:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

// PATCH /api/admin/deliberation/[id] - Update deliberation settings
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const { id } = await params
    const body = await req.json()

    const allowedFields: Record<string, boolean> = { isPublic: true }
    const data: Record<string, unknown> = {}
    for (const key of Object.keys(body)) {
      if (allowedFields[key]) data[key] = body[key]
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const updated = await prisma.deliberation.update({
      where: { id },
      data,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating deliberation:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
