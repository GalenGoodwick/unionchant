import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processAllTimers } from '@/lib/timer-processor'

// Throttle processExpiredTiers - run at most once every 30 seconds
let lastTimerProcessed = 0

// Global discovery feed cache - same for ALL users, rebuilt every 30s
let globalFeedCache: { items: any[]; champions: Map<string, any>; ts: number } | null = null
const GLOBAL_FEED_TTL = 30000 // 30 seconds

// Per-user feed cache - stores final merged response
const userFeedCache = new Map<string, { data: any; ts: number }>()
const USER_FEED_TTL = 5000 // 5 seconds

export type FeedItemType =
  | 'vote_now'
  | 'join_voting'
  | 'predict'
  | 'submit_ideas'
  | 'challenge'
  | 'champion'

export type FeedItem = {
  type: FeedItemType
  priority: number
  deliberation: {
    id: string
    question: string
    description: string | null
    organization: string | null
    phase: string
    currentTier: number
    challengeRound: number
    createdAt: Date
    views: number
    _count: { members: number; ideas: number }
    creator?: { id: string; name: string }
  }
  community?: { name: string; slug: string } | null
  // Type-specific data
  cell?: {
    id: string
    tier: number
    status: string
    votingDeadline: string | null
    spotsRemaining: number
    ideas: { id: string; text: string; author: string }[]
    participantCount: number
    votedCount: number
    userHasVoted?: boolean
    userVotedIdeaId?: string | null
    // Urgency indicators
    urgency?: 'critical' | 'warning' | 'normal'
    timeRemainingMs?: number
    votesNeeded?: number
  }
  tierInfo?: {
    tier: number
    totalCells: number
    votingProgress: number
    ideas: { id: string; text: string }[]
    spotsRemaining: number
    cells?: { id: string; ideas?: { id: string; text: string }[] }[]
  }
  champion?: {
    id: string
    text: string
    author: string
    totalVotes: number
  }
  submissionDeadline?: string | null
  challengersCount?: number
  userPredictions?: Record<number, string> // tier -> predictedIdeaId
  userSubmittedIdea?: { id: string; text: string } | null
  resolvedAt?: string | null
  votingTrigger?: {
    type: 'timer' | 'idea_goal' | 'manual'
    ideaGoal?: number | null
    currentIdeas: number
    currentParticipants: number
  }
}

/** Check if feed items have meaningfully changed (for incremental updates) */
function hasFeedChanged(prev: FeedItem[], next: FeedItem[]): boolean {
  if (prev.length !== next.length) return true
  const prevMap = new Map(prev.map(i => [`${i.type}-${i.deliberation.id}-${i.cell?.id || ''}`, i]))
  for (const item of next) {
    const key = `${item.type}-${item.deliberation.id}-${item.cell?.id || ''}`
    const old = prevMap.get(key)
    if (!old) return true // new item
    if (item.cell?.votedCount !== old.cell?.votedCount) return true
    if (item.cell?.status !== old.cell?.status) return true
    if (item.cell?.userHasVoted !== old.cell?.userHasVoted) return true
    if (item.deliberation._count.ideas !== old.deliberation._count.ideas) return true
  }
  return false
}

// GET /api/feed - Get personalized feed
export async function GET(req: NextRequest) {
  try {
    // Process all timers in background, throttled to once per 30s
    const ts = Date.now()
    if (ts - lastTimerProcessed > 30000) {
      lastTimerProcessed = ts
      processAllTimers('feed_api').catch(err => {
        console.error('Error processing timers:', err)
      })
    }

    const session = await getServerSession(authOptions)
    const filterType = req.nextUrl.searchParams.get('filter') // 'following' or null
    const sinceParam = req.nextUrl.searchParams.get('since')
    const sinceTs = sinceParam ? parseInt(sinceParam, 10) : null

    // Get user if logged in
    let userId: string | null = null
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
      userId = user?.id || null
    }

    // Check per-user cache first (5s TTL)
    const cacheKey = `${userId || 'anon'}|${filterType || 'all'}`
    const userCached = userFeedCache.get(cacheKey)
    if (userCached && (ts - userCached.ts) < USER_FEED_TTL) {
      // If client sent since and cache hasn't changed, return unchanged
      if (sinceTs && userCached.ts <= sinceTs) {
        return NextResponse.json({ items: [], unchanged: true, ts: userCached.ts })
      }
      return NextResponse.json({ ...userCached.data, ts: userCached.ts })
    }

    // --- GLOBAL DISCOVERY FEED (shared across all users, 30s cache) ---
    if (!globalFeedCache || (ts - globalFeedCache.ts) > GLOBAL_FEED_TTL) {
      const [votingDelibs, submissionDelibs, accumulatingDelibs, challengeDelibs] = await Promise.all([
        prisma.deliberation.findMany({
          where: { phase: 'VOTING', isPublic: true,  },
          include: {
            _count: { select: { members: true, ideas: true } },
            community: { select: { name: true, slug: true } },
            creator: { select: { id: true, name: true } },
            cells: {
              where: { status: 'VOTING' },
              select: {
                id: true,
                status: true,
                ideas: { select: { idea: { select: { id: true, text: true } } } },
                _count: { select: { participants: true } },
              },
              take: 3,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        prisma.deliberation.findMany({
          where: { phase: 'SUBMISSION', isPublic: true,  },
          select: {
            id: true, question: true, description: true, organization: true,
            phase: true, currentTier: true, challengeRound: true, createdAt: true,
            views: true, submissionEndsAt: true, ideaGoal: true,
            _count: { select: { members: true, ideas: true } },
            community: { select: { name: true, slug: true } },
            creator: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.deliberation.findMany({
          where: { phase: 'ACCUMULATING', isPublic: true,  },
          include: {
            _count: { select: { members: true, ideas: true } },
            community: { select: { name: true, slug: true } },
            creator: { select: { id: true, name: true } },
            ideas: {
              where: { status: 'WINNER' },
              include: { author: { select: { name: true } } },
              take: 1,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.deliberation.findMany({
          where: { phase: 'VOTING', challengeRound: { gt: 0 }, isPublic: true,  },
          include: {
            _count: { select: { members: true, ideas: true } },
            community: { select: { name: true, slug: true } },
            creator: { select: { id: true, name: true } },
            ideas: {
              where: { status: 'DEFENDING' },
              include: { author: { select: { name: true } } },
              take: 1,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ])

      // Pre-fetch champions for challenge deliberations
      const challengeDelibIds = votingDelibs.filter(d => d.challengeRound > 0).map(d => d.id)
      const challengeChampions = challengeDelibIds.length > 0
        ? await prisma.idea.findMany({
            where: {
              deliberationId: { in: challengeDelibIds },
              OR: [{ status: 'DEFENDING' }, { isChampion: true }],
            },
            include: { author: { select: { name: true } } },
          })
        : []

      // Build discovery items
      const discoveryItems: FeedItem[] = []
      const championByDelib = new Map(challengeChampions.map(c => [c.deliberationId, c] as const))

      // Voting deliberations
      for (const delib of votingDelibs) {
        const votingCells = delib.cells.filter(c => c.status === 'VOTING')
        if (votingCells.length === 0) continue
        const ideas = votingCells[0]?.ideas.map(ci => ({ id: ci.idea.id, text: ci.idea.text })) || []
        if (ideas.length === 0) continue
        const totalSpots = votingCells.reduce((sum, c) => sum + (5 - c._count.participants), 0)
        const votingProgress = votingCells.length > 0 ?
          Math.round((votingCells.filter(c => c.status === 'COMPLETED').length / votingCells.length) * 100) : 0
        const isChallenge = delib.challengeRound > 0

        if (isChallenge) {
          const champion = championByDelib.get(delib.id) || null
          discoveryItems.push({
            type: 'challenge', priority: 70,
            deliberation: {
              id: delib.id, question: delib.question, description: delib.description,
              organization: delib.organization, phase: delib.phase, currentTier: delib.currentTier,
              challengeRound: delib.challengeRound, createdAt: delib.createdAt,
              views: delib.views || 0, _count: delib._count,
              creator: delib.creator ? { id: delib.creator.id, name: delib.creator.name || 'Anonymous' } : undefined,
            },
            community: delib.community || null,
            champion: champion ? { id: champion.id, text: champion.text, author: champion.author?.name || 'Anonymous', totalVotes: champion.totalVotes } : undefined,
            tierInfo: { tier: delib.currentTier, totalCells: votingCells.length, votingProgress, ideas, spotsRemaining: totalSpots,
              cells: votingCells.map(c => ({ id: c.id, ideas: c.ideas.map(ci => ({ id: ci.idea.id, text: ci.idea.text })) })),
            },
          })
        } else {
          discoveryItems.push({
            type: 'join_voting', priority: 75,
            deliberation: {
              id: delib.id, question: delib.question, description: delib.description,
              organization: delib.organization, phase: delib.phase, currentTier: delib.currentTier,
              challengeRound: delib.challengeRound, createdAt: delib.createdAt,
              views: delib.views || 0, _count: delib._count,
              creator: delib.creator ? { id: delib.creator.id, name: delib.creator.name || 'Anonymous' } : undefined,
            },
            community: delib.community || null,
            tierInfo: { tier: delib.currentTier, totalCells: votingCells.length, votingProgress, ideas, spotsRemaining: totalSpots,
              cells: votingCells.map(c => ({ id: c.id, ideas: c.ideas.map(ci => ({ id: ci.idea.id, text: ci.idea.text })) })),
            },
          })
        }
      }

      // Submission deliberations
      for (const delib of submissionDelibs) {
        discoveryItems.push({
          type: 'submit_ideas', priority: 60,
          deliberation: {
            id: delib.id, question: delib.question, description: delib.description,
            organization: delib.organization, phase: delib.phase, currentTier: delib.currentTier,
            challengeRound: delib.challengeRound, createdAt: delib.createdAt,
            views: delib.views || 0, _count: delib._count,
            creator: (delib as any).creator ? { id: (delib as any).creator.id, name: (delib as any).creator.name || 'Anonymous' } : undefined,
          },
          community: delib.community || null,
          submissionDeadline: delib.submissionEndsAt?.toISOString() || null,
          votingTrigger: {
            type: delib.ideaGoal ? 'idea_goal' : delib.submissionEndsAt ? 'timer' : 'manual',
            ideaGoal: delib.ideaGoal, currentIdeas: delib._count.ideas, currentParticipants: delib._count.members,
          },
        })
      }

      // Accumulating deliberations
      const accumDelibIds = accumulatingDelibs.filter(d => d.ideas[0]).map(d => d.id)
      const challengerCounts = accumDelibIds.length > 0
        ? await prisma.idea.groupBy({ by: ['deliberationId'], where: { deliberationId: { in: accumDelibIds }, status: 'PENDING', isNew: true }, _count: true })
        : []
      const challengerCountByDelib = new Map(challengerCounts.map(c => [c.deliberationId, c._count]))

      for (const delib of accumulatingDelibs) {
        const champion = delib.ideas[0]
        if (!champion) continue
        discoveryItems.push({
          type: 'champion', priority: 40,
          deliberation: {
            id: delib.id, question: delib.question, description: delib.description,
            organization: delib.organization, phase: delib.phase, currentTier: delib.currentTier,
            challengeRound: delib.challengeRound, createdAt: delib.createdAt,
            views: delib.views || 0, _count: delib._count,
            creator: delib.creator ? { id: delib.creator.id, name: delib.creator.name || 'Anonymous' } : undefined,
          },
          community: delib.community || null,
          champion: { id: champion.id, text: champion.text, author: champion.author.name || 'Anonymous', totalVotes: champion.totalVotes },
          challengersCount: challengerCountByDelib.get(delib.id) || 0,
        })
      }

      // Challenge deliberations (from query 5)
      for (const delib of challengeDelibs) {
        if (discoveryItems.some(i => i.deliberation.id === delib.id)) continue
        const defender = delib.ideas[0]
        discoveryItems.push({
          type: 'challenge', priority: 70,
          deliberation: {
            id: delib.id, question: delib.question, description: delib.description,
            organization: delib.organization, phase: delib.phase, currentTier: delib.currentTier,
            challengeRound: delib.challengeRound, createdAt: delib.createdAt,
            views: delib.views || 0, _count: delib._count,
            creator: delib.creator ? { id: delib.creator.id, name: delib.creator.name || 'Anonymous' } : undefined,
          },
          community: delib.community || null,
          champion: defender ? { id: defender.id, text: defender.text, author: defender.author.name || 'Anonymous', totalVotes: defender.totalVotes } : undefined,
        })
      }

      globalFeedCache = { items: discoveryItems, champions: championByDelib, ts: Date.now() }
    }

    // --- PER-USER DATA (1-2 fast queries) ---
    const items: FeedItem[] = []

    // User's active cells
    const userCells = userId ? await prisma.cellParticipation.findMany({
      where: {
        userId,
        status: { in: ['ACTIVE', 'VOTED'] },
        cell: { status: { in: ['VOTING', 'COMPLETED'] } },
      },
      include: {
        cell: {
          select: {
            id: true, tier: true, status: true,
            deliberationId: true,
            deliberation: {
              select: {
                id: true, question: true, description: true, organization: true,
                phase: true, currentTier: true, challengeRound: true, createdAt: true,
                views: true, currentTierStartedAt: true, votingTimeoutMs: true,
                _count: { select: { members: true, ideas: true } },
                community: { select: { name: true, slug: true } },
                creator: { select: { id: true, name: true } },
              },
            },
            ideas: {
              select: { idea: { select: { id: true, text: true, author: { select: { name: true } } } } },
            },
            participants: { select: { status: true } },
            votes: { where: { userId: userId! }, select: { ideaId: true }, take: 1 },
          },
        },
      },
    }) : []

    // Extract votes from cells (batched into the query above)
    const votesByCell = new Map(
      userCells
        .filter(cp => cp.cell.votes.length > 0)
        .map(cp => [cp.cell.id, cp.cell.votes[0].ideaId] as const)
    )

    // Process user cells into vote_now items
    const nowMs = Date.now()
    const bestCellByDelib = new Map<string, typeof userCells[number]>()
    for (const cp of userCells) {
      const delibId = cp.cell.deliberation.id
      const existing = bestCellByDelib.get(delibId)
      if (!existing || cp.cell.tier > existing.cell.tier) {
        bestCellByDelib.set(delibId, cp)
      }
    }

    for (const cp of bestCellByDelib.values()) {
      const cell = cp.cell
      const votedCount = cell.participants.filter(p => p.status === 'VOTED').length
      const userHasVoted = cp.status === 'VOTED'
      const votedAt = cp.votedAt
      const isCompleted = cell.status === 'COMPLETED'
      const userVotedIdeaId = votesByCell.get(cell.id) || null
      const deadline = cell.deliberation.currentTierStartedAt
        ? new Date(cell.deliberation.currentTierStartedAt.getTime() + cell.deliberation.votingTimeoutMs)
        : null
      const timeRemainingMs = deadline ? deadline.getTime() - nowMs : null
      if (!isCompleted && deadline && deadline.getTime() < nowMs) continue

      // If deliberation is accumulating and user's cell is done, skip vote_now —
      // the discovery 'champion' card will be used instead for a consistent experience
      if (cell.deliberation.phase === 'ACCUMULATING' && isCompleted && userHasVoted) continue

      const votesNeeded = cell.participants.length - votedCount

      let urgency: 'critical' | 'warning' | 'normal' = 'normal'
      if (timeRemainingMs !== null) {
        if (timeRemainingMs < 10 * 60 * 1000) urgency = 'critical'
        else if (timeRemainingMs < 30 * 60 * 1000) urgency = 'warning'
      }

      items.push({
        type: 'vote_now',
        priority: isCompleted ? 80 : (userHasVoted ? 90 : 100),
        deliberation: {
          id: cell.deliberation.id, question: cell.deliberation.question, description: cell.deliberation.description,
          organization: cell.deliberation.organization, phase: cell.deliberation.phase, currentTier: cell.deliberation.currentTier,
          challengeRound: cell.deliberation.challengeRound, createdAt: cell.deliberation.createdAt,
          views: cell.deliberation.views || 0, _count: cell.deliberation._count,
          creator: cell.deliberation.creator ? { id: cell.deliberation.creator.id, name: cell.deliberation.creator.name || 'Anonymous' } : undefined,
        },
        community: cell.deliberation.community || null,
        cell: {
          id: cell.id, tier: cell.tier, status: cell.status,
          votingDeadline: deadline?.toISOString() || null, spotsRemaining: 0,
          ideas: cell.ideas.map(ci => ({ id: ci.idea.id, text: ci.idea.text, author: ci.idea.author.name || 'Anonymous' })),
          participantCount: cell.participants.length, votedCount, userHasVoted, userVotedIdeaId,
          urgency, timeRemainingMs: timeRemainingMs ?? undefined, votesNeeded,
        },
        resolvedAt: votedAt?.toISOString() || null,
      })
    }

    // Merge: user's vote_now cards + global discovery items (skip duplicates)
    // IMPORTANT: clone discovery items — never mutate the shared global cache
    const userDelibIds = new Set(items.map(i => i.deliberation.id))

    // Also exclude deliberations the user has already joined (even if no active cell yet)
    if (userId) {
      const memberships = await prisma.deliberationMember.findMany({
        where: { userId },
        select: { deliberationId: true },
      })
      for (const m of memberships) userDelibIds.add(m.deliberationId)
    }

    for (const item of globalFeedCache!.items) {
      if (!userDelibIds.has(item.deliberation.id)) {
        items.push({ ...item })
      }
    }

    // Enrich items with user's submitted ideas (lightweight query)
    const allDelibIds = items.map(i => i.deliberation.id)
    if (userId && allDelibIds.length > 0) {
      const userIdeas = await prisma.idea.findMany({
        where: { deliberationId: { in: allDelibIds }, authorId: userId },
        select: { id: true, text: true, deliberationId: true, isNew: true, createdAt: true },
      })
      for (const idea of userIdeas) {
        const item = items.find(i => i.deliberation.id === idea.deliberationId)
        if (item) {
          item.userSubmittedIdea = { id: idea.id, text: idea.text }
          item.resolvedAt = idea.createdAt.toISOString()
        }
      }
    }

    // Sort by: urgency first, then priority, then hot score
    const getHotScore = (item: FeedItem): number => {
      const views = item.deliberation.views || 0
      const members = item.deliberation._count.members || 0
      const ideas = item.deliberation._count.ideas || 0
      const ageHours = (Date.now() - new Date(item.deliberation.createdAt).getTime()) / (1000 * 60 * 60)
      const ageFactor = Math.max(1, Math.sqrt(ageHours))
      return (views + members * 2 + ideas * 3) / ageFactor
    }

    const getUrgencyScore = (item: FeedItem) => {
      if (item.cell?.urgency === 'critical') return 2
      if (item.cell?.urgency === 'warning') return 1
      return 0
    }

    items.sort((a, b) => {
      const aUrgent = a.cell && !a.cell.userHasVoted ? getUrgencyScore(a) : 0
      const bUrgent = b.cell && !b.cell.userHasVoted ? getUrgencyScore(b) : 0
      if (bUrgent !== aUrgent) return bUrgent - aUrgent
      if (b.priority !== a.priority) return b.priority - a.priority
      return getHotScore(b) - getHotScore(a)
    })

    // Filter by following if requested
    let filteredItems = items
    if (filterType === 'following' && userId) {
      const follows = await prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      })
      const followingIds = new Set(follows.map(f => f.followingId))
      filteredItems = items.filter(item =>
        item.deliberation.creator && followingIds.has(item.deliberation.creator.id)
      )
    }

    const nowCacheTs = Date.now()
    const responseData = { items: filteredItems, hasMore: false, ts: nowCacheTs }

    // Cache the response
    userFeedCache.set(cacheKey, { data: responseData, ts: nowCacheTs })
    if (userFeedCache.size > 100) {
      const cutoff = Date.now() - USER_FEED_TTL * 10
      for (const [k, v] of userFeedCache) {
        if (v.ts < cutoff) userFeedCache.delete(k)
      }
    }

    // If client sent since, check if anything meaningfully changed
    if (sinceTs) {
      const prevCached = userCached?.data as { items: FeedItem[] } | undefined
      if (prevCached && !hasFeedChanged(prevCached.items, filteredItems)) {
        return NextResponse.json({ items: [], unchanged: true, ts: nowCacheTs })
      }
    }

    return NextResponse.json(responseData)
  } catch (error) {
    console.error('Error fetching feed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to fetch feed', details: message }, { status: 500 })
  }
}
