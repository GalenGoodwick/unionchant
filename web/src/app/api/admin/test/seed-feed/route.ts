import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// POST /api/admin/test/seed-feed - Create test deliberations in all phases
// Body params:
// - additionalUserEmails: string[] - Additional user emails to add to voting cells
export async function POST(req: NextRequest) {
  try {
    let user
    let body: { additionalUserEmails?: string[] } = {}
    try {
      body = await req.json()
    } catch {
      // No body or invalid JSON - that's fine
    }
    const additionalUserEmails = body.additionalUserEmails || []

    // In development, allow unauthenticated access and create/use a test user
    if (process.env.NODE_ENV === 'development') {
      // Find or create a dev test user
      user = await prisma.user.upsert({
        where: { email: 'dev-admin@test.local' },
        update: {},
        create: {
          email: 'dev-admin@test.local',
          name: 'Dev Admin',
        },
      })
    } else {
      // Production: require authentication
      const session = await getServerSession(authOptions)

      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      if (!isAdminEmail(session.user.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      user = await prisma.user.findUnique({
        where: { email: session.user.email },
      })

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
    }

    // Find additional users to include in cells
    const additionalUsers = await prisma.user.findMany({
      where: { email: { in: additionalUserEmails } },
    })

    const timestamp = Date.now()
    const results: string[] = []

    // 1. Create SUBMISSION phase deliberation
    const submissionDelib = await prisma.deliberation.create({
      data: {
        question: `[TEST] What's the best programming language? (${timestamp})`,
        description: 'A test deliberation in SUBMISSION phase for feed testing.',
        phase: 'SUBMISSION',
        isPublic: true,
        creatorId: user.id,
        submissionEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        members: {
          create: { userId: user.id, role: 'CREATOR' },
        },
      },
    })
    // Add some ideas
    await prisma.idea.createMany({
      data: [
        { deliberationId: submissionDelib.id, authorId: user.id, text: 'Rust - memory safety without GC', status: 'SUBMITTED' },
        { deliberationId: submissionDelib.id, authorId: user.id, text: 'TypeScript - type safety for JS', status: 'SUBMITTED' },
        { deliberationId: submissionDelib.id, authorId: user.id, text: 'Python - simplicity and readability', status: 'SUBMITTED' },
      ],
    })
    results.push(`Created SUBMISSION deliberation: ${submissionDelib.id}`)

    // 2. Create VOTING phase deliberation with test users
    const votingDelib = await prisma.deliberation.create({
      data: {
        question: `[TEST] Best pizza topping? (${timestamp})`,
        description: 'A test deliberation in VOTING phase for feed testing.',
        phase: 'VOTING',
        currentTier: 1,
        isPublic: true,
        creatorId: user.id,
        members: {
          create: { userId: user.id, role: 'CREATOR' },
        },
      },
    })

    // Create test users for voting
    const testUsers: Awaited<ReturnType<typeof prisma.user.create>>[] = []
    for (let i = 1; i <= 10; i++) {
      const testUser = await prisma.user.create({
        data: {
          email: `feedtest-${timestamp}-${i}@test.local`,
          name: `Feed Test User ${i}`,
        },
      })
      testUsers.push(testUser)
      await prisma.deliberationMember.create({
        data: { deliberationId: votingDelib.id, userId: testUser.id },
      })
    }

    // Create ideas for voting
    const votingIdeas = await Promise.all([
      prisma.idea.create({ data: { deliberationId: votingDelib.id, authorId: user.id, text: 'Pepperoni - the classic choice', status: 'IN_VOTING', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: votingDelib.id, authorId: testUsers[0].id, text: 'Mushrooms - earthy and delicious', status: 'IN_VOTING', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: votingDelib.id, authorId: testUsers[1].id, text: 'Pineapple - controversial but tasty', status: 'IN_VOTING', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: votingDelib.id, authorId: testUsers[2].id, text: 'Olives - salty perfection', status: 'IN_VOTING', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: votingDelib.id, authorId: testUsers[3].id, text: 'Jalapeños - for the spice lovers', status: 'IN_VOTING', tier: 1 } }),
    ])

    // Create voting cells
    const cell1 = await prisma.cell.create({
      data: {
        deliberationId: votingDelib.id,
        tier: 1,
        status: 'VOTING',
        votingStartedAt: new Date(),
        votingDeadline: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    })

    const cell2 = await prisma.cell.create({
      data: {
        deliberationId: votingDelib.id,
        tier: 1,
        status: 'VOTING',
        votingStartedAt: new Date(),
        votingDeadline: new Date(Date.now() + 60 * 60 * 1000),
      },
    })

    // Add ideas to cells
    for (const idea of votingIdeas) {
      await prisma.cellIdea.createMany({
        data: [
          { cellId: cell1.id, ideaId: idea.id },
          { cellId: cell2.id, ideaId: idea.id },
        ],
      })
    }

    // Add participants to cells (including real users in cell1)
    // Add real user first so they can participate and see comments
    await prisma.cellParticipation.create({
      data: { cellId: cell1.id, userId: user.id, status: 'ACTIVE' },
    })
    // Add any additional real users to cell1
    for (const additionalUser of additionalUsers) {
      await prisma.deliberationMember.upsert({
        where: { deliberationId_userId: { deliberationId: votingDelib.id, userId: additionalUser.id } },
        update: {},
        create: { deliberationId: votingDelib.id, userId: additionalUser.id },
      })
      await prisma.cellParticipation.create({
        data: { cellId: cell1.id, userId: additionalUser.id, status: 'ACTIVE' },
      })
    }
    // Fill remaining spots with test users
    const cell1Spots = 5 - 1 - additionalUsers.length // 5 total - admin - additional users
    for (let i = 0; i < Math.max(0, cell1Spots); i++) {
      await prisma.cellParticipation.create({
        data: { cellId: cell1.id, userId: testUsers[i].id, status: 'ACTIVE' },
      })
    }
    // Fill cell2 with remaining test users
    for (let i = cell1Spots; i < Math.min(cell1Spots + 5, testUsers.length); i++) {
      await prisma.cellParticipation.create({
        data: { cellId: cell2.id, userId: testUsers[i].id, status: 'ACTIVE' },
      })
    }

    // Cast some votes to show progress (only from test users, leave real user unvoted)
    await prisma.vote.create({ data: { cellId: cell1.id, userId: testUsers[0].id, ideaId: votingIdeas[0].id } })
    await prisma.vote.create({ data: { cellId: cell1.id, userId: testUsers[1].id, ideaId: votingIdeas[1].id } })
    await prisma.cellParticipation.updateMany({
      where: { userId: { in: [testUsers[0].id, testUsers[1].id] } },
      data: { status: 'VOTED' },
    })

    results.push(`Created VOTING deliberation: ${votingDelib.id}`)

    // 3. Create ACCUMULATING phase deliberation (has champion)
    const accumDelib = await prisma.deliberation.create({
      data: {
        question: `[TEST] Best coffee brewing method? (${timestamp})`,
        description: 'A test deliberation in ACCUMULATING phase for feed testing.',
        phase: 'ACCUMULATING',
        isPublic: true,
        creatorId: user.id,
        accumulationEnabled: true,
        accumulationEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        members: {
          create: { userId: user.id, role: 'CREATOR' },
        },
      },
    })

    // Create champion idea
    const championIdea = await prisma.idea.create({
      data: {
        deliberationId: accumDelib.id,
        authorId: user.id,
        text: 'Pour over - clean and flavorful',
        status: 'WINNER',
        isChampion: true,
        totalVotes: 15,
      },
    })

    await prisma.deliberation.update({
      where: { id: accumDelib.id },
      data: { championId: championIdea.id },
    })

    // Add some challengers waiting
    await prisma.idea.createMany({
      data: [
        { deliberationId: accumDelib.id, authorId: user.id, text: 'French press - bold and rich', status: 'PENDING', isNew: true },
        { deliberationId: accumDelib.id, authorId: user.id, text: 'Espresso - concentrated perfection', status: 'PENDING', isNew: true },
      ],
    })

    results.push(`Created ACCUMULATING deliberation: ${accumDelib.id}`)

    // 4. Create challenge round deliberation
    const challengeDelib = await prisma.deliberation.create({
      data: {
        question: `[TEST] Best text editor? (${timestamp})`,
        description: 'A test deliberation in CHALLENGE round for feed testing.',
        phase: 'VOTING',
        currentTier: 2,
        challengeRound: 1,
        isPublic: true,
        creatorId: user.id,
        members: {
          create: { userId: user.id, role: 'CREATOR' },
        },
      },
    })

    // Create defending champion
    await prisma.idea.create({
      data: {
        deliberationId: challengeDelib.id,
        authorId: user.id,
        text: 'VS Code - extensible and fast',
        status: 'DEFENDING',
        isChampion: true,
        totalVotes: 20,
      },
    })

    // Challengers
    await prisma.idea.createMany({
      data: [
        { deliberationId: challengeDelib.id, authorId: user.id, text: 'Neovim - modal editing power', status: 'IN_VOTING', tier: 2 },
        { deliberationId: challengeDelib.id, authorId: user.id, text: 'Sublime Text - speed demon', status: 'IN_VOTING', tier: 2 },
      ],
    })

    results.push(`Created CHALLENGE deliberation: ${challengeDelib.id}`)

    return NextResponse.json({
      success: true,
      results,
      message: 'Created test deliberations in SUBMISSION, VOTING, ACCUMULATING, and CHALLENGE states',
    })
  } catch (error) {
    console.error('Error seeding feed test data:', error)
    return NextResponse.json({ error: 'Failed to seed test data' }, { status: 500 })
  }
}
