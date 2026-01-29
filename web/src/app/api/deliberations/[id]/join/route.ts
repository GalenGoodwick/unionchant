import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startVotingPhase, addLateJoinerToCell } from '@/lib/voting'

// POST /api/deliberations/[id]/join - Join a deliberation
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
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Check if already a member
    const existingMembership = await prisma.deliberationMember.findUnique({
      where: {
        deliberationId_userId: {
          deliberationId: id,
          userId: user.id,
        },
      },
    })

    if (existingMembership) {
      return NextResponse.json({ message: 'Already a member' })
    }

    // Join the deliberation
    const membership = await prisma.deliberationMember.create({
      data: {
        deliberationId: id,
        userId: user.id,
        role: 'PARTICIPANT',
      },
    })

    // Handle based on deliberation phase
    if (deliberation.phase === 'SUBMISSION' && deliberation.participantGoal) {
      // Check if participant goal is met and auto-start voting
      const memberCount = await prisma.deliberationMember.count({
        where: { deliberationId: id }
      })

      // Need at least 2 ideas to start voting
      const ideaCount = await prisma.idea.count({
        where: { deliberationId: id, status: 'SUBMITTED' }
      })

      if (memberCount >= deliberation.participantGoal && ideaCount >= 2) {
        try {
          await startVotingPhase(id)
        } catch (err) {
          console.error('Failed to auto-start voting on participant goal:', err)
        }
      }
    } else if (deliberation.phase === 'VOTING') {
      // Late joiner - add them to an existing cell so they can participate
      try {
        const result = await addLateJoinerToCell(id, user.id)
        if (result.success) {
          console.log(`[JOIN] Late joiner ${user.id} added to cell ${result.cellId}`)
        }
      } catch (err) {
        console.error('Failed to add late joiner to cell:', err)
        // Don't fail the join - they're still a member, just not in a cell yet
      }
    }

    return NextResponse.json(membership, { status: 201 })
  } catch (error) {
    console.error('Error joining deliberation:', error)
    return NextResponse.json({ error: 'Failed to join deliberation' }, { status: 500 })
  }
}
