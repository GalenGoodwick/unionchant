import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminVerified } from '@/lib/admin'

// POST /api/admin/test/seed-discord-tier2
// Creates a Tier 2 FCFS chant with 1 vote remaining.
// Load it into Discord with /chant load, then /vote to trigger tier 3 creation.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminVerified(req)
    if (!auth.authorized) return auth.response

    const user = await prisma.user.findUnique({
      where: { email: auth.email },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const timestamp = Date.now()

    // Create 9 test users for tier 2 cells
    const testUsers: { id: string }[] = []
    for (let i = 1; i <= 9; i++) {
      const testUser = await prisma.user.create({
        data: {
          email: `dtest-${timestamp}-${i}@test.local`,
          name: `Discord Test ${i}`,
        },
      })
      testUsers.push(testUser)
    }

    // Create deliberation at tier 2 (public, loadable via invite code)
    const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    const deliberation = await prisma.deliberation.create({
      data: {
        question: `[TEST] Discord Tier 2 → 3 Test (${timestamp})`,
        description: 'Vote via /vote on Discord to trigger tier 3 creation.',
        phase: 'VOTING',
        currentTier: 2,
        currentTierStartedAt: new Date(),
        isPublic: true,
        allocationMode: 'fcfs',
        inviteCode,
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

    // Create 6 tier 2 ideas (as if they advanced from tier 1)
    const ideaTexts = [
      'Build community gardens in every neighborhood',
      'Create a free public transit system',
      'Launch mentorship programs for youth',
      'Establish universal basic services',
      'Fund renewable energy cooperatives',
      'Design walkable mixed-use districts',
    ]

    const ideas = await Promise.all(
      ideaTexts.map((text, i) =>
        prisma.idea.create({
          data: {
            deliberationId: deliberation.id,
            authorId: testUsers[i].id,
            text,
            status: 'IN_VOTING',
            tier: 2,
          },
        })
      )
    )

    // --- Tier 2 Cell 1: COMPLETED (ideas 0,1,2) ---
    const cell1 = await prisma.cell.create({
      data: {
        deliberationId: deliberation.id,
        tier: 2,
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - 60000),
        ideas: {
          create: [
            { ideaId: ideas[0].id },
            { ideaId: ideas[1].id },
            { ideaId: ideas[2].id },
          ],
        },
      },
    })

    // 5 voters for cell 1
    const cell1Voters = testUsers.slice(0, 5)
    await prisma.cellParticipation.createMany({
      data: cell1Voters.map(u => ({
        cellId: cell1.id,
        userId: u.id,
        status: 'VOTED' as const,
        votedAt: new Date(Date.now() - 60000),
      })),
    })

    // Votes for cell 1: idea 0 wins with most XP
    for (const voter of cell1Voters) {
      const voteId = `vt${Date.now()}${Math.random().toString(36).slice(2, 8)}`
      await prisma.$executeRaw`
        INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
        VALUES (${voteId}, ${cell1.id}, ${voter.id}, ${ideas[0].id}, ${7}, ${new Date(Date.now() - 60000)})
      `
      const voteId2 = `vt${Date.now()}${Math.random().toString(36).slice(2, 9)}`
      await prisma.$executeRaw`
        INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
        VALUES (${voteId2}, ${cell1.id}, ${voter.id}, ${ideas[1].id}, ${2}, ${new Date(Date.now() - 60000)})
      `
      const voteId3 = `vt${Date.now()}${Math.random().toString(36).slice(2, 10)}`
      await prisma.$executeRaw`
        INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
        VALUES (${voteId3}, ${cell1.id}, ${voter.id}, ${ideas[2].id}, ${1}, ${new Date(Date.now() - 60000)})
      `
    }

    // idea 0 is the winner of cell 1 → ADVANCING
    await prisma.idea.update({
      where: { id: ideas[0].id },
      data: { status: 'ADVANCING', totalVotes: 5, totalXP: 35 },
    })
    // ideas 1,2 are eliminated
    await prisma.idea.updateMany({
      where: { id: { in: [ideas[1].id, ideas[2].id] } },
      data: { status: 'ELIMINATED', losses: 1 },
    })
    await prisma.idea.update({ where: { id: ideas[1].id }, data: { totalVotes: 5, totalXP: 10 } })
    await prisma.idea.update({ where: { id: ideas[2].id }, data: { totalVotes: 5, totalXP: 5 } })

    // --- Tier 2 Cell 2: VOTING (ideas 3,4,5) — 4 voters done, 1 remaining ---
    const cell2 = await prisma.cell.create({
      data: {
        deliberationId: deliberation.id,
        tier: 2,
        status: 'VOTING',
        ideas: {
          create: [
            { ideaId: ideas[3].id },
            { ideaId: ideas[4].id },
            { ideaId: ideas[5].id },
          ],
        },
      },
    })

    // 4 voters for cell 2 (admin will be the 5th)
    const cell2Voters = testUsers.slice(5, 9)
    await prisma.cellParticipation.createMany({
      data: cell2Voters.map(u => ({
        cellId: cell2.id,
        userId: u.id,
        status: 'VOTED' as const,
        votedAt: new Date(),
      })),
    })

    // Votes for cell 2: spread across ideas so any can win
    for (const voter of cell2Voters) {
      const voteId = `vt${Date.now()}${Math.random().toString(36).slice(2, 8)}`
      await prisma.$executeRaw`
        INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
        VALUES (${voteId}, ${cell2.id}, ${voter.id}, ${ideas[3].id}, ${4}, ${new Date()})
      `
      const voteId2 = `vt${Date.now()}${Math.random().toString(36).slice(2, 9)}`
      await prisma.$executeRaw`
        INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
        VALUES (${voteId2}, ${cell2.id}, ${voter.id}, ${ideas[4].id}, ${3}, ${new Date()})
      `
      const voteId3 = `vt${Date.now()}${Math.random().toString(36).slice(2, 10)}`
      await prisma.$executeRaw`
        INSERT INTO "Vote" (id, "cellId", "userId", "ideaId", "xpPoints", "votedAt")
        VALUES (${voteId3}, ${cell2.id}, ${voter.id}, ${ideas[5].id}, ${3}, ${new Date()})
      `
    }

    // Update idea tallies for cell 2 ideas
    await prisma.idea.update({ where: { id: ideas[3].id }, data: { totalVotes: 4, totalXP: 16 } })
    await prisma.idea.update({ where: { id: ideas[4].id }, data: { totalVotes: 4, totalXP: 12 } })
    await prisma.idea.update({ where: { id: ideas[5].id }, data: { totalVotes: 4, totalXP: 12 } })

    return NextResponse.json({
      success: true,
      deliberationId: deliberation.id,
      inviteCode,
      cell1Id: cell1.id,
      cell2Id: cell2.id,
      message: `Created tier 2 FCFS chant with 1 vote remaining. Load into Discord with /chant load code:${inviteCode}, then /vote to trigger tier 3.`,
      ideas: {
        cell1: ideaTexts.slice(0, 3).map((t, i) => ({ text: t, status: i === 0 ? 'ADVANCING' : 'ELIMINATED' })),
        cell2: ideaTexts.slice(3).map(t => ({ text: t, status: 'IN_VOTING (your vote decides)' })),
      },
      url: `https://unitychant.com/chants/${deliberation.id}`,
    })
  } catch (error) {
    console.error('Error seeding discord tier 2:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to seed', details: message }, { status: 500 })
  }
}
