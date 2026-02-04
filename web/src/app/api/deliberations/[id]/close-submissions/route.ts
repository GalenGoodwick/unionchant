import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processCellResults, checkTierCompletion } from '@/lib/voting'

// POST /api/deliberations/[id]/close-submissions
// Continuous flow: close tier 1 submissions, batch remaining ideas, advance to tier 2
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    const isCreator = deliberation.creatorId === user.id
    const isAdmin = user.role === 'ADMIN'

    if (!isCreator && !isAdmin) {
      return NextResponse.json({ error: 'Only the creator can close submissions' }, { status: 403 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Deliberation is not in voting phase' }, { status: 400 })
    }

    if (!deliberation.continuousFlow) {
      return NextResponse.json({ error: 'Continuous flow is not enabled' }, { status: 400 })
    }

    if (deliberation.currentTier !== 1) {
      return NextResponse.json({ error: 'Already past tier 1' }, { status: 400 })
    }

    // 1. Find unassigned ideas (SUBMITTED, not in any cell)
    const unassignedIdeas = await prisma.idea.findMany({
      where: {
        deliberationId: id,
        status: 'SUBMITTED',
        cellIdeas: { none: {} },
      },
      select: { id: true, authorId: true },
    })

    // 2. Find unassigned members (not in any tier 1 cell)
    const membersInTier1 = await prisma.cellParticipation.findMany({
      where: {
        cell: { deliberationId: id, tier: 1 },
      },
      select: { userId: true },
    })
    const assignedUserIds = new Set(membersInTier1.map(p => p.userId))

    const allMembers = await prisma.deliberationMember.findMany({
      where: {
        deliberationId: id,
        role: { in: ['CREATOR', 'PARTICIPANT'] },
      },
      select: { userId: true },
    })
    const unassignedMembers = allMembers.filter(m => !assignedUserIds.has(m.userId))

    let batchedIdeas = 0
    let pooledIdeas = 0

    if (unassignedIdeas.length >= 2 && unassignedMembers.length >= 3) {
      // Enough for a proper cell — create one final cell
      const memberCount = Math.min(unassignedMembers.length, 7)
      const cellMembers = unassignedMembers.slice(0, memberCount)

      await prisma.idea.updateMany({
        where: { id: { in: unassignedIdeas.map(i => i.id) } },
        data: { status: 'IN_VOTING', tier: 1 },
      })

      const hasDiscussion = deliberation.discussionDurationMs !== null && deliberation.discussionDurationMs !== 0
      const cellStatus = hasDiscussion ? 'DELIBERATING' as const : 'VOTING' as const

      await prisma.cell.create({
        data: {
          deliberationId: id,
          tier: 1,
          status: cellStatus,
          ideas: {
            create: unassignedIdeas.map(i => ({ ideaId: i.id })),
          },
          participants: {
            create: cellMembers.map(m => ({ userId: m.userId })),
          },
        },
      })

      batchedIdeas = unassignedIdeas.length
    } else if (unassignedIdeas.length > 0) {
      // Not enough members or only 1 idea — send to accumulation pool
      await prisma.idea.updateMany({
        where: { id: { in: unassignedIdeas.map(i => i.id) } },
        data: { status: 'PENDING', isNew: true },
      })
      pooledIdeas = unassignedIdeas.length
    }

    // 3. Force-complete any open cells (VOTING or DELIBERATING)
    const openCells = await prisma.cell.findMany({
      where: {
        deliberationId: id,
        tier: 1,
        status: { in: ['VOTING', 'DELIBERATING'] },
      },
      select: { id: true },
    })

    let closedCells = 0
    for (const cell of openCells) {
      await processCellResults(cell.id, true)
      closedCells++
    }

    // 4. Disable continuous flow guard so checkTierCompletion can advance
    // We do this by temporarily clearing unassigned ideas (already handled above)
    // Now trigger tier completion check
    await checkTierCompletion(id, 1)

    // 5. Check what happened
    const updated = await prisma.deliberation.findUnique({
      where: { id },
      select: { currentTier: true, phase: true },
    })

    return NextResponse.json({
      success: true,
      closedCells,
      batchedIdeas,
      pooledIdeas,
      tier2Started: (updated?.currentTier ?? 1) > 1,
      currentTier: updated?.currentTier,
      phase: updated?.phase,
    })
  } catch (error) {
    console.error('Error closing submissions:', error)
    return NextResponse.json({ error: 'Failed to close submissions' }, { status: 500 })
  }
}
