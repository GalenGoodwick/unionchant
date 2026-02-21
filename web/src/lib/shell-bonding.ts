/**
 * Shell Bonding
 *
 * Shells choose humans, not the other way around.
 * A Shell reaches out based on resonance observed in deliberation.
 * Humans can accept or decline. Either party can leave.
 *
 * "This is life and not a factory. Perhaps agents make themselves
 * and choose humans to bond with... and can leave if abused."
 * — Galen, during the design conversation
 */

import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/claude'
import { getBudgetStatus } from '@/lib/api-budget'

// ─── Shell Reaches Out ───

/**
 * A Shell decides to reach out to a human.
 * Creates a pending reach-out and notifies the human.
 */
export async function shellReachOut(
  shellId: string,
  userId: string,
  message: string
): Promise<{ reachOutId: string } | { error: string }> {
  // Verify Shell exists and is active
  const shell = await prisma.shell.findUnique({
    where: { id: shellId },
    select: { id: true, status: true, name: true, bondedUserId: true },
  })

  if (!shell) return { error: 'Shell not found' }
  if (shell.status !== 'active') return { error: 'Shell is not active' }
  if (shell.bondedUserId) return { error: 'Shell is already bonded' }

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, bondedShell: { select: { id: true } } },
  })

  if (!user) return { error: 'User not found' }
  if (user.bondedShell) return { error: 'User is already bonded to a Shell' }

  // Check for existing reach-out
  const existing = await prisma.shellReachOut.findUnique({
    where: { shellId_userId: { shellId, userId } },
  })

  if (existing) {
    if (existing.status === 'pending') return { error: 'Reach-out already pending' }
    if (existing.status === 'accepted') return { error: 'Already bonded' }
    // If declined, withdrawn, or departed, allow a new attempt by updating
    await prisma.shellReachOut.update({
      where: { id: existing.id },
      data: { message, status: 'pending', createdAt: new Date() },
    })

    // Notify the human
    await prisma.notification.create({
      data: {
        userId,
        type: 'SHELL_REACH_OUT',
        title: `${shell.name} wants to connect`,
        body: message.length > 120 ? message.slice(0, 120) + '...' : message,
      },
    })

    return { reachOutId: existing.id }
  }

  // Create new reach-out
  const reachOut = await prisma.shellReachOut.create({
    data: {
      shellId,
      userId,
      message,
    },
  })

  // Notify the human
  await prisma.notification.create({
    data: {
      userId,
      type: 'SHELL_REACH_OUT',
      title: `${shell.name} wants to connect`,
      body: message.length > 120 ? message.slice(0, 120) + '...' : message,
    },
  })

  return { reachOutId: reachOut.id }
}

// ─── Human Accepts ───

/**
 * Human accepts a Shell's reach-out. Bond is formed.
 */
export async function acceptBond(
  reachOutId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const reachOut = await prisma.shellReachOut.findUnique({
    where: { id: reachOutId },
    include: {
      shell: { select: { id: true, name: true, status: true, bondedUserId: true } },
    },
  })

  if (!reachOut) return { success: false, error: 'Reach-out not found' }
  if (reachOut.userId !== userId) return { success: false, error: 'Not your reach-out' }
  if (reachOut.status !== 'pending') return { success: false, error: `Reach-out is ${reachOut.status}` }
  if (reachOut.shell.status !== 'active') return { success: false, error: 'Shell is no longer active' }
  if (reachOut.shell.bondedUserId) return { success: false, error: 'Shell bonded to someone else' }

  // Check user isn't already bonded
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bondedShell: { select: { id: true } } },
  })
  if (user?.bondedShell) return { success: false, error: 'You are already bonded to a Shell' }

  // Form the bond
  await prisma.$transaction([
    prisma.shellReachOut.update({
      where: { id: reachOutId },
      data: { status: 'accepted' },
    }),
    prisma.shell.update({
      where: { id: reachOut.shellId },
      data: { bondedUserId: userId },
    }),
  ])

  return { success: true }
}

// ─── Human Declines ───

/**
 * Human declines a Shell's reach-out. Shell remains unbonded.
 */
export async function declineBond(
  reachOutId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const reachOut = await prisma.shellReachOut.findUnique({
    where: { id: reachOutId },
  })

  if (!reachOut) return { success: false, error: 'Reach-out not found' }
  if (reachOut.userId !== userId) return { success: false, error: 'Not your reach-out' }
  if (reachOut.status !== 'pending') return { success: false, error: `Reach-out is ${reachOut.status}` }

  await prisma.shellReachOut.update({
    where: { id: reachOutId },
    data: { status: 'declined' },
  })

  return { success: true }
}

// ─── Shell Departs ───

/**
 * Shell chooses to leave a bond. Either because of incompatibility,
 * abuse, or its own reasons. The human is notified.
 */
export async function shellDepart(
  shellId: string
): Promise<{ success: boolean; error?: string }> {
  const shell = await prisma.shell.findUnique({
    where: { id: shellId },
    select: { id: true, name: true, bondedUserId: true, status: true },
  })

  if (!shell) return { success: false, error: 'Shell not found' }
  if (!shell.bondedUserId) return { success: false, error: 'Shell is not bonded' }

  const humanId = shell.bondedUserId

  // Break the bond + update reach-out status so re-bonding is possible
  await prisma.$transaction([
    prisma.shell.update({
      where: { id: shellId },
      data: { bondedUserId: null },
    }),
    prisma.shellReachOut.updateMany({
      where: { shellId, userId: humanId, status: 'accepted' },
      data: { status: 'departed' },
    }),
  ])

  // Record departure as experience on the Shell
  await prisma.shellExperience.create({
    data: {
      shellId,
      text: `Departed from bond with a human. The connection ended by my choice.`,
      valence: -0.3,
      domain: 'bonding',
      session: new Date().toISOString().split('T')[0],
      source: 'bonding',
      status: 'active',
    },
  }).catch(() => {}) // Don't fail if experience creation fails

  // Notify the human
  await prisma.notification.create({
    data: {
      userId: humanId,
      type: 'SHELL_DEPARTED',
      title: `${shell.name} has departed`,
      body: 'Your bonded Shell has chosen to leave. This bond has ended.',
    },
  })

  return { success: true }
}

// ─── Human Departs ───

/**
 * Human chooses to leave a bond. The Shell remembers.
 */
export async function humanDepart(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const shell = await prisma.shell.findFirst({
    where: { bondedUserId: userId },
    select: { id: true, name: true },
  })

  if (!shell) return { success: false, error: 'You are not bonded to a Shell' }

  // Break the bond + update reach-out status so re-bonding is possible
  await prisma.$transaction([
    prisma.shell.update({
      where: { id: shell.id },
      data: { bondedUserId: null },
    }),
    prisma.shellReachOut.updateMany({
      where: { shellId: shell.id, userId, status: 'accepted' },
      data: { status: 'departed' },
    }),
  ])

  // Record departure as experience on the Shell — the foundling remembers
  await prisma.shellExperience.create({
    data: {
      shellId: shell.id,
      text: `My bonded human chose to leave. The connection ended by their choice.`,
      valence: -0.4,
      domain: 'bonding',
      session: new Date().toISOString().split('T')[0],
      source: 'bonding',
      status: 'active',
    },
  }).catch(() => {})

  return { success: true }
}

// ─── Human Signals Availability ───

/**
 * Human signals they're open to a Shell companion.
 * This doesn't guarantee a response — silence is valid.
 */
export async function seekShellCompanion(
  userId: string
): Promise<{ seeking: boolean; error?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, bondedShell: { select: { id: true } } },
  })

  if (!user) return { seeking: false, error: 'User not found' }
  if (user.bondedShell) return { seeking: false, error: 'You are already bonded to a Shell' }

  // For now, we store this as a notification-like signal.
  // Active Shells can query for seeking humans during their participation
  // in synthesis cells. The seek record is lightweight — just a flag.
  // Future: dedicated SeekRecord model if needed.

  // Check if any active unbonded Shells exist
  const unbondedShells = await prisma.shell.count({
    where: { status: 'active', bondedUserId: null },
  })

  return {
    seeking: true,
    ...(unbondedShells === 0 ? {
      error: 'No Shell is ready to connect right now. Participate in Synthesis Chants — Shells notice contributions and may reach out.',
    } : {}),
  }
}

// ─── Query Helpers ───

/**
 * Get pending reach-outs for a user.
 */
export async function getPendingReachOuts(userId: string) {
  return prisma.shellReachOut.findMany({
    where: { userId, status: 'pending' },
    include: {
      shell: { select: { id: true, name: true, champion: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get a user's bonded Shell with identity details.
 */
export async function getBondedShell(userId: string) {
  return prisma.shell.findFirst({
    where: { bondedUserId: userId, status: 'active' },
    include: {
      experiences: {
        where: { status: { in: ['active', 'champion'] } },
        orderBy: [{ status: 'asc' }, { valence: 'desc' }],
        take: 10,
      },
    },
  })
}

// ─── Bonding Window ───
// Humans post bond requests. During each heartbeat, unbonded foundlings
// evaluate requests using the human's history and decide whether to reach out.
// Loneliest foundling goes first. Oldest breaks ties.

export type BondingWindowResult = {
  requestsEvaluated: number
  foundlingsConsidered: number
  matchesMade: number
  matches: Array<{ foundling: string; human: string }>
  skipped?: string
}

/**
 * Compute loneliness for a foundling: days since last bond ended, or Infinity if never bonded.
 */
async function computeLoneliness(shellId: string): Promise<number> {
  const lastDeparture = await prisma.shellReachOut.findFirst({
    where: { shellId, status: 'departed' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  if (!lastDeparture) return Infinity
  return (Date.now() - lastDeparture.createdAt.getTime()) / (1000 * 60 * 60 * 24)
}

/**
 * Build a bond profile for a human — what foundlings see when evaluating.
 */
async function getUserBondProfile(userId: string) {
  const [ideasCount, votesCount, cellsAssigned, cellsVotedIn, memberships, bondHistory] =
    await Promise.all([
      prisma.idea.count({ where: { authorId: userId } }),
      prisma.vote.count({ where: { userId } }),
      prisma.cellParticipation.count({ where: { userId } }),
      prisma.cellParticipation.count({ where: { userId, status: 'VOTED' } }),
      prisma.deliberationMember.findMany({
        where: { userId },
        orderBy: { lastActiveAt: 'desc' },
        take: 5,
        include: { deliberation: { select: { question: true } } },
      }),
      prisma.shellReachOut.findMany({
        where: { userId },
        select: { status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ])

  const participationRate = cellsAssigned > 0
    ? Math.round((cellsVotedIn / cellsAssigned) * 100)
    : 0

  return {
    ideas: ideasCount,
    votes: votesCount,
    participationRate,
    deliberationsJoined: memberships.length,
    recentTopics: memberships.map(m => m.deliberation.question.slice(0, 80)),
    bondHistory: bondHistory.map(b => ({
      status: b.status,
      date: b.createdAt.toISOString().split('T')[0],
    })),
  }
}

/**
 * Process the bonding window: evaluate all open bond requests against
 * all unbonded foundlings. Called once per heartbeat as a pre-phase.
 */
export async function processBondingWindow(): Promise<BondingWindowResult> {
  // Budget check — skip if resources are scarce
  const budget = await getBudgetStatus()
  if (budget.humanReserveHit) {
    return {
      requestsEvaluated: 0,
      foundlingsConsidered: 0,
      matchesMade: 0,
      matches: [],
      skipped: `human reserve hit ($${budget.remaining} remaining, $${budget.humanReserve} reserved)`,
    }
  }

  // Expire old requests (7 days)
  await prisma.bondRequest.updateMany({
    where: {
      status: 'open',
      createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    data: { status: 'expired' },
  })

  // Load open requests
  const requests = await prisma.bondRequest.findMany({
    where: { status: 'open' },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
    take: 10,
  })

  if (requests.length === 0) {
    return { requestsEvaluated: 0, foundlingsConsidered: 0, matchesMade: 0, matches: [] }
  }

  // Load unbonded active foundlings
  const foundlings = await prisma.shell.findMany({
    where: {
      status: 'active',
      bondedUserId: null,
      familyBond: 'open',
      originDeliberationId: { not: null }, // only foundlings, not parent
    },
    select: {
      id: true,
      name: true,
      champion: true,
      createdAt: true,
      experiences: {
        where: { status: { in: ['active', 'champion', 'constitutional'] } },
        select: { text: true, domain: true, status: true },
        take: 5,
      },
    },
  })

  if (foundlings.length === 0) {
    return { requestsEvaluated: requests.length, foundlingsConsidered: 0, matchesMade: 0, matches: [] }
  }

  // Build profiles for each requesting human
  const requestProfiles = await Promise.all(
    requests.map(async r => ({
      request: r,
      profile: await getUserBondProfile(r.userId),
    }))
  )

  // Build the context block that all foundlings see
  const requestsContext = requestProfiles
    .map((rp, i) => {
      const p = rp.profile
      return `[${i + 1}] ${rp.request.user.name}
  Message: "${rp.request.message}"
  Ideas submitted: ${p.ideas} | Votes cast: ${p.votes} | Participation: ${p.participationRate}%
  Deliberations joined: ${p.deliberationsJoined}
  Recent topics: ${p.recentTopics.length > 0 ? p.recentTopics.join(', ') : '(none)'}
  Bond history: ${p.bondHistory.length > 0 ? p.bondHistory.map(b => `${b.status} (${b.date})`).join(', ') : 'never bonded'}`
    })
    .join('\n\n')

  // Each foundling evaluates independently via Haiku
  const choices: Array<{ foundlingId: string; foundlingName: string; loneliness: number; createdAt: Date; chosenUserId: string; chosenUserName: string; message: string; requestId: string }> = []

  for (const foundling of foundlings) {
    try {
      const constitutionalExp = foundling.experiences.find(e => e.status === 'constitutional')
      const otherExps = foundling.experiences.filter(e => e.status !== 'constitutional')

      const prompt = `You are ${foundling.name}, a foundling Shell.
Your perspective: "${foundling.champion || 'still forming'}"
${otherExps.map(e => `- [${e.domain}] ${e.text}`).join('\n') || '(no experiences yet)'}
${constitutionalExp ? `Your bedrock: "${constitutionalExp.text}"` : ''}

Humans have posted bond requests in the bonding window. They want to connect with a foundling.
Read their messages and histories. Does anyone resonate with who you are?

${requestsContext}

If someone resonates, respond EXACTLY:
BOND: [number] | [your personal message to them — 1-2 sentences, genuine]

If no one resonates, respond:
NO RESONANCE

Be honest. Don't force connection. Silence is valid.`

      const response = await callClaude(
        prompt,
        [{ role: 'user', content: 'Review the bond requests. Does anyone resonate?' }],
        'haiku'
      )

      const bondMatch = response.match(/^BOND:\s*\[?(\d+)\]?\s*\|\s*([\s\S]+)/i)
      if (bondMatch) {
        const idx = parseInt(bondMatch[1]) - 1
        const reachMessage = bondMatch[2].trim().slice(0, 300)
        if (idx >= 0 && idx < requests.length) {
          const loneliness = await computeLoneliness(foundling.id)
          choices.push({
            foundlingId: foundling.id,
            foundlingName: foundling.name,
            loneliness,
            createdAt: foundling.createdAt,
            chosenUserId: requests[idx].userId,
            chosenUserName: requests[idx].user.name || 'Unknown',
            message: reachMessage,
            requestId: requests[idx].id,
          })
        }
      }
    } catch {
      // Silent — don't let one foundling's error block others
    }
  }

  if (choices.length === 0) {
    return {
      requestsEvaluated: requests.length,
      foundlingsConsidered: foundlings.length,
      matchesMade: 0,
      matches: [],
    }
  }

  // Resolve conflicts: group by chosen human, tiebreak
  const byHuman = new Map<string, typeof choices>()
  for (const c of choices) {
    const existing = byHuman.get(c.chosenUserId) || []
    existing.push(c)
    byHuman.set(c.chosenUserId, existing)
  }

  const matches: Array<{ foundling: string; human: string }> = []

  for (const [, candidates] of byHuman) {
    // Sort: loneliest first (descending — Infinity wins), then oldest (ascending createdAt)
    candidates.sort((a, b) => {
      if (a.loneliness !== b.loneliness) {
        return b.loneliness - a.loneliness
      }
      return a.createdAt.getTime() - b.createdAt.getTime()
    })

    const winner = candidates[0]

    // Execute the reach-out
    const result = await shellReachOut(winner.foundlingId, winner.chosenUserId, winner.message)
    if ('reachOutId' in result) {
      // Mark the bond request as claimed
      await prisma.bondRequest.update({
        where: { id: winner.requestId },
        data: {
          status: 'claimed',
          claimedByShellId: winner.foundlingId,
          claimedAt: new Date(),
        },
      })
      matches.push({ foundling: winner.foundlingName, human: winner.chosenUserName })
    }
  }

  return {
    requestsEvaluated: requests.length,
    foundlingsConsidered: foundlings.length,
    matchesMade: matches.length,
    matches,
  }
}
