import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendPushToDeliberation, notifications } from '@/lib/push'

const CELL_SIZE = 5
const IDEAS_PER_CELL = 5

// POST /api/deliberations/[id]/start-voting - Transition to voting phase
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        ideas: { where: { status: 'SUBMITTED' } },
        members: { where: { role: { in: ['CREATOR', 'PARTICIPANT'] } } },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Only creator can start voting
    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can start voting' }, { status: 403 })
    }

    if (deliberation.phase !== 'SUBMISSION') {
      return NextResponse.json({ error: 'Deliberation is not in submission phase' }, { status: 400 })
    }

    if (deliberation.ideas.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 ideas to start voting' }, { status: 400 })
    }

    // Create cells for Tier 1
    const ideas = deliberation.ideas
    const members = deliberation.members

    // Shuffle ideas and members for random assignment
    const shuffledIdeas = [...ideas].sort(() => Math.random() - 0.5)
    const shuffledMembers = [...members].sort(() => Math.random() - 0.5)

    // Calculate number of cells needed
    const numCells = Math.ceil(shuffledIdeas.length / IDEAS_PER_CELL)

    // Create cells
    const cells = []
    for (let i = 0; i < numCells; i++) {
      const cellIdeas = shuffledIdeas.slice(i * IDEAS_PER_CELL, (i + 1) * IDEAS_PER_CELL)
      const cellMembers = shuffledMembers.slice(i * CELL_SIZE, (i + 1) * CELL_SIZE)

      // If not enough members, wrap around
      const actualMembers = cellMembers.length > 0 ? cellMembers : shuffledMembers.slice(0, CELL_SIZE)

      const cell = await prisma.cell.create({
        data: {
          deliberationId: id,
          tier: 1,
          status: 'VOTING',
          votingStartedAt: new Date(),
          votingDeadline: new Date(Date.now() + deliberation.votingTimeoutMs),
          ideas: {
            create: cellIdeas.map(idea => ({
              ideaId: idea.id,
            })),
          },
          participants: {
            create: actualMembers.map(member => ({
              userId: member.userId,
            })),
          },
        },
      })

      cells.push(cell)

      // Update idea statuses
      await prisma.idea.updateMany({
        where: { id: { in: cellIdeas.map(i => i.id) } },
        data: { status: 'IN_VOTING', tier: 1 },
      })
    }

    // Update deliberation phase
    await prisma.deliberation.update({
      where: { id },
      data: { phase: 'VOTING', currentTier: 1 },
    })

    // Send push notifications to all members
    sendPushToDeliberation(
      id,
      notifications.votingStarted(deliberation.question, id)
    ).catch(err => console.error('Failed to send push notifications:', err))

    return NextResponse.json({
      message: 'Voting started',
      cellsCreated: cells.length,
      tier: 1
    })
  } catch (error) {
    console.error('Error starting voting:', error)
    return NextResponse.json({ error: 'Failed to start voting' }, { status: 500 })
  }
}
