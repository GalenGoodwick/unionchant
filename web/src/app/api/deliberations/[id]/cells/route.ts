import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/deliberations/[id]/cells - Get user's cells in this deliberation
export async function GET(
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
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get cells where user is a participant
    const cells = await prisma.cell.findMany({
      where: {
        deliberationId: id,
        participants: {
          some: { userId: user.id },
        },
      },
      include: {
        ideas: {
          include: {
            idea: {
              include: {
                author: { select: { name: true } },
              },
            },
          },
        },
        participants: {
          include: {
            user: { select: { id: true, name: true, image: true } },
          },
        },
        votes: {
          where: { userId: user.id },
        },
      },
      orderBy: { tier: 'asc' },
    })

    return NextResponse.json(cells)
  } catch (error) {
    console.error('Error fetching cells:', error)
    return NextResponse.json({ error: 'Failed to fetch cells' }, { status: 500 })
  }
}
