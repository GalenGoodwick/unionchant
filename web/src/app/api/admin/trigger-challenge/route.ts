import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminVerified } from '@/lib/admin'

// POST /api/admin/trigger-challenge — force all users to re-challenge
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    // Null out everyone's lastChallengePassedAt — forces re-challenge on next status check
    const affectedUsers = await prisma.user.findMany({
      where: {
        isAI: false,
        role: { not: 'ADMIN' },
      },
      select: { id: true },
    })

    await prisma.user.updateMany({
      where: { id: { in: affectedUsers.map(u => u.id) } },
      data: { lastChallengePassedAt: null },
    })

    console.warn(`ADMIN TRIGGER CHALLENGE: admin=${auth.userId} affected=${affectedUsers.length} users`)

    // Notify all affected users via the notification bell
    if (affectedUsers.length > 0) {
      await prisma.notification.createMany({
        data: affectedUsers.map(u => ({
          userId: u.id,
          type: 'ADMIN_CHALLENGE' as const,
          title: 'Verification required',
          body: 'Please complete a quick challenge to verify your account',
        })),
      })
    }

    return NextResponse.json({ ok: true, affected: affectedUsers.length })
  } catch (err) {
    console.error('Admin trigger challenge error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// GET /api/admin/trigger-challenge — get challenge stats
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

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
