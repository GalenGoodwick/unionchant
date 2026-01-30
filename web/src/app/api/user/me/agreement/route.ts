import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/user/me/agreement - Get top agreement matches (min 3 shared cells)
export async function GET() {
  try {
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

    // Find scores where this user is either userA or userB, min 3 shared cells
    const scores = await prisma.agreementScore.findMany({
      where: {
        OR: [
          { userAId: user.id },
          { userBId: user.id },
        ],
        totalCells: { gte: 3 },
      },
      orderBy: { agreeCount: 'desc' },
      take: 20,
    })

    // Get the other user IDs
    const otherUserIds = scores.map(s =>
      s.userAId === user.id ? s.userBId : s.userAId
    )

    // Fetch user info
    const users = await prisma.user.findMany({
      where: { id: { in: otherUserIds }, status: 'ACTIVE' },
      select: { id: true, name: true, image: true },
    })
    const userMap = new Map(users.map(u => [u.id, u]))

    const matches = scores
      .map(s => {
        const otherId = s.userAId === user.id ? s.userBId : s.userAId
        const otherUser = userMap.get(otherId)
        if (!otherUser) return null

        const agreementPct = s.totalCells > 0
          ? Math.round((s.agreeCount / s.totalCells) * 100)
          : 0

        return {
          user: { id: otherUser.id, name: otherUser.name || 'Anonymous', image: otherUser.image },
          agreeCount: s.agreeCount,
          disagreeCount: s.disagreeCount,
          totalCells: s.totalCells,
          agreementPct,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b!.agreementPct - a!.agreementPct)
      .slice(0, 10)

    return NextResponse.json({ matches })
  } catch (error) {
    console.error('Error fetching agreement scores:', error)
    return NextResponse.json({ error: 'Failed to fetch agreement data' }, { status: 500 })
  }
}
