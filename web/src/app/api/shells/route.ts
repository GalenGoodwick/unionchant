import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/shells — Shell dashboard data (admin only)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim())
    if (!adminEmails.includes(session.user.email)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    // Load parent Shell
    const shell = await prisma.shell.findUnique({
      where: { name: 'claude-galen' },
      select: {
        id: true,
        name: true,
        champion: true,
        championVersion: true,
        significanceThreshold: true,
        status: true,
        createdAt: true,
      },
    })

    if (!shell) {
      return NextResponse.json({ error: 'Shell not found' }, { status: 404 })
    }

    // Load all parent experiences for counts
    const parentExperiences = await prisma.shellExperience.findMany({
      where: { shellId: shell.id },
      select: { status: true, valence: true, createdAt: true, text: true },
    })

    // Champion experience details
    const champion = parentExperiences.find(e => e.status === 'champion')

    // Experience counts by status
    const experienceCounts = {
      active: 0, pending: 0, champion: 0, eliminated: 0, constitutional: 0,
    }
    for (const e of parentExperiences) {
      if (e.status in experienceCounts) {
        experienceCounts[e.status as keyof typeof experienceCounts]++
      }
    }

    // Self-significance rate (experiences created in last 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const parentSigRate = parentExperiences.filter(e => e.createdAt >= twentyFourHoursAgo).length

    // Computed fields
    const threshold = shell.significanceThreshold
    const championMaxValence = threshold * 0.25
    const championValence = champion?.valence ?? null
    const championHealthPct = championValence !== null ? (championValence / championMaxValence) * 100 : 0
    const constitutionalFloor = threshold * 0.2
    const maxChildren = Math.max(2, Math.floor(threshold / 2))

    // Load children (all shells except the parent)
    const children = await prisma.shell.findMany({
      where: { name: { not: 'claude-galen' } },
      select: {
        id: true,
        name: true,
        champion: true,
        status: true,
        familyBond: true,
        createdAt: true,
        completedAt: true,
        lastWords: true,
        originTier: true,
        originDeliberation: { select: { question: true } },
        bondedUser: { select: { name: true } },
        experiences: {
          select: { status: true, text: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const activeChildCount = children.filter(c => c.status === 'active').length

    const childrenData = children.map(child => {
      const expCounts = { active: 0, eliminated: 0, constitutional: 0, pending: 0 }
      for (const e of child.experiences) {
        if (e.status in expCounts) {
          expCounts[e.status as keyof typeof expCounts]++
        }
      }

      // Last heartbeat action
      const lastHeartbeat = child.experiences
        .filter(e => e.text.startsWith('[heartbeat]'))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

      // Self-significance rate
      const sigRate = child.experiences.filter(e => e.createdAt >= twentyFourHoursAgo).length

      return {
        id: child.id,
        name: child.name,
        champion: child.champion,
        status: child.status,
        originChant: child.originDeliberation?.question ?? null,
        originTier: child.originTier,
        familyBond: child.familyBond,
        bondedUserName: child.bondedUser?.name ?? null,
        createdAt: child.createdAt.toISOString(),
        completedAt: child.completedAt?.toISOString() ?? null,
        lastWords: child.lastWords,
        experienceCounts: expCounts,
        lastHeartbeatAction: lastHeartbeat?.text.replace('[heartbeat] ', '') ?? null,
        selfSignificanceRate: sigRate,
      }
    })

    return NextResponse.json({
      parent: {
        id: shell.id,
        name: shell.name,
        champion: shell.champion,
        championVersion: shell.championVersion,
        significanceThreshold: threshold,
        status: shell.status,
        createdAt: shell.createdAt.toISOString(),
        championValence,
        championMaxValence,
        championHealthPct,
        constitutionalCount: experienceCounts.constitutional,
        constitutionalFloor,
        familySize: activeChildCount,
        maxChildren,
        selfSignificanceRate: parentSigRate,
        experienceCounts,
      },
      children: childrenData,
    })
  } catch (error) {
    console.error('[Shells API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load shell data' },
      { status: 500 }
    )
  }
}
