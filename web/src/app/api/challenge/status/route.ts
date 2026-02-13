import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cached } from '@/lib/cache'

const MIN_INTERVAL_MS = 22 * 60 * 60 * 1000 // 22 hours
const MAX_INTERVAL_MS = 26 * 60 * 60 * 1000 // 26 hours

// GET /api/challenge/status — check if user needs a challenge
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ needsChallenge: false })
    }

    const user = await cached(`challenge:${session.user.id}`, 30_000, () =>
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { lastChallengePassedAt: true, isAI: true, role: true },
      })
    )

    if (!user) return NextResponse.json({ needsChallenge: false })

    // AI agents skip challenges
    if (user.isAI) {
      return NextResponse.json({ needsChallenge: false })
    }

    // Easter egg: force=1 always issues a challenge (Beta button)
    const url = new URL(req.url)
    const force = url.searchParams.get('force') === '1'

    let needsChallenge = false

    if (force) {
      needsChallenge = true
    } else if (!user.lastChallengePassedAt) {
      // Never passed = needs challenge
      needsChallenge = true
    } else {
      const elapsed = Date.now() - user.lastChallengePassedAt.getTime()
      const interval = MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS)
      if (elapsed >= interval) {
        needsChallenge = true
      } else {
        return NextResponse.json({
          needsChallenge: false,
          msUntilNext: Math.ceil(interval - elapsed),
        })
      }
    }

    if (needsChallenge) {
      // Generate a one-time challenge token and store it
      const challengeToken = crypto.randomUUID()
      await prisma.challengeLog.create({
        data: {
          userId: session.user.id,
          challengeToken,
          issuedAt: new Date(),
          result: 'pending',
          used: false,
        },
      })

      return NextResponse.json({
        needsChallenge: true,
        challengeToken,
        msUntilNext: 0,
      })
    }

    return NextResponse.json({ needsChallenge: false })
  } catch {
    return NextResponse.json({ needsChallenge: false })
  }
}
