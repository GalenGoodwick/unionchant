import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// POST /api/admin/test/seed-tier3 - Create a Tier 3 deliberation with comments near up-pollination
// Body params:
// - additionalUserEmails: string[] - Additional user emails to add to voting cells
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let body: { additionalUserEmails?: string[] } = {}
    try {
      body = await req.json()
    } catch {
      // No body - that's fine
    }
    const additionalUserEmails = body.additionalUserEmails || []

    // Find additional users
    const additionalUsers = await prisma.user.findMany({
      where: { email: { in: additionalUserEmails } },
    })

    const timestamp = Date.now()

    // Create test users for the deliberation (need 125 for tier 3)
    const testUsers: { id: string }[] = []
    for (let i = 1; i <= 130; i++) {
      const testUser = await prisma.user.create({
        data: {
          email: `tier3test-${timestamp}-${i}@test.local`,
          name: `Tier3 Test User ${i}`,
        },
      })
      testUsers.push(testUser)
    }

    // Create the deliberation at Tier 3
    const deliberation = await prisma.deliberation.create({
      data: {
        question: `[TEST] Tier 3 Up-Pollination Test (${timestamp})`,
        description: 'Testing comment up-pollination at Tier 3. Comments need ~75 upvotes (60% of 125) to up-pollinate.',
        phase: 'VOTING',
        currentTier: 3,
        currentTierStartedAt: new Date(),
        isPublic: true,
        creatorId: user.id,
        members: {
          create: { userId: user.id, role: 'CREATOR' },
        },
      },
    })

    // Add all test users as members
    await prisma.deliberationMember.createMany({
      data: testUsers.map(u => ({
        deliberationId: deliberation.id,
        userId: u.id,
      })),
    })

    // Add additional real users as members
    for (const additionalUser of additionalUsers) {
      await prisma.deliberationMember.upsert({
        where: { deliberationId_userId: { deliberationId: deliberation.id, userId: additionalUser.id } },
        update: {},
        create: { deliberationId: deliberation.id, userId: additionalUser.id },
      })
    }

    // Create 4 ideas (Tier 3 = finals with ≤4 ideas)
    const ideas = await Promise.all([
      prisma.idea.create({ data: { deliberationId: deliberation.id, authorId: user.id, text: 'Option Alpha - the first choice', status: 'IN_VOTING', tier: 3 } }),
      prisma.idea.create({ data: { deliberationId: deliberation.id, authorId: testUsers[0].id, text: 'Option Beta - the second choice', status: 'IN_VOTING', tier: 3 } }),
      prisma.idea.create({ data: { deliberationId: deliberation.id, authorId: testUsers[1].id, text: 'Option Gamma - the third choice', status: 'IN_VOTING', tier: 3 } }),
      prisma.idea.create({ data: { deliberationId: deliberation.id, authorId: testUsers[2].id, text: 'Option Delta - the fourth choice', status: 'IN_VOTING', tier: 3 } }),
    ])

    // Create voting cell with real users + test users
    const cell = await prisma.cell.create({
      data: {
        deliberationId: deliberation.id,
        tier: 3,
        status: 'VOTING',
      },
    })

    // Add ideas to cell
    await prisma.cellIdea.createMany({
      data: ideas.map(idea => ({ cellId: cell.id, ideaId: idea.id })),
    })

    // Add real user to cell
    await prisma.cellParticipation.create({
      data: { cellId: cell.id, userId: user.id, status: 'ACTIVE' },
    })

    // Add additional real users to cell
    for (const additionalUser of additionalUsers) {
      await prisma.cellParticipation.create({
        data: { cellId: cell.id, userId: additionalUser.id, status: 'ACTIVE' },
      })
    }

    // Add test users to cell (fill to ~125 participants for Tier 3)
    const testUsersForCell = testUsers.slice(0, 125 - 1 - additionalUsers.length)
    await prisma.cellParticipation.createMany({
      data: testUsersForCell.map(u => ({ cellId: cell.id, userId: u.id, status: 'ACTIVE' })),
    })

    // Create a comment from the admin user
    const comment = await prisma.comment.create({
      data: {
        cellId: cell.id,
        userId: user.id,
        text: 'This comment is close to up-pollinating! It needs just a few more upvotes to reach Tier 2.',
        reachTier: 1,
        upvoteCount: 2, // Already has 2 upvotes, needs 3 total (60% of 5) to up-pollinate
        views: 50,
      },
    })

    // Create upvotes from test users (2 upvotes already)
    await prisma.commentUpvote.createMany({
      data: [
        { commentId: comment.id, userId: testUsers[0].id },
        { commentId: comment.id, userId: testUsers[1].id },
      ],
    })

    // Create a second comment that's already at Tier 2
    const comment2 = await prisma.comment.create({
      data: {
        cellId: cell.id,
        userId: testUsers[3].id,
        text: 'This comment already reached Tier 2! It spread from our small group to a larger audience.',
        reachTier: 2,
        upvoteCount: 15, // Has 15 upvotes (enough for Tier 2)
        views: 200,
      },
    })

    // Cast some votes from test users to show progress
    const votedTestUsers = testUsers.slice(0, 50)
    for (let i = 0; i < votedTestUsers.length; i++) {
      const ideaIndex = i % ideas.length
      await prisma.vote.create({
        data: {
          cellId: cell.id,
          userId: votedTestUsers[i].id,
          ideaId: ideas[ideaIndex].id,
        },
      })
    }
    await prisma.cellParticipation.updateMany({
      where: { userId: { in: votedTestUsers.map(u => u.id) } },
      data: { status: 'VOTED' },
    })

    return NextResponse.json({
      success: true,
      deliberationId: deliberation.id,
      cellId: cell.id,
      commentId: comment.id,
      message: `Created Tier 3 deliberation with ${125} participants. Comment has 2/3 upvotes needed to up-pollinate. Go to /feed to see it.`,
      upPollinationInfo: {
        tier1Threshold: 3, // 60% of 5
        tier2Threshold: 15, // 60% of 25
        tier3Threshold: 75, // 60% of 125
        currentUpvotes: 2,
        votesNeeded: 1,
      },
    })
  } catch (error) {
    console.error('Error creating Tier 3 test:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to create test', details: message }, { status: 500 })
  }
}
