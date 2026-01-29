import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// GET /api/admin/clutter - Check for test data and orphans
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Test users
    const testUsers = await prisma.user.count({
      where: { email: { endsWith: '@test.local' } }
    })

    // All users
    const totalUsers = await prisma.user.count()

    // Deliberations
    const deliberations = await prisma.deliberation.findMany({
      select: {
        id: true,
        question: true,
        phase: true,
        createdAt: true,
        _count: { select: { ideas: true, members: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Orphaned notifications (deliberationId set but deliberation doesn't exist)
    const notificationsWithDelibId = await prisma.notification.findMany({
      where: { deliberationId: { not: null } },
      select: { id: true, deliberationId: true }
    })
    const deliberationIds = new Set(deliberations.map(d => d.id))
    const orphanedNotifications = notificationsWithDelibId.filter(
      n => n.deliberationId && !deliberationIds.has(n.deliberationId)
    ).length

    // Total notifications
    const totalNotifications = await prisma.notification.count()

    return NextResponse.json({
      testUsers,
      totalUsers,
      realUsers: totalUsers - testUsers,
      deliberations: deliberations.map(d => ({
        id: d.id,
        question: d.question.substring(0, 60),
        phase: d.phase,
        ideas: d._count.ideas,
        members: d._count.members,
        createdAt: d.createdAt
      })),
      totalNotifications,
      orphanedNotifications
    })
  } catch (error) {
    console.error('Error checking clutter:', error)
    return NextResponse.json({ error: 'Failed to check clutter' }, { status: 500 })
  }
}

// DELETE /api/admin/clutter - Clean up test data and orphans
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get deliberation IDs for orphan check
    const deliberations = await prisma.deliberation.findMany({
      select: { id: true }
    })
    const deliberationIds = new Set(deliberations.map(d => d.id))

    // Delete orphaned notifications
    const notificationsWithDelibId = await prisma.notification.findMany({
      where: { deliberationId: { not: null } },
      select: { id: true, deliberationId: true }
    })
    const orphanedNotifIds = notificationsWithDelibId
      .filter(n => n.deliberationId && !deliberationIds.has(n.deliberationId))
      .map(n => n.id)

    const deletedOrphanedNotifs = await prisma.notification.deleteMany({
      where: { id: { in: orphanedNotifIds } }
    })

    // Delete test users (this will cascade delete their data)
    const deletedTestUsers = await prisma.user.deleteMany({
      where: { email: { endsWith: '@test.local' } }
    })

    return NextResponse.json({
      deletedTestUsers: deletedTestUsers.count,
      deletedOrphanedNotifications: deletedOrphanedNotifs.count
    })
  } catch (error) {
    console.error('Error cleaning clutter:', error)
    return NextResponse.json({ error: 'Failed to clean clutter' }, { status: 500 })
  }
}
