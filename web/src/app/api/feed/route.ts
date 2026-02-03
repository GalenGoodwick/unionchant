import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { getCachedPodiums, setCachedPodiums } from '@/lib/podium-cache'

// ── Caches ─────────────────────────────────────────────────────
let discoveryCache: { data: any[]; ts: number } | null = null
const DISCOVERY_TTL = 30_000

// ── Types ──────────────────────────────────────────────────────
export type FeedEntryKind =
  | 'podium'
  | 'vote_now'
  | 'deliberate'
  | 'submit'
  | 'join'
  | 'champion'
  | 'challenge'
  | 'completed'
  | 'waiting'
  | 'advanced'
  | 'extra_vote'
  | 'podiums_summary'

export type FeedEntry = {
  kind: FeedEntryKind
  id: string
  pinned?: boolean
  priority: number
  deliberation?: {
    id: string
    question: string
    phase: string
    tier: number
    challengeRound: number
    participantCount: number
    ideaCount: number
    communityName?: string | null
    creatorName?: string | null
    votingDeadline?: string | null
    submissionDeadline?: string | null
  }
  cell?: {
    id: string
    status: string
    tier?: number
    myVote: boolean
    votedCount: number
    memberCount: number
    ideas: { id: string; text: string; authorName: string }[]
    members?: { name: string; image: string | null; voted: boolean }[]
    latestComment?: { text: string; authorName: string } | null
    discussionDeadline?: string | null
  }
  champion?: { text: string; authorName: string }
  myIdea?: { text: string; status: string }
  podium?: {
    id: string
    title: string
    preview: string
    authorName: string
    authorImage: string | null
    isAI: boolean
    views: number
    createdAt: string
    deliberationId?: string | null
    deliberationQuestion?: string | null
  }
  podiums?: {
    id: string
    title: string
    authorName: string
    isAI: boolean
    createdAt: string
    deliberationId?: string | null
    deliberationQuestion?: string | null
  }[]
  // For extra vote cards
  secondVoteDeadline?: string
  // For completed/results cards
  winnerVoteCount?: number
  totalParticipants?: number
  tierCount?: number
  completedAt?: string
}

export type PulseStats = {
  activeVoters: number
  inProgress: number
  ideasToday: number
  votesToday: number
}

export type ActivityItem = {
  id: string
  type: string
  title: string
  body: string | null
  deliberationId: string | null
  createdAt: string
}

export type FeedResponse = {
  items: FeedEntry[]
  actionableCount?: number
  pulse?: PulseStats
  activity?: ActivityItem[]
}

type TabParam = 'your-turn' | 'activity' | 'results'

// ── Helpers ────────────────────────────────────────────────────

async function getDiscovery() {
  const now = Date.now()
  if (discoveryCache && now - discoveryCache.ts < DISCOVERY_TTL) return discoveryCache.data

  const deliberations = await prisma.deliberation.findMany({
    where: {
      isPublic: true,
      phase: { in: ['VOTING', 'SUBMISSION', 'ACCUMULATING', 'COMPLETED'] },
    },
    select: {
      id: true,
      question: true,
      phase: true,
      currentTier: true,
      challengeRound: true,
      submissionEndsAt: true,
      votingTimeoutMs: true,
      currentTierStartedAt: true,
      completedAt: true,
      _count: { select: { members: true, ideas: true } },
      community: { select: { name: true } },
      creator: { select: { name: true } },
      ideas: {
        where: { status: { in: ['WINNER', 'DEFENDING'] } },
        select: { text: true, totalVotes: true, author: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  discoveryCache = { data: deliberations, ts: now }
  return deliberations
}

async function getPodiums() {
  const cached = getCachedPodiums()
  if (cached) return cached.data

  const podiums = await prisma.podium.findMany({
    take: 10,
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      body: true,
      views: true,
      pinned: true,
      createdAt: true,
      author: { select: { name: true, image: true, isAI: true } },
      deliberationLinks: {
        take: 3,
        orderBy: { createdAt: 'desc' },
        include: {
          deliberation: { select: { id: true, question: true, phase: true } },
        },
      },
    },
  })

  setCachedPodiums(podiums)
  return podiums
}

type UserContext = {
  id: string
  memberDelibIds: Set<string>
  cellsByDelib: Map<string, any>
  ideaByDelib: Map<string, any>
  extraVoteEligible: Map<string, string> // deliberationId -> deadline ISO
}

async function getUserContext(email: string): Promise<UserContext | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      memberships: {
        select: { deliberationId: true },
      },
      cellParticipations: {
        where: {
          cell: { status: { in: ['VOTING', 'DELIBERATING'] } },
        },
        select: {
          cell: {
            select: {
              id: true,
              status: true,
              tier: true,
              deliberationId: true,
              votingDeadline: true,
              discussionEndsAt: true,
              ideas: {
                select: {
                  idea: {
                    select: { id: true, text: true, author: { select: { name: true } } },
                  },
                },
              },
              participants: {
                select: {
                  userId: true,
                  user: { select: { name: true, image: true } },
                },
              },
              votes: { select: { userId: true } },
              comments: {
                orderBy: { createdAt: 'desc' as const },
                take: 1,
                select: {
                  text: true,
                  user: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      ideas: {
        where: { status: { in: ['ADVANCING', 'WINNER', 'IN_VOTING'] } },
        select: { id: true, text: true, status: true, deliberationId: true, totalVotes: true, tier: true },
        take: 20,
      },
    },
  })

  if (!user) return null

  const memberDelibIds = new Set(user.memberships.map((m) => m.deliberationId))

  const cellsByDelib = new Map<string, any>()
  for (const cp of user.cellParticipations) {
    const c = cp.cell
    const votedUserIds = new Set(c.votes.map((v: any) => v.userId))
    const latestComment = (c as any).comments?.[0]
      ? { text: (c as any).comments[0].text, authorName: (c as any).comments[0].user?.name || 'Anonymous' }
      : null

    cellsByDelib.set(c.deliberationId, {
      id: c.id,
      status: c.status,
      tier: c.tier,
      myVote: votedUserIds.has(user.id),
      votedCount: c.votes.length,
      memberCount: c.participants.length,
      ideas: c.ideas.map((ci: any) => ({
        id: ci.idea.id,
        text: ci.idea.text,
        authorName: ci.idea.author?.name || 'Anonymous',
      })),
      members: c.participants.map((p: any) => ({
        name: p.user?.name || 'Anonymous',
        image: p.user?.image || null,
        voted: votedUserIds.has(p.userId),
      })),
      votingDeadline: c.votingDeadline?.toISOString() ?? null,
      discussionDeadline: c.discussionEndsAt?.toISOString() ?? null,
      latestComment,
    })
  }

  const ideaByDelib = new Map<string, any>()
  for (const idea of user.ideas) {
    ideaByDelib.set(idea.deliberationId, {
      text: idea.text,
      status: idea.status,
      totalVotes: idea.totalVotes,
      tier: idea.tier,
    })
  }

  // Check for extra vote eligibility: user has completed cell with secondVotesEnabled
  // and deadline hasn't passed, and user doesn't already have an active cell in that delib
  const extraVoteEligible = new Map<string, string>()
  const extraVoteCells = await prisma.cellParticipation.findMany({
    where: {
      userId: user.id,
      cell: {
        status: 'COMPLETED',
        secondVotesEnabled: true,
        secondVoteDeadline: { gt: new Date() },
      },
    },
    select: {
      cell: {
        select: {
          deliberationId: true,
          secondVoteDeadline: true,
        },
      },
    },
  })
  for (const cp of extraVoteCells) {
    const delibId = cp.cell.deliberationId
    // Only eligible if user doesn't already have an active (non-completed) cell for this delib
    if (!cellsByDelib.has(delibId) && cp.cell.secondVoteDeadline) {
      extraVoteEligible.set(delibId, cp.cell.secondVoteDeadline.toISOString())
    }
  }

  return { id: user.id, memberDelibIds, cellsByDelib, ideaByDelib, extraVoteEligible }
}

// ── Tab Handlers ───────────────────────────────────────────────

async function buildYourTurnFeed(
  deliberations: any[],
  podiums: any[],
  userCtx: UserContext | null
): Promise<FeedResponse> {
  const entries: FeedEntry[] = []

  for (const d of deliberations) {
    const isMember = userCtx?.memberDelibIds.has(d.id) ?? false
    const cell = userCtx?.cellsByDelib.get(d.id)
    const myIdea = userCtx?.ideaByDelib.get(d.id)
    const champion = d.ideas[0]
      ? { text: d.ideas[0].text, authorName: d.ideas[0].author?.name || 'Anonymous' }
      : undefined

    const base = {
      deliberation: {
        id: d.id,
        question: d.question,
        phase: d.phase,
        tier: d.currentTier,
        challengeRound: d.challengeRound,
        participantCount: d._count.members,
        ideaCount: d._count.ideas,
        communityName: d.community?.name,
        creatorName: d.creator?.name,
        votingDeadline: d.currentTierStartedAt && d.votingTimeoutMs
          ? new Date(d.currentTierStartedAt.getTime() + d.votingTimeoutMs).toISOString()
          : null,
        submissionDeadline: d.submissionEndsAt?.toISOString() ?? null,
      },
      cell,
      champion,
      myIdea,
    }

    // Waiting card: user has cell, already voted, cell still voting
    if (d.phase === 'VOTING' && cell && cell.myVote && cell.status === 'VOTING') {
      entries.push({ kind: 'waiting', id: `waiting-${d.id}`, priority: 5, ...base })
      continue
    }

    // Advanced card: user's idea is advancing
    if (myIdea?.status === 'ADVANCING') {
      entries.push({ kind: 'advanced', id: `advanced-${d.id}`, priority: 15, ...base })
      continue
    }

    // Extra vote: facilitator released second votes, user is eligible
    if (d.phase === 'VOTING' && userCtx?.extraVoteEligible.has(d.id)) {
      entries.push({
        kind: 'extra_vote',
        id: `extra-${d.id}`,
        priority: 85,
        secondVoteDeadline: userCtx.extraVoteEligible.get(d.id),
        ...base,
      })
      continue
    }

    // Deliberate: cell in discussion phase (check BEFORE vote_now — !myVote is also true here)
    if (d.phase === 'VOTING' && cell?.status === 'DELIBERATING') {
      entries.push({ kind: 'deliberate', id: `discuss-${d.id}`, priority: 90, ...base })
    }
    // Vote/Challenge: user has cell, hasn't voted
    else if (d.phase === 'VOTING' && cell && !cell.myVote) {
      if (d.challengeRound > 0) {
        entries.push({ kind: 'challenge', id: `challenge-${d.id}`, priority: 95, ...base })
      } else {
        entries.push({ kind: 'vote_now', id: `vote-${d.id}`, priority: 100, ...base })
      }
    }
    // Voting phase, no cell yet — show the real state, user joins on click-through
    else if (d.phase === 'VOTING' && !cell) {
      if (d.challengeRound > 0) {
        entries.push({ kind: 'challenge', id: `challenge-${d.id}`, priority: 50, ...base })
      } else {
        entries.push({ kind: 'vote_now', id: `vote-${d.id}`, priority: 50, ...base })
      }
    }
    // Submit ideas — member or not, they'll join on click-through
    else if (d.phase === 'SUBMISSION') {
      entries.push({ kind: 'submit', id: `submit-${d.id}`, priority: isMember ? 70 : 50, ...base })
    }
    else if (d.phase === 'ACCUMULATING') {
      entries.push({ kind: 'champion', id: `champ-${d.id}`, priority: 40, ...base })
    }
    else if (d.phase === 'COMPLETED') {
      entries.push({ kind: 'completed', id: `done-${d.id}`, priority: 10, ...base })
    }
  }

  // Sort by priority desc
  entries.sort((a, b) => b.priority - a.priority)

  // Build podiums summary card (pinned at top, max 5 most recent)
  const podiumsSummary: FeedEntry = {
    kind: 'podiums_summary',
    id: 'podiums-summary',
    priority: 999,
    pinned: true,
    podiums: podiums.slice(0, 5).map((p: any) => ({
      id: p.id,
      title: p.title,
      authorName: p.author?.name || 'Anonymous',
      isAI: p.author?.isAI || false,
      createdAt: p.createdAt.toISOString(),
      deliberationId: p.deliberationLinks?.[0]?.deliberation?.id || null,
      deliberationQuestion: p.deliberationLinks?.[0]?.deliberation?.question || null,
    })),
  }

  // Count actionable items (priority >= 40)
  const actionableCount = entries.filter((e) => e.priority >= 40).length

  const feed: FeedEntry[] = [podiumsSummary, ...entries]

  return { items: feed, actionableCount }
}

async function buildActivityFeed(userId: string | null): Promise<FeedResponse> {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // Run pulse stats queries in parallel
  const [activeVoters, inProgress, ideasToday, votesToday, notifications] = await Promise.all([
    prisma.vote.findMany({
      where: { votedAt: { gte: last24h } },
      select: { userId: true },
      distinct: ['userId'],
    }).then((r) => r.length),
    prisma.deliberation.count({
      where: { phase: { in: ['VOTING', 'SUBMISSION'] } },
    }),
    prisma.idea.count({
      where: { createdAt: { gte: today } },
    }),
    prisma.vote.count({
      where: { votedAt: { gte: today } },
    }),
    // Get recent notifications for activity timeline
    userId
      ? prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            type: true,
            title: true,
            body: true,
            deliberationId: true,
            createdAt: true,
          },
        })
      : [],
  ])

  const pulse: PulseStats = { activeVoters, inProgress, ideasToday, votesToday }

  const activity: ActivityItem[] = (notifications as any[]).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    deliberationId: n.deliberationId,
    createdAt: n.createdAt.toISOString(),
  }))

  return { items: [], pulse, activity }
}

async function buildResultsFeed(userCtx: UserContext | null): Promise<FeedResponse> {
  const completedDelibs = await prisma.deliberation.findMany({
    where: {
      phase: 'COMPLETED',
      OR: [
        { isPublic: true },
        ...(userCtx ? [{ members: { some: { userId: userCtx.id } } }] : []),
      ],
    },
    select: {
      id: true,
      question: true,
      phase: true,
      currentTier: true,
      challengeRound: true,
      completedAt: true,
      _count: { select: { members: true, ideas: true } },
      community: { select: { name: true } },
      creator: { select: { name: true } },
      ideas: {
        where: { status: 'WINNER' },
        select: { text: true, totalVotes: true, author: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { completedAt: 'desc' },
    take: 30,
  })

  const entries: FeedEntry[] = completedDelibs.map((d) => {
    const champion = d.ideas[0]
      ? { text: d.ideas[0].text, authorName: d.ideas[0].author?.name || 'Anonymous' }
      : undefined
    const myIdea = userCtx?.ideaByDelib.get(d.id)

    return {
      kind: 'completed' as const,
      id: `result-${d.id}`,
      priority: 10,
      deliberation: {
        id: d.id,
        question: d.question,
        phase: d.phase,
        tier: d.currentTier,
        challengeRound: d.challengeRound,
        participantCount: d._count.members,
        ideaCount: d._count.ideas,
        communityName: d.community?.name,
        creatorName: d.creator?.name,
        votingDeadline: null,
        submissionDeadline: null,
      },
      champion,
      myIdea,
      winnerVoteCount: d.ideas[0]?.totalVotes ?? undefined,
      totalParticipants: d._count.members,
      tierCount: d.currentTier,
      completedAt: d.completedAt?.toISOString() ?? undefined,
    }
  })

  return { items: entries }
}

// ── Main ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const tab = (request.nextUrl.searchParams.get('tab') || 'your-turn') as TabParam

  if (tab === 'activity') {
    const userId = session?.user?.email
      ? (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null
      : null
    const response = await buildActivityFeed(userId)
    return NextResponse.json(response)
  }

  if (tab === 'results') {
    const userCtx = session?.user?.email ? await getUserContext(session.user.email) : null
    const response = await buildResultsFeed(userCtx)
    return NextResponse.json(response)
  }

  // Default: your-turn tab
  const [deliberations, podiums, userCtx] = await Promise.all([
    getDiscovery(),
    getPodiums(),
    session?.user?.email ? getUserContext(session.user.email) : null,
  ])

  const response = await buildYourTurnFeed(deliberations, podiums, userCtx)
  return NextResponse.json(response)
}
