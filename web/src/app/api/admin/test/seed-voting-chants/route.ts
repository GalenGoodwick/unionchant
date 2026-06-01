import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startVotingPhase } from '@/lib/voting'

// POST /api/admin/test/seed-voting-chants
// Create test chants already in voting state
export async function POST(req: NextRequest) {
  // Block in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check admin via environment variable
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []
  if (!adminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  // Get user ID
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  try {
    const { count = 3 } = await req.json().catch(() => ({}))

    const created: any[] = []

    for (let i = 0; i < count; i++) {
      // Create deliberation
      const delib = await prisma.deliberation.create({
        data: {
          question: `Test Voting Chant ${i + 1}: What is the best approach?`,
          description: 'This is a test chant already in voting state',
          phase: 'SUBMISSION',
          isPublic: true,
          creatorId: user.id,
          allocationMode: 'balanced',
          continuousFlow: false,
          allowAI: false,
        },
      })

      // Add creator as participant (not CREATOR role, so they get assigned to cells)
      await prisma.deliberationMember.create({
        data: {
          deliberationId: delib.id,
          userId: user.id,
          role: 'PARTICIPANT',
        },
      })

      // Create test users (10 more participants)
      const testUsers: any[] = []
      for (let j = 0; j < 10; j++) {
        const testUser = await prisma.user.upsert({
          where: { email: `test-voter-${i}-${j}@test.com` },
          create: {
            email: `test-voter-${i}-${j}@test.com`,
            name: `Test Voter ${j + 1}`,
            emailVerified: new Date(),
            status: 'ACTIVE',
          },
          update: {},
        })
        testUsers.push(testUser)

        // Add as member
        await prisma.deliberationMember.create({
          data: {
            deliberationId: delib.id,
            userId: testUser.id,
            role: 'PARTICIPANT',
          },
        })
      }

      // Submit 10 ideas (2 per user for first 5 users)
      const ideas: any[] = []
      for (let j = 0; j < 10; j++) {
        const authorId = testUsers[j % 5].id
        const idea = await prisma.idea.create({
          data: {
            text: `Test idea ${j + 1} for voting: This is a sample answer to test the voting interface.`,
            status: 'SUBMITTED',
            deliberation: { connect: { id: delib.id } },
            author: { connect: { id: authorId } },
          },
        })
        ideas.push(idea)
      }

      // Start voting phase (creates cells)
      const result = await startVotingPhase(delib.id)

      created.push({
        id: delib.id,
        question: delib.question,
        phase: 'VOTING',
        ideas: ideas.length,
        participants: testUsers.length + 1, // +1 for admin user
        result,
      })
    }

    return NextResponse.json({
      success: true,
      message: `Created ${created.length} test chants in voting state`,
      chants: created,
    })
  } catch (error) {
    console.error('Error creating voting chants:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to create test chants',
    }, { status: 500 })
  }
}
