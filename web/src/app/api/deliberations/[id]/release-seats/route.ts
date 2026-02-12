import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/deliberations/[id]/release-seats — Release unvoted seats on page exit
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deliberationId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Delete ACTIVE (unvoted) participations for this user in this deliberation
    const result = await prisma.cellParticipation.deleteMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        cell: {
          deliberationId,
          status: 'VOTING',
        },
      },
    })

    return NextResponse.json({ released: result.count })
  } catch (error) {
    console.error('Error releasing seats:', error)
    return NextResponse.json({ error: 'Failed to release seats' }, { status: 500 })
  }
}
