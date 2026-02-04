import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { getCachedPodiums, setCachedPodiums } from '@/lib/podium-cache'

// ── Caches ─────────────────────────────────────────────────────
let discoveryCache: { data: any[]; ts: number } | null = null
const DISCOVERY_TTL = 30_000

// Per-user+tab response cache (TTL matched to client polling intervals)
const responseCache = new Map<string, { data: FeedResponse; ts: number }>()
const RESPONSE_TTL: Record<TabParam, number> = {
  'your-turn': 15_000,  // polls every 15s
  'activity':  30_000,  // polls every 30s
  'results':   60_000,  // polls every 60s
}
const MAX_CACHE_ENTRIES = 500

function getCachedResponse(key: string, tab: TabParam): FeedResponse | null {
  const entry = responseCache.get(key)
  if (entry && Date.now() - entry.ts < RESPONSE_TTL[tab]) return entry.data
  if (entry) responseCache.delete(key)
  return null
}

function setCachedResponse(key: string, data: FeedResponse) {
  // Evict oldest entries if cache grows too large
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value
    if (oldest) responseCache.delete(oldest)
  }
  responseCache.set(key, { data, ts: Date.now() })
}

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
    upvoteCount?: number
    userUpvoted?: boolean
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
      continuousFlow: true,
      submissionEndsAt: true,
      votingTimeoutMs: true,
      currentTierStartedAt: true,
      completedAt: true,
      upvoteCount: true,
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
      deliberationId: true,
      deliberation: { select: { id: true, question: true } },
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
  upvotedDelibIds: Set<string>
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
        where: { status: { in: ['SUBMITTED', 'ADVANCING', 'WINNER', 'IN_VOTING'] } },
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

  // Get user's active upvotes (not expired)
  const upvoteCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const userUpvotes = await prisma.deliberationUpvote.findMany({
    where: { userId: user.id, createdAt: { gte: upvoteCutoff } },
    select: { deliberationId: true },
  })
  const upvotedDelibIds = new Set(userUpvotes.map(u => u.deliberationId))

  return { id: user.id, memberDelibIds, cellsByDelib, ideaByDelib, extraVoteEligible, upvotedDelibIds }
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
        upvoteCount: d.upvoteCount ?? 0,
        userUpvoted: userCtx?.upvotedDelibIds.has(d.id) ?? false,
      },
      cell,
      champion,
      myIdea,
    }

    // Idea submission open: show submit card alongside vote cards
    // Must come BEFORE continue statements so it's not skipped
    if (d.continuousFlow && d.phase === 'VOTING') {
      if (d.currentTier === 1 && !myIdea) {
        entries.push({ kind: 'submit', id: `submit-cf-${d.id}`, priority: 60, ...base })
      } else if (d.currentTier > 1) {
        entries.push({ kind: 'champion', id: `champ-cf-${d.id}`, priority: 40, ...base })
      }
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
      deliberationId: p.deliberationId || null,
      deliberationQuestion: p.deliberation?.question || null,
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
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Run pulse stats queries in parallel
  const [activeVoters, inProgress, ideasToday, votesToday] = await Promise.all([
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
  ])

  // User action queries — run in parallel, each wrapped so one failure doesn't break the feed
  let userVotes: any[] = []
  let userIdeas: any[] = []
  let userComments: any[] = []
  let userJoins: any[] = []

  if (userId) {
    const results = await Promise.allSettled([
      prisma.vote.findMany({
        where: { userId, votedAt: { gte: last7d } },
        select: {
          id: true,
          votedAt: true,
          cell: {
            select: {
              id: true,
              tier: true,
              deliberation: { select: { id: true, question: true } },
            },
          },
        },
        orderBy: { votedAt: 'desc' },
        distinct: ['cellId'],
        take: 15,
      }),
      prisma.idea.findMany({
        where: { authorId: userId, createdAt: { gte: last7d } },
        select: {
          id: true,
          text: true,
          createdAt: true,
          deliberation: { select: { id: true, question: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      prisma.comment.findMany({
        where: { userId, createdAt: { gte: last7d } },
        select: {
          id: true,
          text: true,
          createdAt: true,
          cell: {
            select: {
              tier: true,
              deliberation: { select: { id: true, question: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      prisma.deliberationMember.findMany({
        where: { userId, joinedAt: { gte: last7d } },
        select: {
          id: true,
          joinedAt: true,
          deliberation: { select: { id: true, question: true } },
        },
        orderBy: { joinedAt: 'desc' },
        take: 15,
      }),
    ])
    userVotes = results[0].status === 'fulfilled' ? results[0].value : []
    userIdeas = results[1].status === 'fulfilled' ? results[1].value : []
    userComments = results[2].status === 'fulfilled' ? results[2].value : []
    userJoins = results[3].status === 'fulfilled' ? results[3].value : []

    for (const r of results) {
      if (r.status === 'rejected') console.error('Activity query failed:', r.reason)
    }
  }

  const pulse: PulseStats = { activeVoters, inProgress, ideasToday, votesToday }

  const activity: ActivityItem[] = []

  // User's own votes
  for (const v of userVotes as any[]) {
    const q = v.cell?.deliberation?.question
    if (!q) continue
    activity.push({
      id: `vote-${v.id}`,
      type: 'USER_VOTED',
      title: `You voted in Tier ${v.cell.tier}`,
      body: q.length > 80 ? q.slice(0, 80) + '...' : q,
      deliberationId: v.cell.deliberation.id,
      createdAt: v.votedAt.toISOString(),
    })
  }

  // User's own ideas
  for (const idea of userIdeas as any[]) {
    activity.push({
      id: `idea-${idea.id}`,
      type: 'USER_SUBMITTED_IDEA',
      title: 'You submitted an idea',
      body: idea.text.length > 80 ? idea.text.slice(0, 80) + '...' : idea.text,
      deliberationId: idea.deliberation.id,
      createdAt: idea.createdAt.toISOString(),
    })
  }

  // User's own comments
  for (const c of userComments as any[]) {
    const q = c.cell?.deliberation?.question
    if (!q) continue
    activity.push({
      id: `comment-${c.id}`,
      type: 'USER_COMMENTED',
      title: `You commented in Tier ${c.cell.tier}`,
      body: c.text.length > 80 ? c.text.slice(0, 80) + '...' : c.text,
      deliberationId: c.cell.deliberation.id,
      createdAt: c.createdAt.toISOString(),
    })
  }

  // User's own joins
  for (const j of userJoins as any[]) {
    activity.push({
      id: `join-${j.id}`,
      type: 'USER_JOINED',
      title: 'You joined a talk',
      body: j.deliberation.question.length > 80 ? j.deliberation.question.slice(0, 80) + '...' : j.deliberation.question,
      deliberationId: j.deliberation.id,
      createdAt: j.joinedAt.toISOString(),
    })
  }

  // Sort all activity by date descending
  activity.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // Limit to 30 items
  activity.splice(30)

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
      upvoteCount: true,
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
        upvoteCount: d.upvoteCount ?? 0,
        userUpvoted: userCtx?.upvotedDelibIds.has(d.id) ?? false,
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
  const cacheKey = `${session?.user?.email || 'anon'}:${tab}`

  // Return cached response if fresh (TTL matched to tab's polling interval)
  const cached = getCachedResponse(cacheKey, tab)
  if (cached) return NextResponse.json(cached)

  let response: FeedResponse

  if (tab === 'activity') {
    const userId = session?.user?.email
      ? (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id ?? null
      : null
    response = await buildActivityFeed(userId)
  } else if (tab === 'results') {
    const userCtx = session?.user?.email ? await getUserContext(session.user.email) : null
    response = await buildResultsFeed(userCtx)
  } else {
    // Default: your-turn tab
    const [deliberations, podiums, userCtx] = await Promise.all([
      getDiscovery(),
      getPodiums(),
      session?.user?.email ? getUserContext(session.user.email) : null,
    ])
    response = await buildYourTurnFeed(deliberations, podiums, userCtx)
  }

  setCachedResponse(cacheKey, response)
  return NextResponse.json(response)
}
