import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/cron/cleanup — Daily cleanup:
// 1. Prune old collective chat + group chat messages (2 days)
// 2. Purge inactive anonymous accounts (48h, no participation) — telemetry kept
// Cell comments are NOT pruned.
export async function GET(req: NextRequest) {
  // Verify cron secret or Vercel cron header
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'

  if (!isVercelCron && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const messageCutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
  const anonCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000) // 48 hours ago

  try {
    const [collectiveResult, groupResult] = await Promise.all([
      // Prune collective chat messages older than 2 days
      prisma.collectiveMessage.deleteMany({
        where: { createdAt: { lt: messageCutoff } },
      }),
      // Prune group chat messages older than 2 days
      prisma.groupMessage.deleteMany({
        where: { createdAt: { lt: messageCutoff } },
      }),
    ])

    // Purge inactive anonymous accounts:
    // - Anonymous (isAnonymous = true)
    // - Created > 48h ago
    // - Zero participation (no ideas, votes, comments, memberships)
    // ChallengeLog telemetry is preserved (userId set to null via SetNull cascade)
    const inactiveAnons = await prisma.user.findMany({
      where: {
        isAnonymous: true,
        createdAt: { lt: anonCutoff },
        ideas: { none: {} },
        votes: { none: {} },
        comments: { none: {} },
        memberships: { none: {} },
        communityMemberships: { none: {} },
        webauthnCredentials: { none: {} }, // skip users who preserved with passkey
      },
      select: { id: true },
    })

    let purgedAnons = 0
    if (inactiveAnons.length > 0) {
      const ids = inactiveAnons.map(u => u.id)
      // Delete in batches to avoid timeout
      const BATCH = 100
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH)
        await prisma.user.deleteMany({
          where: { id: { in: batch } },
        })
        purgedAnons += batch.length
      }
    }

    console.log(`[Cleanup] Pruned ${collectiveResult.count} collective messages, ${groupResult.count} group messages, purged ${purgedAnons} inactive anonymous accounts (cutoffs: messages=${messageCutoff.toISOString()}, anon=${anonCutoff.toISOString()})`)

    return NextResponse.json({
      success: true,
      pruned: {
        collectiveMessages: collectiveResult.count,
        groupMessages: groupResult.count,
        inactiveAnonymousAccounts: purgedAnons,
      },
      cutoff: messageCutoff.toISOString(),
    })
  } catch (error) {
    console.error('[Cleanup] Error:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
