import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// POST /api/admin/test/seed-viral-spread
// Creates a deliberation at tier 1 with ~6 cells sharing overlapping ideas.
// Populates comments with varying upvote/spread levels so you can open any
// cell and see "Top comment" badges, viral purple comments from other cells,
// and the discussion section with local + up-pollinated comments.
export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const ts = Date.now()

    // Create 30 test users
    const testUsers: { id: string; name: string }[] = []
    for (let i = 0; i < 30; i++) {
      const u = await prisma.user.create({
        data: {
          email: `viral-${ts}-${i}@test.local`,
          name: `Voter ${i + 1}`,
        },
      })
      testUsers.push({ id: u.id, name: u.name || `Voter ${i + 1}` })
    }

    // Create deliberation
    const deliberation = await prisma.deliberation.create({
      data: {
        question: `[TEST] Viral Spread Demo (${ts})`,
        description: 'Demo showing viral same-tier comment spread between cells sharing ideas.',
        phase: 'VOTING',
        currentTier: 1,
        currentTierStartedAt: new Date(),
        isPublic: true,
        creatorId: user.id,
        members: {
          create: [
            { userId: user.id, role: 'CREATOR' },
            ...testUsers.map(u => ({ userId: u.id })),
          ],
        },
      },
    })

    // Create 10 ideas — cells will share subsets
    const ideaTexts = [
      'Fund public transit expansion in every city over 100k',
      'Universal pre-K for all 3- and 4-year-olds',
      'Convert abandoned malls into mixed-use community centers',
      'National right-to-repair law for all electronics',
      'Four-day work week pilot for government employees',
      'Free community college for trades and certifications',
      'Ban non-compete clauses for workers under $100k salary',
      'Municipal broadband as a public utility',
      'Paid family leave — 12 weeks minimum',
      'Carbon tax with dividend returned to citizens',
    ]
    const ideas: { id: string }[] = []
    for (const text of ideaTexts) {
      const idea = await prisma.idea.create({
        data: {
          deliberationId: deliberation.id,
          authorId: testUsers[Math.floor(Math.random() * testUsers.length)].id,
          text,
          status: 'IN_VOTING',
          tier: 1,
        },
      })
      ideas.push(idea)
    }

    // Create 6 cells with overlapping idea sets (5 ideas each)
    // Cell layout — ideas overlap so comments can spread between cells
    const cellIdeaIndexes = [
      [0, 1, 2, 3, 4],  // cell 0: ideas 0-4
      [0, 1, 2, 5, 6],  // cell 1: shares 0,1,2 with cell 0
      [2, 3, 4, 7, 8],  // cell 2: shares 2,3,4 with cell 0
      [0, 5, 6, 7, 9],  // cell 3: shares 0 with cell 0, 5,6 with cell 1, 7 with cell 2
      [1, 3, 8, 9, 5],  // cell 4: shares 1,3 with cell 0, 8 with cell 2
      [4, 6, 7, 8, 9],  // cell 5: shares 4 with cell 0, various others
    ]

    const cells: { id: string; ideaIds: string[] }[] = []
    for (let c = 0; c < 6; c++) {
      const cellIdeas = cellIdeaIndexes[c].map(i => ideas[i])
      // 5 users per cell
      const cellUserStart = c * 5
      const cellUsers = testUsers.slice(cellUserStart, cellUserStart + 5)

      const cell = await prisma.cell.create({
        data: {
          deliberationId: deliberation.id,
          tier: 1,
          batch: c,
          status: 'VOTING',
          ideas: { create: cellIdeas.map(idea => ({ ideaId: idea.id })) },
          participants: {
            create: [
              // Add admin to cell 0
              ...(c === 0 ? [{ userId: user.id, status: 'ACTIVE' as const }] : []),
              ...cellUsers.map(u => ({ userId: u.id, status: 'ACTIVE' as const })),
            ],
          },
        },
      })
      cells.push({ id: cell.id, ideaIds: cellIdeas.map(i => i.id) })
    }

    // Now add comments with varying viral spread levels
    const commentScenarios = [
      // Cell 1: hot comment on idea 0 (shared with cells 0, 3) — high spread
      { cellIdx: 1, ideaIdx: 0, text: 'Public transit is the backbone of equitable cities. This should be priority #1.', upvotes: 4, spread: 2 },
      // Cell 1: medium comment on idea 1 (shared with cells 0, 4)
      { cellIdx: 1, ideaIdx: 1, text: 'Pre-K has the highest ROI of any education investment according to the Heckman curve.', upvotes: 2, spread: 1 },
      // Cell 2: hot comment on idea 2 (shared with cells 0, 1)
      { cellIdx: 2, ideaIdx: 2, text: 'My city already converted a dead mall into a library + clinic + coworking space. It works.', upvotes: 4, spread: 2 },
      // Cell 2: comment on idea 3 (shared with cells 0, 4)
      { cellIdx: 2, ideaIdx: 3, text: 'Right to repair saves consumers billions. Apple lobbied against it for years.', upvotes: 3, spread: 1 },
      // Cell 3: comment on idea 0 (shared with cells 0, 1) — competing with cell 1's comment
      { cellIdx: 3, ideaIdx: 0, text: 'Transit only works if it runs frequently. Frequency > coverage.', upvotes: 2, spread: 1 },
      // Cell 4: comment on idea 3 (shared with cells 0, 2)
      { cellIdx: 4, ideaIdx: 3, text: 'Non-competes are already banned in California and it created Silicon Valley. Proof enough.', upvotes: 4, spread: 2 },
      // Cell 5: comment on idea 4 (shared with cell 0)
      { cellIdx: 5, ideaIdx: 4, text: 'My company tried the 4-day week. Productivity went UP. People are sharper when rested.', upvotes: 3, spread: 1 },
      // Cell 0: local comments (from admin's cell)
      { cellIdx: 0, ideaIdx: 0, text: 'Transit expansion is great but who pays for maintenance long-term?', upvotes: 1, spread: 0 },
      { cellIdx: 0, ideaIdx: 2, text: 'Community centers need programming staff, not just a building.', upvotes: 0, spread: 0 },
      // Cell 1: unlinked comment — should NOT spread
      { cellIdx: 1, ideaIdx: null, text: 'Anyone else think this voting system is cool?', upvotes: 3, spread: 0 },
      // Cell 3: mega-viral comment on idea 7 (shared with cells 2, 5)
      { cellIdx: 3, ideaIdx: 7, text: 'Municipal broadband in Chattanooga charges $70/mo for gigabit. Comcast charges $120 for 200mbps in the next town.', upvotes: 5, spread: 2 },
      // Cell 4: comment on idea 9 (shared with cells 3, 5)
      { cellIdx: 4, ideaIdx: 9, text: 'Canada already has this carbon dividend. Citizens get quarterly checks. Popular across party lines.', upvotes: 4, spread: 2 },
    ]

    for (const scenario of commentScenarios) {
      const cell = cells[scenario.cellIdx]
      const ideaId = scenario.ideaIdx !== null ? ideas[scenario.ideaIdx].id : null

      // Pick a user from this cell's participants
      const userIdx = scenario.cellIdx * 5
      const commentUser = testUsers[userIdx] || testUsers[0]

      const comment = await prisma.comment.create({
        data: {
          cellId: cell.id,
          userId: commentUser.id,
          ideaId,
          text: scenario.text,
          reachTier: 1,
          upvoteCount: scenario.upvotes,
          spreadCount: scenario.spread,
        },
      })

      // Create actual upvote records
      for (let u = 0; u < scenario.upvotes; u++) {
        const upvoter = testUsers[(userIdx + 1 + u) % testUsers.length]
        await prisma.commentUpvote.create({
          data: { commentId: comment.id, userId: upvoter.id },
        }).catch(() => {}) // ignore dupes
      }
    }

    return NextResponse.json({
      success: true,
      deliberationId: deliberation.id,
      yourCellId: cells[0].id,
      message: `Created viral spread demo: 6 cells, 10 ideas, ${commentScenarios.length} comments. You're in cell 0. Open the talk to see viral comments from other cells.`,
      cells: cells.map((c, i) => ({
        index: i,
        id: c.id,
        ideas: cellIdeaIndexes[i].map(idx => ideaTexts[idx].slice(0, 40)),
      })),
    })
  } catch (error) {
    console.error('Error creating viral spread demo:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to create demo', details: message }, { status: 500 })
  }
}
