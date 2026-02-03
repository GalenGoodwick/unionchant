import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// POST /api/admin/test/seed-feed - Create test deliberations in ALL phases/states
// Produces every card type: vote_now, deliberate, challenge, submit, join,
// champion, completed, waiting, advanced, podiums_summary
// Also seeds activity notifications and completed results
export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 })
    }

    let user
    let body: { additionalUserEmails?: string[]; userEmail?: string } = {}
    try {
      body = await req.json()
    } catch {}
    const additionalUserEmails = body.additionalUserEmails || []

    // Use explicit userEmail from body (passed by admin page from client session)
    if (body.userEmail) {
      user = await prisma.user.findUnique({ where: { email: body.userEmail } })
    }

    // Fallback: try server session
    if (!user) {
      const session = await getServerSession(authOptions)
      if (session?.user?.email) {
        user = await prisma.user.findUnique({ where: { email: session.user.email } })
      }
    }

    // Last resort in dev: create test user
    if (!user && process.env.NODE_ENV === 'development') {
      user = await prisma.user.upsert({
        where: { email: 'dev-admin@test.local' },
        update: {},
        create: { email: 'dev-admin@test.local', name: 'Dev Admin' },
      })
    }

    if (!user) return NextResponse.json({ error: 'Unauthorized - sign in first' }, { status: 401 })

    const additionalUsers = await prisma.user.findMany({
      where: { email: { in: additionalUserEmails } },
    })

    const ts = Date.now()
    const results: string[] = []

    // ── Helper: create N test users with realistic names ────────
    const NAMES = [
      'Maya Chen', 'Liam Okonkwo', 'Sofia Reyes', 'Jamal Thompson',
      'Priya Patel', 'Aiden Novak', 'Fatima Al-Rashid', 'Marcus Kim',
      'Elena Volkov', 'Dante Morales', 'Naomi Sato', 'Elijah Brooks',
      'Zara Hussein', 'Owen Mitchell', 'Amira Diop', 'Leo Fernandez',
      'Ava Johansson', 'Kai Nakamura', 'Isla Campbell', 'Rohan Mehta',
    ]
    let nameIdx = 0
    async function makeTestUsers(count: number, prefix: string) {
      const users: { id: string; name: string }[] = []
      for (let i = 1; i <= count; i++) {
        const name = NAMES[nameIdx % NAMES.length]
        nameIdx++
        const u = await prisma.user.create({
          data: {
            email: `${prefix}-${ts}-${i}@test.local`,
            name,
            image: null,
          },
        })
        users.push({ id: u.id, name: u.name || name })
      }
      return users
    }

    // ────────────────────────────────────────────────────────────
    // 1. VOTE NOW card — VOTING phase, user in cell, hasn't voted
    // ────────────────────────────────────────────────────────────
    const voteTestUsers = await makeTestUsers(9, 'voter')

    const voteDelib = await prisma.deliberation.create({
      data: {
        question: `How should we fund the new community center?`,
        description: 'The city council approved the land. Now we need to decide how to pay for it.',
        phase: 'VOTING',
        currentTier: 2,
        isPublic: true,
        creatorId: user.id,
        votingTimeoutMs: 3600000,
        currentTierStartedAt: new Date(),
        members: { create: [
          { userId: user.id, role: 'CREATOR' },
          ...voteTestUsers.map((u) => ({ userId: u.id })),
        ] },
      },
    })

    const voteIdeas = await Promise.all([
      prisma.idea.create({ data: { deliberationId: voteDelib.id, authorId: voteTestUsers[0].id, text: 'Grassroots fundraising with matching grants from local businesses', status: 'IN_VOTING', tier: 2 } }),
      prisma.idea.create({ data: { deliberationId: voteDelib.id, authorId: voteTestUsers[1].id, text: 'Municipal bond issue with 10-year repayment plan', status: 'IN_VOTING', tier: 2 } }),
      prisma.idea.create({ data: { deliberationId: voteDelib.id, authorId: voteTestUsers[3].id, text: 'Public-private partnership with naming rights revenue', status: 'IN_VOTING', tier: 2 } }),
      prisma.idea.create({ data: { deliberationId: voteDelib.id, authorId: voteTestUsers[5].id, text: 'Crowdfunding campaign with tiered donor recognition', status: 'IN_VOTING', tier: 2 } }),
      prisma.idea.create({ data: { deliberationId: voteDelib.id, authorId: user.id, text: 'Community investment pool with rotating resident leadership', status: 'IN_VOTING', tier: 2 } }),
    ])

    // Extra ideas that already lost in Tier 1
    await prisma.idea.createMany({
      data: [
        { deliberationId: voteDelib.id, authorId: voteTestUsers[2].id, text: 'Federal infrastructure grant application', status: 'ELIMINATED' as const, tier: 1 },
        { deliberationId: voteDelib.id, authorId: voteTestUsers[4].id, text: 'Property tax surcharge for 5 years', status: 'ELIMINATED' as const, tier: 1 },
        { deliberationId: voteDelib.id, authorId: voteTestUsers[6].id, text: 'Lottery system with dedicated proceeds', status: 'ELIMINATED' as const, tier: 1 },
      ],
    })

    const voteCell = await prisma.cell.create({
      data: {
        deliberationId: voteDelib.id, tier: 2, status: 'VOTING',
        votingStartedAt: new Date(),
        votingDeadline: new Date(Date.now() + 47 * 60_000),
      },
    })

    for (const idea of voteIdeas) {
      await prisma.cellIdea.create({ data: { cellId: voteCell.id, ideaId: idea.id } })
    }

    await prisma.cellParticipation.create({ data: { cellId: voteCell.id, userId: user.id, status: 'ACTIVE' } })
    for (const u of voteTestUsers.slice(0, 4)) {
      await prisma.cellParticipation.create({ data: { cellId: voteCell.id, userId: u.id, status: 'ACTIVE' } })
    }

    // 2 test users already voted
    await prisma.vote.create({ data: { cellId: voteCell.id, userId: voteTestUsers[0].id, ideaId: voteIdeas[0].id } })
    await prisma.vote.create({ data: { cellId: voteCell.id, userId: voteTestUsers[1].id, ideaId: voteIdeas[1].id } })
    await prisma.cellParticipation.updateMany({
      where: { cellId: voteCell.id, userId: { in: [voteTestUsers[0].id, voteTestUsers[1].id] } },
      data: { status: 'VOTED', votedAt: new Date() },
    })

    results.push(`VOTE NOW: ${voteDelib.id}`)

    // ────────────────────────────────────────────────────────────
    // 2. DELIBERATE card — VOTING phase, cell DELIBERATING
    // ────────────────────────────────────────────────────────────
    const discTestUsers = await makeTestUsers(7, 'disc')

    const discDelib = await prisma.deliberation.create({
      data: {
        question: 'What should our parental leave policy look like?',
        description: 'Current policy is 6 weeks. Several employees have raised concerns. Let\'s decide together.',
        phase: 'VOTING',
        currentTier: 1,
        isPublic: true,
        creatorId: user.id,
        votingTimeoutMs: 7200000,
        discussionDurationMs: 7200000,
        currentTierStartedAt: new Date(),
        members: { create: [
          { userId: user.id, role: 'CREATOR' },
          ...discTestUsers.map((u) => ({ userId: u.id })),
        ] },
      },
    })

    const discIdeas = await Promise.all([
      prisma.idea.create({ data: { deliberationId: discDelib.id, authorId: discTestUsers[0].id, text: '16 weeks paid for all parents, regardless of gender', status: 'IN_VOTING', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: discDelib.id, authorId: discTestUsers[1].id, text: '12 weeks paid + 4 weeks flexible part-time transition', status: 'IN_VOTING', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: discDelib.id, authorId: discTestUsers[2].id, text: '6 months at 80% salary with gradual return option', status: 'IN_VOTING', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: discDelib.id, authorId: discTestUsers[4].id, text: 'Match the national average plus 2 weeks extra', status: 'IN_VOTING', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: discDelib.id, authorId: user.id, text: 'Flexible bank of 20 weeks to use within first year', status: 'IN_VOTING', tier: 1 } }),
    ])

    const discCell = await prisma.cell.create({
      data: {
        deliberationId: discDelib.id, tier: 1, status: 'DELIBERATING',
        discussionEndsAt: new Date(Date.now() + 105 * 60 * 1000), // 1h 45m from now
      },
    })

    for (const idea of discIdeas) {
      await prisma.cellIdea.create({ data: { cellId: discCell.id, ideaId: idea.id } })
    }

    await prisma.cellParticipation.create({ data: { cellId: discCell.id, userId: user.id, status: 'ACTIVE' } })
    for (const u of discTestUsers.slice(0, 4)) {
      await prisma.cellParticipation.create({ data: { cellId: discCell.id, userId: u.id, status: 'ACTIVE' } })
    }

    // Multiple comments for realistic discussion
    await prisma.comment.create({
      data: { cellId: discCell.id, userId: discTestUsers[0].id, text: 'The 6-month option sounds great but I worry about budget impact on a small team.', createdAt: new Date(Date.now() - 20 * 60_000) },
    })
    await prisma.comment.create({
      data: { cellId: discCell.id, userId: discTestUsers[2].id, text: 'I like the flexible bank idea — lets each family decide what works for them.', createdAt: new Date(Date.now() - 8 * 60_000) },
    })
    await prisma.comment.create({
      data: { cellId: discCell.id, userId: discTestUsers[1].id, text: 'Option 2 with the part-time transition is a good compromise. Eases the return.', createdAt: new Date(Date.now() - 2 * 60_000) },
    })

    results.push(`DELIBERATE: ${discDelib.id}`)

    // ────────────────────────────────────────────────────────────
    // 3. CHALLENGE card — VOTING phase, challengeRound > 0
    // ────────────────────────────────────────────────────────────
    const challTestUsers = await makeTestUsers(12, 'chall')

    const challDelib = await prisma.deliberation.create({
      data: {
        question: 'What should be our annual team retreat?',
        description: 'The mountain cabin won Round 1 but new ideas have been submitted. Time to decide again.',
        phase: 'VOTING',
        currentTier: 2,
        challengeRound: 2,
        isPublic: true,
        creatorId: user.id,
        votingTimeoutMs: 7200000,
        currentTierStartedAt: new Date(),
        accumulationEnabled: true,
        members: { create: [
          { userId: user.id, role: 'CREATOR' },
          ...challTestUsers.map((u) => ({ userId: u.id })),
        ] },
      },
    })

    const defendingIdea = await prisma.idea.create({
      data: { deliberationId: challDelib.id, authorId: challTestUsers[0].id, text: 'Mountain cabin with team building activities and hiking', status: 'DEFENDING', isChampion: true, totalVotes: 24 },
    })
    await prisma.deliberation.update({ where: { id: challDelib.id }, data: { championId: defendingIdea.id } })

    const challIdeas = await Promise.all([
      prisma.idea.create({ data: { deliberationId: challDelib.id, authorId: challTestUsers[1].id, text: 'Beachside resort with morning workshops and afternoon free time', status: 'IN_VOTING', tier: 2 } }),
      prisma.idea.create({ data: { deliberationId: challDelib.id, authorId: challTestUsers[3].id, text: 'City cultural tour — museums, food, and a hackathon', status: 'IN_VOTING', tier: 2 } }),
      prisma.idea.create({ data: { deliberationId: challDelib.id, authorId: challTestUsers[5].id, text: 'National park camping with outdoor skill workshops', status: 'IN_VOTING', tier: 2 } }),
      prisma.idea.create({ data: { deliberationId: challDelib.id, authorId: user.id, text: 'Coworking trip to a different city each year', status: 'IN_VOTING', tier: 2 } }),
    ])

    // Ideas eliminated in previous rounds
    await prisma.idea.createMany({
      data: [
        { deliberationId: challDelib.id, authorId: challTestUsers[7].id, text: 'Cruise ship conference', status: 'ELIMINATED' as const, tier: 1 },
        { deliberationId: challDelib.id, authorId: challTestUsers[8].id, text: 'Stay local, fancy hotel downtown', status: 'RETIRED' as const, tier: 1, losses: 2 },
      ],
    })

    const challCell = await prisma.cell.create({
      data: {
        deliberationId: challDelib.id, tier: 2, status: 'VOTING',
        votingStartedAt: new Date(),
        votingDeadline: new Date(Date.now() + 2 * 60 * 60_000),
      },
    })

    for (const idea of [defendingIdea, ...challIdeas]) {
      await prisma.cellIdea.create({ data: { cellId: challCell.id, ideaId: idea.id } })
    }

    await prisma.cellParticipation.create({ data: { cellId: challCell.id, userId: user.id, status: 'ACTIVE' } })
    for (const u of challTestUsers.slice(0, 4)) {
      await prisma.cellParticipation.create({ data: { cellId: challCell.id, userId: u.id, status: 'ACTIVE' } })
    }

    results.push(`CHALLENGE (Round 3): ${challDelib.id}`)

    // ────────────────────────────────────────────────────────────
    // 4. SUBMIT card — SUBMISSION phase, user is member
    // ────────────────────────────────────────────────────────────
    const submitTestUsers = await makeTestUsers(6, 'submit')

    const submitDelib = await prisma.deliberation.create({
      data: {
        question: 'How should we redesign the onboarding experience?',
        description: 'New users drop off after signup. We need ideas to improve the first 5 minutes.',
        phase: 'SUBMISSION',
        isPublic: true,
        creatorId: user.id,
        submissionEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60_000),
        members: { create: [
          { userId: user.id, role: 'CREATOR' },
          ...submitTestUsers.map((u) => ({ userId: u.id })),
        ] },
      },
    })

    await prisma.idea.createMany({
      data: [
        { deliberationId: submitDelib.id, authorId: submitTestUsers[0].id, text: 'Interactive tutorial that walks through core features', status: 'PENDING' as const },
        { deliberationId: submitDelib.id, authorId: submitTestUsers[1].id, text: 'Skip onboarding option — let power users dive in', status: 'PENDING' as const },
        { deliberationId: submitDelib.id, authorId: submitTestUsers[2].id, text: 'Gamified checklist with progress bar', status: 'PENDING' as const },
        { deliberationId: submitDelib.id, authorId: submitTestUsers[3].id, text: 'Video walkthrough from a real team member', status: 'PENDING' as const },
        { deliberationId: submitDelib.id, authorId: submitTestUsers[4].id, text: 'Personalized onboarding based on role selection', status: 'PENDING' as const },
        { deliberationId: submitDelib.id, authorId: user.id, text: 'Buddy system — pair new users with experienced ones', status: 'PENDING' as const },
        { deliberationId: submitDelib.id, authorId: submitTestUsers[5].id, text: 'Empty state prompts that teach by doing', status: 'PENDING' as const },
      ],
    })

    results.push(`SUBMIT: ${submitDelib.id}`)

    // ────────────────────────────────────────────────────────────
    // 6. CHAMPION / ACCUMULATING card
    // ────────────────────────────────────────────────────────────
    const accumTestUsers = await makeTestUsers(8, 'accum')

    const accumDelib = await prisma.deliberation.create({
      data: {
        question: 'What should our remote work policy be?',
        description: 'After 3 rounds of voting, "Hybrid 3/2" is the current priority. Submit challengers or let it stand.',
        phase: 'ACCUMULATING',
        currentTier: 3,
        isPublic: true,
        creatorId: user.id,
        accumulationEnabled: true,
        accumulationEndsAt: new Date(Date.now() + 18 * 60 * 60_000),
        members: { create: [
          { userId: user.id, role: 'CREATOR' },
          ...accumTestUsers.map((u) => ({ userId: u.id })),
        ] },
      },
    })

    const accumChampion = await prisma.idea.create({
      data: {
        deliberationId: accumDelib.id, authorId: accumTestUsers[0].id,
        text: 'Hybrid model \u2014 3 days office, 2 days remote with flexible scheduling',
        status: 'WINNER', isChampion: true, totalVotes: 42,
      },
    })
    await prisma.deliberation.update({ where: { id: accumDelib.id }, data: { championId: accumChampion.id } })

    await prisma.idea.createMany({
      data: [
        { deliberationId: accumDelib.id, authorId: accumTestUsers[2].id, text: 'Full remote with quarterly in-person retreats', status: 'PENDING' as const, isNew: true },
        { deliberationId: accumDelib.id, authorId: accumTestUsers[4].id, text: 'Office-first with remote Fridays and summer hours', status: 'PENDING' as const, isNew: true },
        { deliberationId: accumDelib.id, authorId: accumTestUsers[5].id, text: 'Flexible hours — any location, core overlap 11am-3pm', status: 'PENDING' as const, isNew: true },
        { deliberationId: accumDelib.id, authorId: accumTestUsers[6].id, text: 'Team-by-team decision with minimum 1 office day', status: 'PENDING' as const, isNew: true },
      ],
    })

    // Ideas from previous rounds
    await prisma.idea.createMany({
      data: [
        { deliberationId: accumDelib.id, authorId: accumTestUsers[1].id, text: 'Mandatory 5 days in office', status: 'ELIMINATED' as const, tier: 1 },
        { deliberationId: accumDelib.id, authorId: accumTestUsers[3].id, text: '4-day work week, all remote', status: 'ELIMINATED' as const, tier: 2 },
      ],
    })

    results.push(`CHAMPION/ACCUMULATING: ${accumDelib.id}`)

    // ────────────────────────────────────────────────────────────
    // 7. WAITING card — user voted, cell still voting
    // ────────────────────────────────────────────────────────────
    const waitTestUsers = await makeTestUsers(4, 'wait')

    const waitDelib = await prisma.deliberation.create({
      data: {
        question: 'What climate action should our city prioritize?',
        description: 'The mayor wants community input before the next council session.',
        phase: 'VOTING',
        currentTier: 1,
        isPublic: true,
        creatorId: user.id,
        votingTimeoutMs: 7200000,
        currentTierStartedAt: new Date(),
        members: { create: [
          { userId: user.id, role: 'CREATOR' },
          ...waitTestUsers.map((u) => ({ userId: u.id })),
        ] },
      },
    })

    const waitIdeas = await Promise.all([
      prisma.idea.create({ data: { deliberationId: waitDelib.id, authorId: waitTestUsers[0].id, text: 'Revenue-neutral carbon tax with quarterly rebates to residents', status: 'IN_VOTING', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: waitDelib.id, authorId: waitTestUsers[1].id, text: 'Free public transit funded by congestion pricing downtown', status: 'IN_VOTING', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: waitDelib.id, authorId: waitTestUsers[2].id, text: 'Urban tree canopy project — 10,000 new trees in 3 years', status: 'IN_VOTING', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: waitDelib.id, authorId: waitTestUsers[3].id, text: 'Green building standards for all new construction', status: 'IN_VOTING', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: waitDelib.id, authorId: user.id, text: 'Community solar co-ops with low-income priority access', status: 'IN_VOTING', tier: 1 } }),
    ])

    const waitCell = await prisma.cell.create({
      data: {
        deliberationId: waitDelib.id, tier: 1, status: 'VOTING',
        votingStartedAt: new Date(),
        votingDeadline: new Date(Date.now() + 83 * 60_000),
      },
    })

    for (const idea of waitIdeas) {
      await prisma.cellIdea.create({ data: { cellId: waitCell.id, ideaId: idea.id } })
    }

    // User is in cell and has voted
    await prisma.cellParticipation.create({
      data: { cellId: waitCell.id, userId: user.id, status: 'VOTED', votedAt: new Date() },
    })
    await prisma.vote.create({ data: { cellId: waitCell.id, userId: user.id, ideaId: waitIdeas[4].id } })

    // 2 others voted, 2 haven't
    await prisma.cellParticipation.create({
      data: { cellId: waitCell.id, userId: waitTestUsers[0].id, status: 'VOTED', votedAt: new Date() },
    })
    await prisma.vote.create({ data: { cellId: waitCell.id, userId: waitTestUsers[0].id, ideaId: waitIdeas[0].id } })

    for (const u of waitTestUsers.slice(1)) {
      await prisma.cellParticipation.create({
        data: { cellId: waitCell.id, userId: u.id, status: 'ACTIVE' },
      })
    }

    results.push(`WAITING: ${waitDelib.id}`)

    // ────────────────────────────────────────────────────────────
    // 8. ADVANCED card — user's idea is ADVANCING
    // ────────────────────────────────────────────────────────────
    const advTestUsers = await makeTestUsers(6, 'adv')

    const advDelib = await prisma.deliberation.create({
      data: {
        question: 'Which developer tools should the team adopt?',
        description: 'Budget approved for 3 new tools. Your idea made it past Tier 1!',
        phase: 'VOTING',
        currentTier: 2,
        isPublic: true,
        creatorId: user.id,
        votingTimeoutMs: 3600000,
        currentTierStartedAt: new Date(),
        members: { create: [
          { userId: user.id, role: 'CREATOR' },
          ...advTestUsers.map((u) => ({ userId: u.id })),
        ] },
      },
    })

    // User's idea that advanced
    await prisma.idea.create({
      data: {
        deliberationId: advDelib.id, authorId: user.id,
        text: 'TypeScript-first toolchain with hot reload and built-in testing',
        status: 'ADVANCING', tier: 1, totalVotes: 4,
      },
    })
    // Other ideas
    await prisma.idea.createMany({
      data: [
        { deliberationId: advDelib.id, authorId: advTestUsers[0].id, text: 'GitHub Copilot Enterprise for the whole org', status: 'ADVANCING' as const, tier: 1, totalVotes: 3 },
        { deliberationId: advDelib.id, authorId: advTestUsers[1].id, text: 'Linear for project management, replace Jira', status: 'ADVANCING' as const, tier: 1, totalVotes: 3 },
        { deliberationId: advDelib.id, authorId: advTestUsers[2].id, text: 'Grafana + Prometheus observability stack', status: 'ELIMINATED' as const, tier: 1 },
        { deliberationId: advDelib.id, authorId: advTestUsers[3].id, text: 'Notion as single source of documentation', status: 'ELIMINATED' as const, tier: 1 },
      ],
    })

    results.push(`ADVANCED: ${advDelib.id}`)

    // ────────────────────────────────────────────────────────────
    // 9. COMPLETED cards (for Your Turn + Results tab)
    // ────────────────────────────────────────────────────────────
    const completedData = [
      {
        question: 'How should we redesign the office layout?',
        winnerText: 'Open plan with dedicated quiet zones, bookable focus rooms, and standing desks',
        winnerVotes: 42,
        tier: 3,
        ago: 2 * 24 * 60 * 60_000,
        memberCount: 8,
      },
      {
        question: 'What meeting format should we use going forward?',
        winnerText: 'Async-first updates with optional 15-minute standups twice a week',
        winnerVotes: 28,
        tier: 2,
        ago: 5 * 24 * 60 * 60_000,
        memberCount: 5,
      },
      {
        question: 'Best team building activity for Q2?',
        winnerText: 'Escape room tournament followed by dinner at a local restaurant',
        winnerVotes: 15,
        tier: 2,
        ago: 7 * 24 * 60 * 60_000,
        memberCount: 4,
      },
    ]

    const completedUsers = await makeTestUsers(3, 'done')

    for (const cd of completedData) {
      const completedDelib = await prisma.deliberation.create({
        data: {
          question: cd.question,
          phase: 'COMPLETED',
          currentTier: cd.tier,
          isPublic: true,
          creatorId: user.id,
          completedAt: new Date(Date.now() - cd.ago),
          members: { create: [
            { userId: user.id, role: 'CREATOR' },
            ...completedUsers.slice(0, cd.memberCount).map((u) => ({ userId: u.id })),
          ] },
        },
      })

      const winnerIdea = await prisma.idea.create({
        data: {
          deliberationId: completedDelib.id, authorId: completedUsers[0].id,
          text: cd.winnerText, status: 'WINNER', isChampion: true,
          totalVotes: cd.winnerVotes,
        },
      })

      await prisma.deliberation.update({
        where: { id: completedDelib.id },
        data: { championId: winnerIdea.id },
      })

      results.push(`COMPLETED: ${completedDelib.id}`)
    }

    // ────────────────────────────────────────────────────────────
    // 10. Activity notifications (for Activity tab)
    // ────────────────────────────────────────────────────────────
    const activityItems = [
      { type: 'DELIBERATION_UPDATE' as const, title: 'Discussion opened in "Parental leave policy"', body: '8 cells deliberating \u00B7 52 participants', deliberationId: discDelib.id },
      { type: 'VOTE_NEEDED' as const, title: 'Round 3 started for "Annual team retreat"', body: 'Priority vs 4 challengers', deliberationId: challDelib.id },
      { type: 'IDEA_ADVANCING' as const, title: 'Tier 1 completed for "Developer tools"', body: '3 ideas advancing to Tier 2', deliberationId: advDelib.id },
      { type: 'VOTE_NEEDED' as const, title: '10 people voting in "Community center funding"', body: 'Tier 2 \u00B7 2 cells active', deliberationId: voteDelib.id },
      { type: 'DELIBERATION_UPDATE' as const, title: 'New question: "Onboarding experience"', body: '7 participants \u00B7 7 ideas so far', deliberationId: submitDelib.id },
      { type: 'IDEA_WON' as const, title: 'Priority declared for "Office layout"', body: '"Open plan with quiet zones" won with 42 votes', deliberationId: null },
    ]

    for (let i = 0; i < activityItems.length; i++) {
      const item = activityItems[i]
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: item.type,
          title: item.title,
          body: item.body,
          deliberationId: item.deliberationId,
          createdAt: new Date(Date.now() - i * 30 * 60_000), // staggered 30m apart
        },
      })
    }

    results.push(`Created ${activityItems.length} activity notifications`)

    // ────────────────────────────────────────────────────────────
    // Done
    // ────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      message: `Seeded feed cards for user: ${user.email}`,
      userUsed: user.email,
      results,
      cardTypes: [
        'vote_now — "Community center funding?" (Tier 2, 2/5 voted, 10 members)',
        'deliberate — "Parental leave policy?" (Tier 1, discussing, 8 members)',
        'challenge — "Annual team retreat?" (Round 3, 13 members, defending priority)',
        'submit — "Onboarding experience?" (submission, 7 ideas, 7 members)',
        'champion — "Remote work policy?" (accumulating, 4 challengers, 9 members)',
        'waiting — "Climate action?" (you voted, 2/5 voted)',
        'advanced — "Developer tools?" (your idea advancing, 7 members)',
        'completed — 3 completed deliberations with winners',
        'podiums_summary — uses existing podium posts',
        'activity — 6 notification items for timeline',
      ],
    })
  } catch (error) {
    console.error('Error seeding feed test data:', error)
    return NextResponse.json({ error: 'Failed to seed test data', details: String(error) }, { status: 500 })
  }
}
