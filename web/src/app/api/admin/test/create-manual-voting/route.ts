import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  try {
    // Create deliberation
    const delib = await prisma.deliberation.create({
      data: {
        question: 'Manual Test: What is the best pizza topping?',
        description: 'Testing the vote UI',
        phase: 'VOTING',
        currentTier: 1,
        isPublic: true,
        creatorId: user.id,
        allocationMode: 'balanced',
        continuousFlow: false,
        allowAI: false,
      }
    })

    // Add you as participant
    await prisma.deliberationMember.create({
      data: {
        deliberationId: delib.id,
        userId: user.id,
        role: 'PARTICIPANT'
      }
    })

    // Create test users
    const testUsers: any[] = []
    for (let i = 0; i < 4; i++) {
      const testUser = await prisma.user.upsert({
        where: { email: `manual-test-${i}@test.com` },
        create: {
          email: `manual-test-${i}@test.com`,
          name: `Test User ${i+1}`,
          emailVerified: new Date(),
          status: 'ACTIVE'
        },
        update: {}
      })
      testUsers.push(testUser)

      await prisma.deliberationMember.create({
        data: {
          deliberationId: delib.id,
          userId: testUser.id,
          role: 'PARTICIPANT'
        }
      })
    }

    // Create 5 ideas
    const toppings = ['Pepperoni', 'Mushrooms', 'Sausage', 'Onions', 'Peppers']
    const ideas: any[] = []
    for (let i = 0; i < 5; i++) {
      const idea = await prisma.idea.create({
        data: {
          deliberationId: delib.id,
          authorId: testUsers[i % 4].id,
          text: `${toppings[i]} - the classic choice`,
          status: 'IN_VOTING',
          tier: 1
        }
      })
      ideas.push(idea)
    }

    // Create a cell with you and 4 test users
    const cell = await prisma.cell.create({
      data: {
        deliberationId: delib.id,
        tier: 1,
        status: 'VOTING',
        votingDeadline: new Date(Date.now() + 3600000) // 1 hour from now
      }
    })

    // Add all 5 participants to the cell
    const allParticipants = [user, ...testUsers]
    for (const participant of allParticipants) {
      await prisma.cellParticipation.create({
        data: {
          cellId: cell.id,
          userId: participant.id
        }
      })
    }

    // Add all 5 ideas to the cell
    for (const idea of ideas) {
      await prisma.cellIdea.create({
        data: {
          cellId: cell.id,
          ideaId: idea.id
        }
      })
    }

    return NextResponse.json({
      success: true,
      chantId: delib.id,
      message: 'Created voting chant! Refresh /chants to see it in the Vote tab.'
    })
  } catch (error) {
    console.error('Error creating manual voting chant:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to create chant'
    }, { status: 500 })
  }
}
