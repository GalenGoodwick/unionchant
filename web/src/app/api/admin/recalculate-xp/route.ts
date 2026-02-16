import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminVerified } from '@/lib/admin'

// POST /api/admin/recalculate-xp - Recalculate totalXP for all ideas
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    // Update all ideas' totalXP by summing their votes across all cells
    await prisma.$executeRaw`
      UPDATE "Idea" SET "totalXP" = COALESCE(sub.xp, 0)::int, "totalVotes" = COALESCE(sub.voters, 0)::int
      FROM (
        SELECT "ideaId", COUNT(DISTINCT "userId") as voters, SUM("xpPoints") as xp
        FROM "Vote"
        GROUP BY "ideaId"
      ) sub
      WHERE "Idea".id = sub."ideaId"
    `

    // Get stats
    const stats = await prisma.idea.aggregate({
      where: { totalXP: { gt: 0 } },
      _count: true,
      _sum: { totalXP: true },
      _max: { totalXP: true },
    })

    return NextResponse.json({
      success: true,
      message: 'XP recalculated for all ideas',
      stats: {
        ideasWithXP: stats._count,
        totalXP: stats._sum.totalXP || 0,
        maxXP: stats._max.totalXP || 0,
      },
    })
  } catch (error) {
    console.error('Error recalculating XP:', error)
    return NextResponse.json(
      { error: 'Failed to recalculate XP' },
      { status: 500 }
    )
  }
}
