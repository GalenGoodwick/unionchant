import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { ActivityItem } from '@/types/feed'

// Global cache — shared across all users, rebuilt every 30s
let activityCache: { items: ActivityItem[]; ts: number } | null = null
const CACHE_TTL = 30000

export async function GET() {
  try {
    const now = Date.now()

    if (activityCache && now - activityCache.ts < CACHE_TTL) {
      return NextResponse.json({ items: activityCache.items })
    }

    const nowDate = new Date()
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000)
    const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000)

    const [
      votingActiveDelibs,
      challengeRounds,
      newDelibs,
      completedTiers,
      statsData,
    ] = await Promise.all([
      // Voting-active deliberations with voter counts
      prisma.deliberation.findMany({
        where: { phase: 'VOTING', isPublic: true },
        select: {
          id: true,
          question: true,
          currentTier: true,
          challengeRound: true,
          phase: true,
          community: { select: { name: true, slug: true } },
          cells: {
            where: { status: 'VOTING' },
            select: {
              participants: { where: { status: { in: ['ACTIVE', 'VOTED'] } }, select: { id: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),

      // Recently started challenge rounds (24h)
      prisma.deliberation.findMany({
        where: {
          phase: 'VOTING',
          challengeRound: { gt: 0 },
          isPublic: true,
          currentTierStartedAt: { gte: twentyFourHoursAgo },
        },
        select: {
          id: true,
          question: true,
          currentTier: true,
          challengeRound: true,
          phase: true,
          community: { select: { name: true, slug: true } },
        },
        orderBy: { currentTierStartedAt: 'desc' },
        take: 5,
      }),

      // New public deliberations (48h)
      prisma.deliberation.findMany({
        where: {
          isPublic: true,
          createdAt: { gte: fortyEightHoursAgo },
        },
        select: {
          id: true,
          question: true,
          currentTier: true,
          challengeRound: true,
          phase: true,
          createdAt: true,
          community: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // Recently completed tiers (24h) — cells completed in last 24h, grouped by delib+tier
      prisma.cell.findMany({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: twentyFourHoursAgo },
        },
        select: {
          tier: true,
          completedAt: true,
          deliberation: {
            select: {
              id: true,
              question: true,
              currentTier: true,
              challengeRound: true,
              phase: true,
              community: { select: { name: true, slug: true } },
            },
          },
          ideas: {
            select: {
              idea: { select: { status: true } },
            },
          },
        },
        orderBy: { completedAt: 'desc' },
        take: 50,
      }),

      // Platform stats
      Promise.all([
        // Active voters (users who voted in last 24h)
        prisma.vote.findMany({
          where: { votedAt: { gte: twentyFourHoursAgo } },
          select: { userId: true },
          distinct: ['userId'],
        }),
        // In-progress deliberations
        prisma.deliberation.count({
          where: { phase: { in: ['VOTING', 'SUBMISSION', 'ACCUMULATING'] }, isPublic: true },
        }),
        // Ideas submitted today
        prisma.idea.count({
          where: { createdAt: { gte: twentyFourHoursAgo } },
        }),
        // Votes cast today
        prisma.vote.count({
          where: { votedAt: { gte: twentyFourHoursAgo } },
        }),
      ]),
    ])

    const items: ActivityItem[] = []

    // Platform stats card (always first)
    const [activeVotersList, inProgressDelibs, ideasToday, votesToday] = statsData
    items.push({
      type: 'platform_stats',
      id: 'stats',
      timestamp: nowDate.toISOString(),
      stats: {
        activeVoters: activeVotersList.length,
        inProgressDelibs,
        ideasToday,
        votesToday,
      },
    })

    // Voting-active items
    for (const d of votingActiveDelibs) {
      const voterCount = d.cells.reduce((sum, c) => sum + c.participants.length, 0)
      if (voterCount === 0) continue
      items.push({
        type: 'voting_active',
        id: `voting-${d.id}`,
        timestamp: nowDate.toISOString(),
        deliberation: {
          id: d.id,
          question: d.question,
          currentTier: d.currentTier,
          challengeRound: d.challengeRound,
          phase: d.phase,
          community: d.community,
        },
        voterCount,
        tier: d.currentTier,
      })
    }

    // Challenge rounds
    for (const d of challengeRounds) {
      // Skip if already added as voting_active
      if (items.some(i => i.id === `voting-${d.id}`)) continue
      items.push({
        type: 'challenge_started',
        id: `challenge-${d.id}`,
        timestamp: nowDate.toISOString(),
        deliberation: {
          id: d.id,
          question: d.question,
          currentTier: d.currentTier,
          challengeRound: d.challengeRound,
          phase: d.phase,
          community: d.community,
        },
        challengeRound: d.challengeRound,
      })
    }

    // New deliberations
    for (const d of newDelibs) {
      items.push({
        type: 'new_deliberation',
        id: `new-${d.id}`,
        timestamp: d.createdAt.toISOString(),
        deliberation: {
          id: d.id,
          question: d.question,
          currentTier: d.currentTier,
          challengeRound: d.challengeRound,
          phase: d.phase,
          community: d.community,
        },
      })
    }

    // Tier completions — group by deliberation+tier
    const tierGroups = new Map<string, { delib: typeof completedTiers[0]['deliberation']; tier: number; count: number; advancing: number; latestAt: Date }>()
    for (const cell of completedTiers) {
      const key = `${cell.deliberation.id}-tier${cell.tier}`
      const existing = tierGroups.get(key)
      const advancingInCell = cell.ideas.filter(ci => ci.idea.status === 'ADVANCING' || ci.idea.status === 'WINNER').length
      if (existing) {
        existing.count++
        existing.advancing += advancingInCell
        if (cell.completedAt && cell.completedAt > existing.latestAt) {
          existing.latestAt = cell.completedAt
        }
      } else {
        tierGroups.set(key, {
          delib: cell.deliberation,
          tier: cell.tier,
          count: 1,
          advancing: advancingInCell,
          latestAt: cell.completedAt || nowDate,
        })
      }
    }

    for (const [key, group] of tierGroups) {
      items.push({
        type: 'tier_completed',
        id: `tier-${key}`,
        timestamp: group.latestAt.toISOString(),
        deliberation: {
          id: group.delib.id,
          question: group.delib.question,
          currentTier: group.delib.currentTier,
          challengeRound: group.delib.challengeRound,
          phase: group.delib.phase,
          community: group.delib.community,
        },
        completedTier: group.tier,
        advancingCount: group.advancing,
      })
    }

    activityCache = { items, ts: now }
    return NextResponse.json({ items })
  } catch (error) {
    console.error('Error fetching activity feed:', error)
    return NextResponse.json({ error: 'Failed to fetch activity feed' }, { status: 500 })
  }
}
