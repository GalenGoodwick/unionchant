import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminVerified } from '@/lib/admin'

type DayRow = { day: Date; count: bigint }

function seriesFromRows(rows: DayRow[], days: number): { day: string; count: number }[] {
  const byDay = new Map(rows.map(r => [r.day.toISOString().slice(0, 10), Number(r.count)]))
  const out: { day: string; count: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10)
    out.push({ day: d, count: byDay.get(d) || 0 })
  }
  return out
}

// GET /api/admin/analytics — dashboard aggregates (30-day window)
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const since = new Date(Date.now() - 30 * 86400_000)
    const weekAgo = new Date(Date.now() - 7 * 86400_000)

    const [totalUsers, totalChants, totalVotes, totalIdeas] = await Promise.all([
      prisma.user.count({ where: { isAI: false } }),
      prisma.deliberation.count(),
      prisma.vote.count(),
      prisma.idea.count(),
    ])

    // Weekly active = distinct humans who voted, submitted, or joined in 7d
    const activeRows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT u."id") AS count FROM "User" u
      WHERE u."isAI" = false AND (
        EXISTS (SELECT 1 FROM "Vote" v WHERE v."userId" = u."id" AND v."votedAt" >= ${weekAgo})
        OR EXISTS (SELECT 1 FROM "Idea" i WHERE i."authorId" = u."id" AND i."createdAt" >= ${weekAgo})
        OR EXISTS (SELECT 1 FROM "DeliberationMember" m WHERE m."userId" = u."id" AND m."joinedAt" >= ${weekAgo})
      )`

    const [signups, votesByDay, ideasByDay, joinsByDay] = await Promise.all([
      prisma.$queryRaw<DayRow[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS count FROM "User"
        WHERE "isAI" = false AND "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<DayRow[]>`
        SELECT date_trunc('day', v."votedAt") AS day, COUNT(*) AS count FROM "Vote" v
        JOIN "User" u ON u."id" = v."userId"
        WHERE v."votedAt" >= ${since} AND u."isAI" = false GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<DayRow[]>`
        SELECT date_trunc('day', i."createdAt") AS day, COUNT(*) AS count FROM "Idea" i
        JOIN "User" u ON u."id" = i."authorId"
        WHERE i."createdAt" >= ${since} AND u."isAI" = false GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<DayRow[]>`
        SELECT date_trunc('day', m."joinedAt") AS day, COUNT(*) AS count FROM "DeliberationMember" m
        JOIN "User" u ON u."id" = m."userId"
        WHERE m."joinedAt" >= ${since} AND u."isAI" = false GROUP BY 1 ORDER BY 1`,
    ])

    // Funnel from FunnelEvent (fills from Sep 16 2026 onward)
    const funnelRows = await prisma.funnelEvent.groupBy({
      by: ['type'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    })
    const returnedRows = await prisma.funnelEvent.count({
      where: { createdAt: { gte: since }, type: 'vote_cast', tier: { gt: 1 } },
    })
    const funnelCount = (t: string) => Number(funnelRows.find(r => r.type === t)?._count._all || 0)

    // Retention: cohort = humans signed up 7–37 days ago.
    // Returned = acted (vote/idea) on a later calendar day than signup (D1)
    // or 7+ days after signup (D7).
    const cohortStart = new Date(Date.now() - 37 * 86400_000)
    const cohortEnd = weekAgo
    const retentionRows = await prisma.$queryRaw<{ cohort: bigint; d1: bigint; d7: bigint }[]>`
      SELECT COUNT(*) AS cohort,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "Vote" v WHERE v."userId" = u."id" AND v."votedAt" >= u."createdAt" + interval '1 day'
          UNION SELECT 1 FROM "Idea" i WHERE i."authorId" = u."id" AND i."createdAt" >= u."createdAt" + interval '1 day'
        )) AS d1,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "Vote" v WHERE v."userId" = u."id" AND v."votedAt" >= u."createdAt" + interval '7 day'
          UNION SELECT 1 FROM "Idea" i WHERE i."authorId" = u."id" AND i."createdAt" >= u."createdAt" + interval '7 day'
        )) AS d7
      FROM "User" u
      WHERE u."isAI" = false AND u."createdAt" >= ${cohortStart} AND u."createdAt" < ${cohortEnd}`

    const ret = retentionRows[0]
    const cohort = Number(ret?.cohort || 0)

    return NextResponse.json({
      totals: {
        users: totalUsers,
        activeWeek: Number(activeRows[0]?.count || 0),
        chants: totalChants,
        votes: totalVotes,
        ideas: totalIdeas,
      },
      signupsByDay: seriesFromRows(signups, 30),
      activityByDay: {
        votes: seriesFromRows(votesByDay, 30),
        ideas: seriesFromRows(ideasByDay, 30),
        joins: seriesFromRows(joinsByDay, 30),
      },
      funnel: {
        joins: funnelCount('join'),
        ideaSubmits: funnelCount('idea_submit'),
        voteCasts: funnelCount('vote_cast'),
        returned: Number(returnedRows),
        emailClicks: funnelCount('email_click'),
      },
      retention: {
        cohortSize: cohort,
        d1: cohort ? Math.round((Number(ret.d1) / cohort) * 100) : null,
        d7: cohort ? Math.round((Number(ret.d7) / cohort) * 100) : null,
      },
    })
  } catch (error) {
    console.error('[admin/analytics]', error)
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 })
  }
}
