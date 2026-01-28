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
    console.log('[Feed API] Starting feed request...')

    // Process any expired tiers in background (don't block feed loading)
    processExpiredTiers().catch(err => {
      console.error('Error processing expired tiers:', err)
    })

    const session = await getServerSession(authOptions)
    console.log('[Feed API] Session:', session?.user?.email || 'anonymous')
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

    // 1. Get cells user is in (highest priority - both ACTIVE and VOTED)
    if (userId) {
      const userCells = await prisma.cellParticipation.findMany({
        where: {
          userId: userId,
          status: { in: ['ACTIVE', 'VOTED'] },
          cell: { status: 'VOTING' },
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
      })

      for (const cp of userCells) {
        const cell = cp.cell
        const votedCount = cell.participants.filter(p => p.status === 'VOTED').length
        const userHasVoted = cp.status === 'VOTED'

        // Get user's vote if they voted
        let userVotedIdeaId: string | null = null
        if (userHasVoted && userId) {
          const userVote = await prisma.vote.findFirst({
            where: { cellId: cell.id, userId },
            select: { ideaId: true },
          })
          userVotedIdeaId = userVote?.ideaId || null
        }

        items.push({
          type: 'vote_now',
          priority: userHasVoted ? 90 : 100, // Slightly lower priority if already voted
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
          cell: (() => {
            const deadline = cell.deliberation.currentTierStartedAt
              ? new Date(cell.deliberation.currentTierStartedAt.getTime() + cell.deliberation.votingTimeoutMs)
              : null
            const timeRemainingMs = deadline ? deadline.getTime() - Date.now() : null
            const votesNeeded = cell.participants.length - votedCount

            // Calculate urgency: critical (<10min), warning (<30min), normal
            let urgency: 'critical' | 'warning' | 'normal' = 'normal'
            if (timeRemainingMs !== null) {
              if (timeRemainingMs < 10 * 60 * 1000) urgency = 'critical'
              else if (timeRemainingMs < 30 * 60 * 1000) urgency = 'warning'
            }

            return {
              id: cell.id,
              tier: cell.tier,
              status: cell.status,
              votingDeadline: deadline?.toISOString() || null,
              spotsRemaining: 0, // Already in cell
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
            }
          })(),
        })
      }
    }

    // 2. Get deliberations in VOTING phase for predictions
    const votingDeliberations = await prisma.deliberation.findMany({
      where: {
        phase: 'VOTING',
        isPublic: true,
      },
      include: {
        _count: { select: { members: true, ideas: true } },
        cells: {
          where: { status: 'VOTING' },
          include: {
            ideas: {
              include: {
                idea: { select: { id: true, text: true } },
              },
            },
            participants: { select: { id: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    for (const delib of votingDeliberations) {
      // Skip if user already has a vote_now card for this
      if (items.some(i => i.type === 'vote_now' && i.deliberation.id === delib.id)) {
        continue
      }

      // Calculate spots remaining across all voting cells
      const votingCells = delib.cells.filter(c => c.status === 'VOTING')

      // Skip if no voting cells
      if (votingCells.length === 0) {
        continue
      }

      const totalSpots = votingCells.reduce((sum, c) => sum + (5 - c.participants.length), 0)

      // Get unique ideas from first cell (for batches they're the same)
      const ideas = votingCells[0]?.ideas.map(ci => ({
        id: ci.idea.id,
        text: ci.idea.text,
      })) || []

      // Skip if no ideas to show
      if (ideas.length === 0) {
        continue
      }

      const totalParticipants = votingCells.reduce((sum, c) => sum + c.participants.length, 0)
      const expectedVotes = totalParticipants
      // We'd need to count actual votes - simplified for now
      const votingProgress = votingCells.length > 0 ?
        Math.round((votingCells.filter(c => c.status === 'COMPLETED').length / votingCells.length) * 100) : 0

      // Determine if this is a challenge round or regular voting
      const isChallenge = delib.challengeRound > 0

      if (isChallenge) {
        // Get defending champion
        const champion = await prisma.idea.findFirst({
          where: {
            deliberationId: delib.id,
            OR: [{ status: 'DEFENDING' }, { isChampion: true }],
          },
          include: { author: { select: { name: true } } },
        })

        // Check if user has already submitted a challenger
        let userSubmittedIdea: { id: string; text: string } | null = null
        if (userId) {
          const existingChallenger = await prisma.idea.findFirst({
            where: { deliberationId: delib.id, authorId: userId, isNew: true },
            select: { id: true, text: true },
          })
          if (existingChallenger) {
            userSubmittedIdea = { id: existingChallenger.id, text: existingChallenger.text }
          }
        }

        items.push({
          type: 'challenge',
          priority: 70,
          deliberation: {
            id: delib.id,
            question: delib.question,
            description: delib.description,
            organization: delib.organization,
            phase: delib.phase,
            currentTier: delib.currentTier,
            challengeRound: delib.challengeRound,
            createdAt: delib.createdAt,
            views: delib.views || 0,
            _count: delib._count,
          },
          champion: champion ? {
            id: champion.id,
            text: champion.text,
            author: champion.author?.name || 'Anonymous',
            totalVotes: champion.totalVotes,
          } : undefined,
          tierInfo: {
            tier: delib.currentTier,
            totalCells: votingCells.length,
            votingProgress,
            ideas,
            spotsRemaining: totalSpots,
            cells: votingCells.map(c => ({
              id: c.id,
              ideas: c.ideas.map(ci => ({ id: ci.idea.id, text: ci.idea.text })),
            })),
          },
          userSubmittedIdea,
        })
      } else {
        // Regular voting (not challenge) - show join_voting card
        items.push({
          type: 'join_voting',
          priority: 75, // Between vote_now (100) and challenge (70)
          deliberation: {
            id: delib.id,
            question: delib.question,
            description: delib.description,
            organization: delib.organization,
            phase: delib.phase,
            currentTier: delib.currentTier,
            challengeRound: delib.challengeRound,
            createdAt: delib.createdAt,
            views: delib.views || 0,
            _count: delib._count,
          },
          tierInfo: {
            tier: delib.currentTier,
            totalCells: votingCells.length,
            votingProgress,
            ideas,
            spotsRemaining: totalSpots,
            cells: votingCells.map(c => ({
              id: c.id,
              ideas: c.ideas.map(ci => ({ id: ci.idea.id, text: ci.idea.text })),
            })),
          },
        })
      }
    }

    // 3. Get deliberations in SUBMISSION phase
    const submissionDeliberations = await prisma.deliberation.findMany({
      where: {
        phase: 'SUBMISSION',
        isPublic: true,
      },
      select: {
        id: true,
        question: true,
        description: true,
        organization: true,
        phase: true,
        currentTier: true,
        challengeRound: true,
        createdAt: true,
        views: true,
        submissionEndsAt: true,
        ideaGoal: true,
        participantGoal: true,
        _count: { select: { members: true, ideas: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    for (const delib of submissionDeliberations) {
      // Check if user has already submitted an idea
      let userSubmittedIdea: { id: string; text: string } | null = null
      if (userId) {
        const existingIdea = await prisma.idea.findFirst({
          where: { deliberationId: delib.id, authorId: userId },
          select: { id: true, text: true },
        })
        if (existingIdea) {
          userSubmittedIdea = { id: existingIdea.id, text: existingIdea.text }
        }
      }

      items.push({
        type: 'submit_ideas',
        priority: 60,
        deliberation: {
          id: delib.id,
          question: delib.question,
          description: delib.description,
          organization: delib.organization,
          phase: delib.phase,
          currentTier: delib.currentTier,
          challengeRound: delib.challengeRound,
          createdAt: delib.createdAt,
          views: delib.views || 0,
          _count: delib._count,
        },
        submissionDeadline: delib.submissionEndsAt?.toISOString() || null,
        votingTrigger: {
          type: delib.ideaGoal ? 'idea_goal' : delib.submissionEndsAt ? 'timer' : 'manual',
          ideaGoal: delib.ideaGoal,
          currentIdeas: delib._count.ideas,
          currentParticipants: delib._count.members,
        },
        userSubmittedIdea,
      })
    }

    // 4. Get deliberations in ACCUMULATING phase (has champion, accepting challengers)
    const accumulatingDeliberations = await prisma.deliberation.findMany({
      where: {
        phase: 'ACCUMULATING',
        isPublic: true,
      },
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
    })

    for (const delib of accumulatingDeliberations) {
      const champion = delib.ideas[0]

      // Skip if no champion to show
      if (!champion) {
        continue
      }

      // Count pending challengers
      const challengersCount = await prisma.idea.count({
        where: {
          deliberationId: delib.id,
          status: 'PENDING',
          isNew: true,
        },
      })

      // Check if user has already submitted a challenger
      let userSubmittedIdea: { id: string; text: string } | null = null
      if (userId) {
        const existingChallenger = await prisma.idea.findFirst({
          where: { deliberationId: delib.id, authorId: userId, isNew: true },
          select: { id: true, text: true },
        })
        if (existingChallenger) {
          userSubmittedIdea = { id: existingChallenger.id, text: existingChallenger.text }
        }
      }

      items.push({
        type: 'champion',
        priority: 40,
        deliberation: {
          id: delib.id,
          question: delib.question,
          description: delib.description,
          organization: delib.organization,
          phase: delib.phase,
          currentTier: delib.currentTier,
          challengeRound: delib.challengeRound,
          createdAt: delib.createdAt,
          views: delib.views || 0,
          _count: delib._count,
        },
        champion: {
          id: champion.id,
          text: champion.text,
          author: champion.author.name || 'Anonymous',
          totalVotes: champion.totalVotes,
        },
        challengersCount,
        userSubmittedIdea,
      })
    }

    // 5. Get active challenge rounds
    const challengeDeliberations = await prisma.deliberation.findMany({
      where: {
        phase: 'VOTING',
        challengeRound: { gt: 0 },
        isPublic: true,
      },
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
    })

    for (const delib of challengeDeliberations) {
      // Skip if already have a vote_now or predict card
      if (items.some(i => i.deliberation.id === delib.id)) continue

      const defender = delib.ideas[0]

      // Check if user has already submitted a challenger
      let userSubmittedIdea: { id: string; text: string } | null = null
      if (userId) {
        const existingChallenger = await prisma.idea.findFirst({
          where: { deliberationId: delib.id, authorId: userId, isNew: true },
          select: { id: true, text: true },
        })
        if (existingChallenger) {
          userSubmittedIdea = { id: existingChallenger.id, text: existingChallenger.text }
        }
      }

      items.push({
        type: 'challenge',
        priority: 70,
        deliberation: {
          id: delib.id,
          question: delib.question,
          description: delib.description,
          organization: delib.organization,
          phase: delib.phase,
          currentTier: delib.currentTier,
          challengeRound: delib.challengeRound,
          createdAt: delib.createdAt,
          views: delib.views || 0,
          _count: delib._count,
        },
        champion: defender ? {
          id: defender.id,
          text: defender.text,
          author: defender.author.name || 'Anonymous',
          totalVotes: defender.totalVotes,
        } : undefined,
        userSubmittedIdea,
      })
    }

    // Calculate "hot" score for each item
    // Score = (views + members*2 + ideas*3) / age^0.5
    // Higher activity = higher score, older = lower score
    const getHotScore = (item: FeedItem): number => {
      const views = item.deliberation.views || 0
      const members = item.deliberation._count.members || 0
      const ideas = item.deliberation._count.ideas || 0
      const ageHours = (Date.now() - new Date(item.deliberation.createdAt).getTime()) / (1000 * 60 * 60)
      const ageFactor = Math.max(1, Math.sqrt(ageHours))
      return (views + members * 2 + ideas * 3) / ageFactor
    }

    // Urgency score: critical=2, warning=1, normal=0
    const getUrgencyScore = (item: FeedItem) => {
      if (item.cell?.urgency === 'critical') return 2
      if (item.cell?.urgency === 'warning') return 1
      return 0
    }

    // Sort by: urgency first (critical cells bubble up), then priority, then hot score
    items.sort((a, b) => {
      // Urgent cells that user hasn't voted in come first
      const aUrgent = a.cell && !a.cell.userHasVoted ? getUrgencyScore(a) : 0
      const bUrgent = b.cell && !b.cell.userHasVoted ? getUrgencyScore(b) : 0
      if (bUrgent !== aUrgent) return bUrgent - aUrgent

      // Then by priority
      if (b.priority !== a.priority) return b.priority - a.priority

      // Then by hot score
      return getHotScore(b) - getHotScore(a)
    })

    return NextResponse.json({
      items,
      hasMore: false, // Pagination not implemented yet
    })
  } catch (error) {
    console.error('Error fetching feed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to fetch feed', details: message }, { status: 500 })
  }
}
