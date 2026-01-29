import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'

// GET /api/admin/deliberation/[id] - Get full deliberation details for admin
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email || !(await isAdmin(session.user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
            isChampion: true,
          },
        },
        cells: {
          orderBy: [
            { status: 'asc' },
            { tier: 'desc' },
            { createdAt: 'desc' },
          ],
          include: {
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
