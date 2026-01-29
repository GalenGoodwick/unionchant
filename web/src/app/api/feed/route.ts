import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processExpiredTiers } from '@/lib/timer-processor'

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
  }
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
  votingTrigger?: {
    type: 'timer' | 'idea_goal' | 'manual'
    ideaGoal?: number | null
    currentIdeas: number
    currentParticipants: number
  }
}

// GET /api/feed - Get personalized feed
export async function GET(req: NextRequest) {
  try {
    // Process any expired tiers in background (don't block feed loading)
    processExpiredTiers().catch(err => {
      console.error('Error processing expired tiers:', err)
    })

    const session = await getServerSession(authOptions)
    const items: FeedItem[] = []

    // Get user if logged in
    let userId: string | null = null
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
      userId = user?.id || null
    }

    // Run all main queries in parallel
    const [userCells, votingDelibs, submissionDelibs, accumulatingDelibs, challengeDelibs] = await Promise.all([
      // 1. Cells user is in
      userId ? prisma.cellParticipation.findMany({
        where: {
          userId,
          status: { in: ['ACTIVE', 'VOTED'] },
          cell: { status: { in: ['VOTING', 'COMPLETED'] } },
        },
        include: {
          cell: {
            include: {
              deliberation: {
                include: {
                  _count: { select: { members: true, ideas: true } },
                },
              },
              ideas: {
                include: {
                  idea: {
                    select: { id: true, text: true, author: { select: { name: true } } },
                  },
                },
              },
              participants: {
                select: { status: true },
              },
            },
          },
        },
      }) : Promise.resolve([]),

      // 2. Voting phase deliberations
      prisma.deliberation.findMany({
        where: { phase: 'VOTING', isPublic: true },
        include: {
          _count: { select: { members: true, ideas: true } },
          cells: {
            where: { status: 'VOTING' },
            include: {
              ideas: {
                include: { idea: { select: { id: true, text: true } } },
              },
              participants: { select: { id: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),

      // 3. Submission phase deliberations
      prisma.deliberation.findMany({
        where: { phase: 'SUBMISSION', isPublic: true },
        select: {
          id: true, question: true, description: true, organization: true,
          phase: true, currentTier: true, challengeRound: true, createdAt: true,
          views: true, submissionEndsAt: true, ideaGoal: true,
          _count: { select: { members: true, ideas: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // 4. Accumulating phase deliberations
      prisma.deliberation.findMany({
        where: { phase: 'ACCUMULATING', isPublic: true },
        include: {
          _count: { select: { members: true, ideas: true } },
          ideas: {
            where: { status: 'WINNER' },
            include: { author: { select: { name: true } } },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // 5. Challenge round deliberations
      prisma.deliberation.findMany({
        where: { phase: 'VOTING', challengeRound: { gt: 0 }, isPublic: true },
        include: {
          _count: { select: { members: true, ideas: true } },
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

    // Batch fetch user votes for all cells at once (avoid N+1)
    const votedCellIds = userCells
      .filter(cp => cp.status === 'VOTED')
      .map(cp => cp.cell.id)

    const userVotes = votedCellIds.length > 0 && userId
      ? await prisma.vote.findMany({
          where: { cellId: { in: votedCellIds }, userId },
          select: { cellId: true, ideaId: true },
        })
      : []

    const votesByCell = new Map(userVotes.map(v => [v.cellId, v.ideaId]))

    // Process section 1: user cells
    // Deduplicate by deliberation - keep only the highest-tier cell per deliberation
    const now = Date.now()
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
      const isCompleted = cell.status === 'COMPLETED'
      const userVotedIdeaId = votesByCell.get(cell.id) || null

      const deadline = cell.deliberation.currentTierStartedAt
        ? new Date(cell.deliberation.currentTierStartedAt.getTime() + cell.deliberation.votingTimeoutMs)
        : null
      const timeRemainingMs = deadline ? deadline.getTime() - now : null

      // Skip expired voting cells (not yet processed to COMPLETED)
      if (!isCompleted && deadline && deadline.getTime() < now) continue
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
          id: cell.deliberation.id,
          question: cell.deliberation.question,
          description: cell.deliberation.description,
          organization: cell.deliberation.organization,
          phase: cell.deliberation.phase,
          currentTier: cell.deliberation.currentTier,
          challengeRound: cell.deliberation.challengeRound,
          createdAt: cell.deliberation.createdAt,
          views: cell.deliberation.views || 0,
          _count: cell.deliberation._count,
        },
        cell: {
          id: cell.id,
          tier: cell.tier,
          status: cell.status,
          votingDeadline: deadline?.toISOString() || null,
          spotsRemaining: 0,
          ideas: cell.ideas.map(ci => ({
            id: ci.idea.id,
            text: ci.idea.text,
            author: ci.idea.author.name || 'Anonymous',
          })),
          participantCount: cell.participants.length,
          votedCount,
          userHasVoted,
          userVotedIdeaId,
          urgency,
          timeRemainingMs: timeRemainingMs ?? undefined,
          votesNeeded,
        },
      })
    }

    // Collect all deliberation IDs we need user's submitted ideas for (batch query)
    const delibIdsForUserIdeas: string[] = []
    for (const delib of submissionDelibs) delibIdsForUserIdeas.push(delib.id)
    for (const delib of accumulatingDelibs) delibIdsForUserIdeas.push(delib.id)
    for (const delib of challengeDelibs) delibIdsForUserIdeas.push(delib.id)
    // Also check voting delibs for challenge rounds
    for (const delib of votingDelibs) {
      if (delib.challengeRound > 0) delibIdsForUserIdeas.push(delib.id)
    }

    // Batch fetch user's submitted ideas across all deliberations
    const userIdeas = userId && delibIdsForUserIdeas.length > 0
      ? await prisma.idea.findMany({
          where: {
            deliberationId: { in: delibIdsForUserIdeas },
            authorId: userId,
          },
          select: { id: true, text: true, deliberationId: true, isNew: true },
        })
      : []

    const userIdeaByDelib = new Map<string, { id: string; text: string }>()
    const userChallengerByDelib = new Map<string, { id: string; text: string }>()
    for (const idea of userIdeas) {
      if (idea.isNew) {
        userChallengerByDelib.set(idea.deliberationId, { id: idea.id, text: idea.text })
      } else {
        userIdeaByDelib.set(idea.deliberationId, { id: idea.id, text: idea.text })
      }
    }

    // Process section 2: voting deliberations
    for (const delib of votingDelibs) {
      if (items.some(i => i.type === 'vote_now' && i.deliberation.id === delib.id)) continue

      const votingCells = delib.cells.filter(c => c.status === 'VOTING')
      if (votingCells.length === 0) continue

      const ideas = votingCells[0]?.ideas.map(ci => ({
        id: ci.idea.id,
        text: ci.idea.text,
      })) || []
      if (ideas.length === 0) continue

      const totalSpots = votingCells.reduce((sum, c) => sum + (5 - c.participants.length), 0)
      const totalParticipants = votingCells.reduce((sum, c) => sum + c.participants.length, 0)
      const votingProgress = votingCells.length > 0 ?
        Math.round((votingCells.filter(c => c.status === 'COMPLETED').length / votingCells.length) * 100) : 0

      const isChallenge = delib.challengeRound > 0

      if (isChallenge) {
        const champion = await prisma.idea.findFirst({
          where: {
            deliberationId: delib.id,
            OR: [{ status: 'DEFENDING' }, { isChampion: true }],
          },
          include: { author: { select: { name: true } } },
        })

        items.push({
          type: 'challenge',
          priority: 70,
          deliberation: {
            id: delib.id, question: delib.question, description: delib.description,
            organization: delib.organization, phase: delib.phase, currentTier: delib.currentTier,
            challengeRound: delib.challengeRound, createdAt: delib.createdAt,
            views: delib.views || 0, _count: delib._count,
          },
          champion: champion ? {
            id: champion.id, text: champion.text,
            author: champion.author?.name || 'Anonymous', totalVotes: champion.totalVotes,
          } : undefined,
          tierInfo: {
            tier: delib.currentTier, totalCells: votingCells.length, votingProgress, ideas,
            spotsRemaining: totalSpots,
            cells: votingCells.map(c => ({
              id: c.id, ideas: c.ideas.map(ci => ({ id: ci.idea.id, text: ci.idea.text })),
            })),
          },
          userSubmittedIdea: userChallengerByDelib.get(delib.id) || null,
        })
      } else {
        items.push({
          type: 'join_voting',
          priority: 75,
          deliberation: {
            id: delib.id, question: delib.question, description: delib.description,
            organization: delib.organization, phase: delib.phase, currentTier: delib.currentTier,
            challengeRound: delib.challengeRound, createdAt: delib.createdAt,
            views: delib.views || 0, _count: delib._count,
          },
          tierInfo: {
            tier: delib.currentTier, totalCells: votingCells.length, votingProgress, ideas,
            spotsRemaining: totalSpots,
            cells: votingCells.map(c => ({
              id: c.id, ideas: c.ideas.map(ci => ({ id: ci.idea.id, text: ci.idea.text })),
            })),
          },
        })
      }
    }

    // Process section 3: submission deliberations
    for (const delib of submissionDelibs) {
      items.push({
        type: 'submit_ideas',
        priority: 60,
        deliberation: {
          id: delib.id, question: delib.question, description: delib.description,
          organization: delib.organization, phase: delib.phase, currentTier: delib.currentTier,
          challengeRound: delib.challengeRound, createdAt: delib.createdAt,
          views: delib.views || 0, _count: delib._count,
        },
        submissionDeadline: delib.submissionEndsAt?.toISOString() || null,
        votingTrigger: {
          type: delib.ideaGoal ? 'idea_goal' : delib.submissionEndsAt ? 'timer' : 'manual',
          ideaGoal: delib.ideaGoal,
          currentIdeas: delib._count.ideas,
          currentParticipants: delib._count.members,
        },
        userSubmittedIdea: userIdeaByDelib.get(delib.id) || null,
      })
    }

    // Process section 4: accumulating deliberations
    // Batch fetch challenger counts
    const accumDelibIds = accumulatingDelibs.filter(d => d.ideas[0]).map(d => d.id)
    const challengerCounts = accumDelibIds.length > 0
      ? await prisma.idea.groupBy({
          by: ['deliberationId'],
          where: {
            deliberationId: { in: accumDelibIds },
            status: 'PENDING',
            isNew: true,
          },
          _count: true,
        })
      : []
    const challengerCountByDelib = new Map(challengerCounts.map(c => [c.deliberationId, c._count]))

    for (const delib of accumulatingDelibs) {
      const champion = delib.ideas[0]
      if (!champion) continue

      items.push({
        type: 'champion',
        priority: 40,
        deliberation: {
          id: delib.id, question: delib.question, description: delib.description,
          organization: delib.organization, phase: delib.phase, currentTier: delib.currentTier,
          challengeRound: delib.challengeRound, createdAt: delib.createdAt,
          views: delib.views || 0, _count: delib._count,
        },
        champion: {
          id: champion.id, text: champion.text,
          author: champion.author.name || 'Anonymous', totalVotes: champion.totalVotes,
        },
        challengersCount: challengerCountByDelib.get(delib.id) || 0,
        userSubmittedIdea: userChallengerByDelib.get(delib.id) || null,
      })
    }

    // Process section 5: challenge deliberations
    for (const delib of challengeDelibs) {
      if (items.some(i => i.deliberation.id === delib.id)) continue

      const defender = delib.ideas[0]

      items.push({
        type: 'challenge',
        priority: 70,
        deliberation: {
          id: delib.id, question: delib.question, description: delib.description,
          organization: delib.organization, phase: delib.phase, currentTier: delib.currentTier,
          challengeRound: delib.challengeRound, createdAt: delib.createdAt,
          views: delib.views || 0, _count: delib._count,
        },
        champion: defender ? {
          id: defender.id, text: defender.text,
          author: defender.author.name || 'Anonymous', totalVotes: defender.totalVotes,
        } : undefined,
        userSubmittedIdea: userChallengerByDelib.get(delib.id) || null,
      })
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

    return NextResponse.json({
      items,
      hasMore: false,
    })
  } catch (error) {
    console.error('Error fetching feed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to fetch feed', details: message }, { status: 500 })
  }
}
