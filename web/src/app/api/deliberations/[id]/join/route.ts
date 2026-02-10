import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
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

    const limited = await checkRateLimit('join', session.user.email)
    if (limited) {
      return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
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

    // Private deliberations cannot be joined directly — must use invite link
    if (!deliberation.isPublic) {
      return NextResponse.json({ error: 'This chant requires an invite link to join' }, { status: 403 })
    }

    // Check if AI agents are allowed
    if (!deliberation.allowAI && user.isAI) {
      return NextResponse.json({ error: 'This chant does not allow AI agents' }, { status: 403 })
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

    // If this is the showcase deliberation, retire the newest AI agent
    if (deliberation.isShowcase) {
      try {
        const agentToRetire = await prisma.aIAgent.findFirst({
          where: {
            deliberationId: id,
            isRetired: false,
            isCollective: false,
          },
          orderBy: { createdOrder: 'desc' }, // newest first
        })

        if (agentToRetire) {
          await prisma.aIAgent.update({
            where: { id: agentToRetire.id },
            data: {
              isRetired: true,
              retiredByUserId: user.id,
            },
          })
          console.log(`[JOIN] Retired AI agent ${agentToRetire.persona} (replaced by ${user.id})`)
        }
      } catch (err) {
        console.error('[JOIN] Failed to retire AI agent:', err)
      }
    }

    // Handle based on deliberation phase
    let roundFull = false
    if (deliberation.phase === 'VOTING') {
      // Late joiner - add them to an existing cell so they can participate
      try {
        const result = await addLateJoinerToCell(id, user.id)
        if (result.success) {
          console.log(`[JOIN] Late joiner ${user.id} added to cell ${result.cellId}`)
        } else if (result.reason === 'ROUND_FULL') {
          console.log(`[JOIN] Round full for late joiner ${user.id} — will participate next tier`)
          roundFull = true
        }
      } catch (err) {
        console.error('Failed to add late joiner to cell:', err)
        // Don't fail the join - they're still a member, just not in a cell yet
      }
    }

    return NextResponse.json({ ...membership, roundFull }, { status: 201 })
  } catch (error) {
    console.error('Error joining deliberation:', error)
    return NextResponse.json({ error: 'Failed to join deliberation' }, { status: 500 })
  }
}
