import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'

// GET /api/admin/flagged-users — Users with pending reports + banned users
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email || !(await isAdmin(session.user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all pending reports where the target is a USER
    const pendingUserReports = await prisma.report.findMany({
      where: { targetType: 'USER', status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
      },
    })

    // Group reports by targetId (the user being reported)
    const reportsByUser = new Map<string, typeof pendingUserReports>()
    for (const r of pendingUserReports) {
      const existing = reportsByUser.get(r.targetId) || []
      existing.push(r)
      reportsByUser.set(r.targetId, existing)
    }

    // Also get pending reports on content (COMMENT, IDEA) to find their authors
    const pendingContentReports = await prisma.report.findMany({
      where: { targetType: { in: ['COMMENT', 'IDEA'] }, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
      },
    })

    // Look up authors of reported comments/ideas
    for (const r of pendingContentReports) {
      let authorId: string | null = null
      if (r.targetType === 'COMMENT') {
        const comment = await prisma.comment.findUnique({
          where: { id: r.targetId },
          select: { userId: true },
        })
        authorId = comment?.userId || null
      } else if (r.targetType === 'IDEA') {
        const idea = await prisma.idea.findUnique({
          where: { id: r.targetId },
          select: { authorId: true },
        })
        authorId = idea?.authorId || null
      }
      if (authorId) {
        const existing = reportsByUser.get(authorId) || []
        existing.push(r)
        reportsByUser.set(authorId, existing)
      }
    }

    // Fetch user details for all flagged users
    const userIds = Array.from(reportsByUser.keys())
    const flaggedUsers = userIds.length > 0 ? await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true, name: true, email: true, image: true, status: true,
        bannedAt: true, banReason: true, createdAt: true,
        _count: { select: { ideas: true, votes: true, comments: true } },
      },
    }) : []

    // Also get recently banned users (even without pending reports)
    const bannedUsers = await prisma.user.findMany({
      where: { status: 'BANNED', id: { notIn: userIds } },
      orderBy: { bannedAt: 'desc' },
      take: 20,
      select: {
        id: true, name: true, email: true, image: true, status: true,
        bannedAt: true, banReason: true, createdAt: true,
        _count: { select: { ideas: true, votes: true, comments: true } },
      },
    })

    // Build response
    const result = flaggedUsers.map(u => ({
      ...u,
      reports: (reportsByUser.get(u.id) || []).map(r => ({
        id: r.id,
        reason: r.reason,
        details: r.details,
        targetType: r.targetType,
        createdAt: r.createdAt,
        reporter: r.reporter,
      })),
      totalReports: (reportsByUser.get(u.id) || []).length,
    }))

    // Sort: most reports first
    result.sort((a, b) => b.totalReports - a.totalReports)

    const banned = bannedUsers.map(u => ({
      ...u,
      reports: [],
      totalReports: 0,
    }))

    return NextResponse.json({ flagged: result, banned })
  } catch (error) {
    console.error('Error fetching flagged users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
