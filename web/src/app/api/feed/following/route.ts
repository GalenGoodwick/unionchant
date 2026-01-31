import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { FollowingItem } from '@/types/feed'

// Per-user cache (5s)
const followingCache = new Map<string, { items: FollowingItem[]; ts: number }>()
const CACHE_TTL = 5000

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const now = Date.now()
    const cached = followingCache.get(user.id)
    if (cached && now - cached.ts < CACHE_TTL) {
      return NextResponse.json({ items: cached.items })
    }

    // Get followed user IDs
    const follows = await prisma.follow.findMany({
      where: { followerId: user.id },
      select: { followingId: true },
    })
    const followingIds = follows.map(f => f.followingId)

    if (followingIds.length === 0) {
      return NextResponse.json({ items: [] })
    }

    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000)

    const [submittedIdeas, createdDelibs, joinedDelibs, winningIdeas] = await Promise.all([
      // Ideas submitted by followed users (7 days)
      prisma.idea.findMany({
        where: {
          authorId: { in: followingIds },
          createdAt: { gte: sevenDaysAgo },
          deliberation: { isPublic: true },
        },
        select: {
          id: true,
          text: true,
          createdAt: true,
          author: { select: { id: true, name: true, image: true } },
          deliberation: {
            select: {
              id: true,
              question: true,
              phase: true,
              community: { select: { name: true, slug: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),

      // Deliberations created by followed users (14 days)
      prisma.deliberation.findMany({
        where: {
          creatorId: { in: followingIds },
          createdAt: { gte: fourteenDaysAgo },
          isPublic: true,
        },
        select: {
          id: true,
          question: true,
          phase: true,
          createdAt: true,
          community: { select: { name: true, slug: true } },
          creator: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // Followed users who joined deliberations (7 days)
      prisma.deliberationMember.findMany({
        where: {
          userId: { in: followingIds },
          joinedAt: { gte: sevenDaysAgo },
          deliberation: { isPublic: true },
        },
        select: {
          joinedAt: true,
          user: { select: { id: true, name: true, image: true } },
          deliberation: {
            select: {
              id: true,
              question: true,
              phase: true,
              community: { select: { name: true, slug: true } },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
        take: 15,
      }),

      // Winning ideas by followed users (no time limit, these are significant)
      prisma.idea.findMany({
        where: {
          authorId: { in: followingIds },
          OR: [{ status: 'WINNER' }, { isChampion: true }],
          deliberation: { isPublic: true },
        },
        select: {
          id: true,
          text: true,
          createdAt: true,
          author: { select: { id: true, name: true, image: true } },
          deliberation: {
            select: {
              id: true,
              question: true,
              phase: true,
              community: { select: { name: true, slug: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ])

    const items: FollowingItem[] = []

    for (const idea of submittedIdeas) {
      items.push({
        type: 'idea_submitted',
        id: `submit-${idea.id}`,
        timestamp: idea.createdAt.toISOString(),
        user: {
          id: idea.author.id,
          name: idea.author.name || 'Anonymous',
          image: idea.author.image,
        },
        deliberation: {
          id: idea.deliberation.id,
          question: idea.deliberation.question,
          phase: idea.deliberation.phase,
          community: idea.deliberation.community,
        },
        idea: { id: idea.id, text: idea.text },
      })
    }

    for (const d of createdDelibs) {
      items.push({
        type: 'deliberation_created',
        id: `created-${d.id}`,
        timestamp: d.createdAt.toISOString(),
        user: {
          id: d.creator.id,
          name: d.creator.name || 'Anonymous',
          image: d.creator.image,
        },
        deliberation: {
          id: d.id,
          question: d.question,
          phase: d.phase,
          community: d.community,
        },
      })
    }

    for (const m of joinedDelibs) {
      items.push({
        type: 'joined_deliberation',
        id: `joined-${m.user.id}-${m.deliberation.id}`,
        timestamp: m.joinedAt.toISOString(),
        user: {
          id: m.user.id,
          name: m.user.name || 'Anonymous',
          image: m.user.image,
        },
        deliberation: {
          id: m.deliberation.id,
          question: m.deliberation.question,
          phase: m.deliberation.phase,
          community: m.deliberation.community,
        },
      })
    }

    for (const idea of winningIdeas) {
      // Skip if already included as a submitted idea
      if (items.some(i => i.id === `submit-${idea.id}`)) continue
      items.push({
        type: 'idea_won',
        id: `won-${idea.id}`,
        timestamp: idea.createdAt.toISOString(),
        user: {
          id: idea.author.id,
          name: idea.author.name || 'Anonymous',
          image: idea.author.image,
        },
        deliberation: {
          id: idea.deliberation.id,
          question: idea.deliberation.question,
          phase: idea.deliberation.phase,
          community: idea.deliberation.community,
        },
        idea: { id: idea.id, text: idea.text },
      })
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    followingCache.set(user.id, { items, ts: now })

    // Evict stale caches
    if (followingCache.size > 100) {
      const cutoff = now - CACHE_TTL * 10
      for (const [k, v] of followingCache) {
        if (v.ts < cutoff) followingCache.delete(k)
      }
    }

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Error fetching following feed:', error)
    return NextResponse.json({ error: 'Failed to fetch following feed' }, { status: 500 })
  }
}
