import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { ResultItem } from '@/types/feed'

// Global cache for public results (30s)
let globalResultsCache: { items: ResultItem[]; ts: number } | null = null
const GLOBAL_TTL = 30000

// Per-user cache for personal items (5s)
const userResultsCache = new Map<string, { items: ResultItem[]; ts: number }>()
const USER_TTL = 5000

export async function GET() {
  try {
    const now = Date.now()
    const session = await getServerSession(authOptions)

    let userId: string | null = null
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
      userId = user?.id || null
    }

    // Build global results if stale
    if (!globalResultsCache || now - globalResultsCache.ts > GLOBAL_TTL) {
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)

      const [completedDelibs, accumulatingDelibs] = await Promise.all([
        // Completed deliberations with champions (30 days, or any time if completedAt missing)
        prisma.deliberation.findMany({
          where: {
            phase: 'COMPLETED',
            isPublic: true,
            OR: [
              { completedAt: { gte: thirtyDaysAgo } },
              { completedAt: null },
            ],
          },
          select: {
            id: true,
            question: true,
            phase: true,
            currentTier: true,
            completedAt: true,
            community: { select: { name: true, slug: true } },
            _count: { select: { members: true, ideas: true } },
            ideas: {
              where: { OR: [{ isChampion: true }, { status: 'WINNER' }] },
              select: { id: true, text: true, totalVotes: true, author: { select: { name: true } } },
              orderBy: { totalVotes: 'desc' },
              take: 1,
            },
          },
          orderBy: { completedAt: 'desc' },
          take: 20,
        }),

        // Accumulating deliberations with current champions
        prisma.deliberation.findMany({
          where: {
            phase: 'ACCUMULATING',
            isPublic: true,
          },
          select: {
            id: true,
            question: true,
            phase: true,
            currentTier: true,
            community: { select: { name: true, slug: true } },
            _count: { select: { members: true, ideas: true } },
            ideas: {
              where: { OR: [{ isChampion: true }, { status: 'WINNER' }] },
              select: { id: true, text: true, totalVotes: true, author: { select: { name: true } } },
              take: 1,
            },
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),
      ])

      const items: ResultItem[] = []

      for (const d of completedDelibs) {
        const champion = d.ideas[0]
        if (champion) {
          items.push({
            type: 'champion_crowned',
            id: `champ-${d.id}`,
            timestamp: (d.completedAt || new Date()).toISOString(),
            deliberation: {
              id: d.id,
              question: d.question,
              phase: d.phase,
              currentTier: d.currentTier,
              community: d.community,
            },
            champion: {
              id: champion.id,
              text: champion.text,
              author: champion.author?.name || 'Anonymous',
              totalVotes: champion.totalVotes,
            },
            totalParticipants: d._count.members,
            totalIdeas: d._count.ideas,
            totalTiers: d.currentTier,
          })
        } else {
          items.push({
            type: 'deliberation_completed',
            id: `completed-${d.id}`,
            timestamp: (d.completedAt || new Date()).toISOString(),
            deliberation: {
              id: d.id,
              question: d.question,
              phase: d.phase,
              currentTier: d.currentTier,
              community: d.community,
            },
            totalParticipants: d._count.members,
            totalIdeas: d._count.ideas,
            totalTiers: d.currentTier,
          })
        }
      }

      for (const d of accumulatingDelibs) {
        const champion = d.ideas[0]
        if (!champion) continue
        items.push({
          type: 'champion_crowned',
          id: `accum-champ-${d.id}`,
          timestamp: d.updatedAt.toISOString(),
          deliberation: {
            id: d.id,
            question: d.question,
            phase: d.phase,
            currentTier: d.currentTier,
            community: d.community,
          },
          champion: {
            id: champion.id,
            text: champion.text,
            author: champion.author?.name || 'Anonymous',
            totalVotes: champion.totalVotes,
          },
          totalParticipants: d._count.members,
          totalIdeas: d._count.ideas,
          totalTiers: d.currentTier,
        })
      }

      globalResultsCache = { items, ts: now }
    }

    // Per-user personal items
    let personalItems: ResultItem[] = []
    if (userId) {
      const cached = userResultsCache.get(userId)
      if (cached && now - cached.ts < USER_TTL) {
        personalItems = cached.items
      } else {
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)

        const [advancingIdeas, correctPredictions] = await Promise.all([
          // User's ideas that are advancing or won
          prisma.idea.findMany({
            where: {
              authorId: userId,
              status: { in: ['ADVANCING', 'WINNER'] },
              createdAt: { gte: sevenDaysAgo },
            },
            select: {
              id: true,
              text: true,
              tier: true,
              status: true,
              deliberation: {
                select: {
                  id: true,
                  question: true,
                  phase: true,
                  currentTier: true,
                  community: { select: { name: true, slug: true } },
                },
              },
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),

          // User's correct predictions
          prisma.prediction.findMany({
            where: {
              userId,
              wonImmediate: true,
              resolvedAt: { gte: sevenDaysAgo },
            },
            select: {
              id: true,
              tierPredictedAt: true,
              resolvedAt: true,
              predictedIdea: { select: { text: true } },
              deliberation: {
                select: {
                  id: true,
                  question: true,
                  phase: true,
                  currentTier: true,
                  community: { select: { name: true, slug: true } },
                },
              },
            },
            orderBy: { resolvedAt: 'desc' },
            take: 10,
          }),
        ])

        personalItems = []

        for (const idea of advancingIdeas) {
          personalItems.push({
            type: 'idea_advanced',
            id: `advance-${idea.id}`,
            timestamp: idea.createdAt.toISOString(),
            deliberation: {
              id: idea.deliberation.id,
              question: idea.deliberation.question,
              phase: idea.deliberation.phase,
              currentTier: idea.deliberation.currentTier,
              community: idea.deliberation.community,
            },
            idea: { id: idea.id, text: idea.text, tier: idea.tier },
            isPersonal: true,
          })
        }

        for (const pred of correctPredictions) {
          personalItems.push({
            type: 'prediction_correct',
            id: `pred-${pred.id}`,
            timestamp: (pred.resolvedAt || new Date()).toISOString(),
            deliberation: {
              id: pred.deliberation.id,
              question: pred.deliberation.question,
              phase: pred.deliberation.phase,
              currentTier: pred.deliberation.currentTier,
              community: pred.deliberation.community,
            },
            prediction: {
              tier: pred.tierPredictedAt,
              ideaText: pred.predictedIdea.text,
            },
            isPersonal: true,
          })
        }

        userResultsCache.set(userId, { items: personalItems, ts: now })

        // Evict stale user caches
        if (userResultsCache.size > 100) {
          const cutoff = now - USER_TTL * 10
          for (const [k, v] of userResultsCache) {
            if (v.ts < cutoff) userResultsCache.delete(k)
          }
        }
      }
    }

    // Merge: personal items first, then global
    const allItems = [...personalItems, ...globalResultsCache!.items]
    return NextResponse.json({ items: allItems })
  } catch (error) {
    console.error('Error fetching results feed:', error)
    return NextResponse.json({ error: 'Failed to fetch results feed' }, { status: 500 })
  }
}
