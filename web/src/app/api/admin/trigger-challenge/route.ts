import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/admin/trigger-challenge — force all users to re-challenge
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    })

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Null out everyone's lastChallengePassedAt — forces re-challenge on next status check
    const result = await prisma.user.updateMany({
      where: {
        isAI: false,
        role: { not: 'ADMIN' },
      },
      data: { lastChallengePassedAt: null },
    })

    console.warn(`ADMIN TRIGGER CHALLENGE: admin=${session.user.id} affected=${result.count} users`)

    return NextResponse.json({ ok: true, affected: result.count })
  } catch (err) {
    console.error('Admin trigger challenge error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// GET /api/admin/trigger-challenge — get challenge stats
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    })

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get aggregated stats
    const [totalLogs, resultCounts, recentFails, flaggedUsers] = await Promise.all([
      prisma.challengeLog.count(),
      prisma.challengeLog.groupBy({
        by: ['result'],
        _count: { id: true },
      }),
      prisma.challengeLog.findMany({
        where: { result: { not: 'passed' } },
        include: { user: { select: { id: true, name: true, email: true, challengeFailCount: true, botFlaggedAt: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.user.findMany({
        where: { botFlaggedAt: { not: null } },
        select: { id: true, name: true, email: true, botFlaggedAt: true, challengeFailCount: true, createdAt: true },
        orderBy: { botFlaggedAt: 'desc' },
        take: 20,
      }),
    ])

    return NextResponse.json({
      totalLogs,
      resultCounts: resultCounts.map(r => ({ result: r.result, count: r._count.id })),
      recentFails,
      flaggedUsers,
    })
  } catch (err) {
    console.error('Challenge stats error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
