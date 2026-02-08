import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const MIN_INTERVAL_MS = 2.5 * 60 * 60 * 1000 // 2.5 hours
const MAX_INTERVAL_MS = 3 * 60 * 60 * 1000   // 3 hours

// GET /api/challenge/status — check if user needs a challenge
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ needsChallenge: false })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { lastChallengePassedAt: true, isAI: true, role: true },
    })

    if (!user) return NextResponse.json({ needsChallenge: false })

    // AI agents and admins skip challenges
    if (user.isAI || user.role === 'ADMIN') {
      return NextResponse.json({ needsChallenge: false })
    }

    // Never passed = needs challenge (but give 5 min grace on first session)
    if (!user.lastChallengePassedAt) {
      return NextResponse.json({
        needsChallenge: true,
        msUntilNext: 0,
      })
    }

    const elapsed = Date.now() - user.lastChallengePassedAt.getTime()
    const interval = MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS)

    if (elapsed >= interval) {
      return NextResponse.json({
        needsChallenge: true,
        msUntilNext: 0,
      })
    }

    return NextResponse.json({
      needsChallenge: false,
      msUntilNext: Math.ceil(interval - elapsed),
    })
  } catch {
    return NextResponse.json({ needsChallenge: false })
  }
}
