import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/cron/cleanup — Daily cleanup: prune old collective chat + group chat messages (2 days)
// Cell comments are NOT pruned.
export async function GET(req: NextRequest) {
  // Verify cron secret or Vercel cron header
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'

  if (!isVercelCron && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago

  try {
    const [collectiveResult, groupResult, anonResult] = await Promise.all([
      // Prune collective chat messages older than 2 days
      prisma.collectiveMessage.deleteMany({
        where: { createdAt: { lt: cutoff } },
      }),
      // Prune group chat messages older than 2 days
      prisma.groupMessage.deleteMany({
        where: { createdAt: { lt: cutoff } },
      }),
      // Delete expired anonymous accounts (24h+ old)
      prisma.user.deleteMany({
        where: {
          isAnonymous: true,
          anonymousExpiresAt: { lt: new Date() },
        },
      }),
    ])

    console.log(`[Cleanup] Pruned ${collectiveResult.count} collective messages, ${groupResult.count} group messages, ${anonResult.count} anonymous accounts (cutoff: ${cutoff.toISOString()})`)

    return NextResponse.json({
      success: true,
      pruned: {
        collectiveMessages: collectiveResult.count,
        groupMessages: groupResult.count,
        anonymousAccounts: anonResult.count,
      },
      cutoff: cutoff.toISOString(),
    })
  } catch (error) {
    console.error('[Cleanup] Error:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
