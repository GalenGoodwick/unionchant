import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { processAllTimers } from '@/lib/timer-processor'

// ── Timer fallback ──
let lastTimerCheck = 0
const TIMER_CHECK_INTERVAL = 30_000

// ── Cache ──
const streamCache = new Map<string, { data: StreamResponse; ts: number }>()
const STREAM_TTL = 5_000
const MAX_CACHE = 500

// ── Types ──
export type StreamItemType = 'vote_now' | 'filling' | 'submit' | 'deliberate' | 'completed' | 'champion' | 'waiting'

export type StreamItem = {
  type: StreamItemType
  id: string
  priority: number
  deliberation: {
    id: string
    question: string
    phase: string
    tier: number
    participantCount: number
    ideaCount: number
    communityName?: string | null
  }
  cell?: {
    id: string
    status: string
    tier: number
    filledCount: number
    capacity: number
    votedCount: number
    ideas: { id: string; text: string; authorName: string }[]
    createdAt: string
  }
  champion?: { text: string; authorName: string }
  completedAt?: string
}

export type StreamResponse = {
  featured: StreamItem | null
  queue: StreamItem[]
  results: StreamItem[]
  pulse: {
    activeVoters: number
    cellsFillingNow: number
    ideasToday: number
    votesToday: number
  }
}

export async function GET(req: NextRequest) {
  try {
    // Timer fallback (fire-and-forget)
    const now = Date.now()
    if (now - lastTimerCheck > TIMER_CHECK_INTERVAL) {
      lastTimerCheck = now
      processAllTimers('stream').catch(() => {})
    }

    const session = await getServerSession(authOptions)
    const userId = session?.user?.email
      ? (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id
      : null

    // Check cache
    const cacheKey = userId || '__anon__'
    const cached = streamCache.get(cacheKey)
    if (cached && now - cached.ts < STREAM_TTL) {
      return NextResponse.json(cached.data)
    }

    // ── Build stream items ──

    const items: StreamItem[] = []

    // 1. Get all open cells across public deliberations
    const openCells = await prisma.cell.findMany({
      where: {
        status: { in: ['VOTING', 'DELIBERATING'] },
        deliberation: { isPublic: true },
      },
      include: {
        _count: { select: { participants: true } },
        ideas: {
          include: {
            idea: {
              select: { id: true, text: true, authorId: true, author: { select: { name: true } } },
            },
          },
        },
        deliberation: {
          select: {
            id: true,
            question: true,
            phase: true,
            currentTier: true,
            _count: { select: { members: true, ideas: true } },
            community: { select: { name: true } },
          },
        },
        votes: userId ? { where: { userId }, select: { id: true } } : false,
      },
      orderBy: { createdAt: 'asc' },
    })

    // User context: which cells is the user already in?
    let userCellIds = new Set<string>()
    let userIdeaIds = new Set<string>()

    if (userId) {
      const participations = await prisma.cellParticipation.findMany({
        where: { userId },
        select: { cellId: true },
      })
      userCellIds = new Set(participations.map(p => p.cellId))

      const userIdeas = await prisma.idea.findMany({
        where: { authorId: userId },
        select: { id: true },
      })
      userIdeaIds = new Set(userIdeas.map(i => i.id))
    }

    // Count votes per cell (for votedCount)
    const cellIds = openCells.map(c => c.id)
    const voteCounts = cellIds.length > 0
      ? await prisma.$queryRaw<{ cellId: string; cnt: bigint }[]>`
          SELECT "cellId", COUNT(DISTINCT "userId") as cnt FROM "Vote"
          WHERE "cellId" = ANY(${cellIds})
          GROUP BY "cellId"
        `
      : []
    const voteCountMap = new Map(voteCounts.map(v => [v.cellId, Number(v.cnt)]))

    for (const cell of openCells) {
      const delib = cell.deliberation
      const filledCount = cell._count.participants
      const votedCount = voteCountMap.get(cell.id) || 0
      const isInCell = userCellIds.has(cell.id)
      const hasOwnIdea = cell.ideas.some(ci => userIdeaIds.has(ci.idea.id))

      const cellData = {
        id: cell.id,
        status: cell.status,
        tier: cell.tier,
        filledCount,
        capacity: 5,
        votedCount,
        ideas: cell.ideas.map(ci => ({
          id: ci.idea.id,
          text: ci.idea.text,
          authorName: ci.idea.author?.name || 'Anonymous',
        })),
        createdAt: cell.createdAt.toISOString(),
      }

      const deliberationData = {
        id: delib.id,
        question: delib.question,
        phase: delib.phase,
        tier: delib.currentTier,
        participantCount: delib._count.members,
        ideaCount: delib._count.ideas,
        communityName: delib.community?.name,
      }

      if (isInCell && cell.status === 'VOTING') {
        // User is in this cell and needs to vote
        const hasVoted = cell.votes && (cell.votes as { id: string }[]).length > 0
        if (hasVoted) {
          items.push({ type: 'waiting', id: `wait-${cell.id}`, priority: 5, deliberation: deliberationData, cell: cellData })
        } else {
          items.push({ type: 'vote_now', id: `vote-${cell.id}`, priority: 100, deliberation: deliberationData, cell: cellData })
        }
      } else if (isInCell && cell.status === 'DELIBERATING') {
        items.push({ type: 'deliberate', id: `discuss-${cell.id}`, priority: 90, deliberation: deliberationData, cell: cellData })
      } else if (!isInCell && filledCount < 5 && !hasOwnIdea) {
        // Open cell user can join
        items.push({ type: 'filling', id: `fill-${cell.id}`, priority: 70, deliberation: deliberationData, cell: cellData })
      } else if (!isInCell && filledCount < 5) {
        // Spectator view (has own idea in cell)
        items.push({ type: 'filling', id: `spec-${cell.id}`, priority: 20, deliberation: deliberationData, cell: cellData })
      }
    }

    // 2. Open submission deliberations
    const submissionDelibs = await prisma.deliberation.findMany({
      where: { isPublic: true, phase: 'SUBMISSION' },
      select: {
        id: true, question: true, phase: true, currentTier: true,
        _count: { select: { members: true, ideas: true } },
        community: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    for (const d of submissionDelibs) {
      items.push({
        type: 'submit',
        id: `submit-${d.id}`,
        priority: 50,
        deliberation: {
          id: d.id, question: d.question, phase: d.phase, tier: d.currentTier,
          participantCount: d._count.members, ideaCount: d._count.ideas,
          communityName: d.community?.name,
        },
      })
    }

    // Sort by priority desc
    items.sort((a, b) => b.priority - a.priority)

    // 3. Recent results
    const results: StreamItem[] = []
    const recentCompletions = await prisma.deliberation.findMany({
      where: { isPublic: true, phase: 'COMPLETED', completedAt: { not: null } },
      select: {
        id: true, question: true, phase: true, currentTier: true, completedAt: true,
        _count: { select: { members: true, ideas: true } },
        community: { select: { name: true } },
        ideas: {
          where: { isChampion: true },
          select: { text: true, author: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: { completedAt: 'desc' },
      take: 5,
    })

    for (const d of recentCompletions) {
      const champ = d.ideas[0]
      results.push({
        type: 'champion',
        id: `result-${d.id}`,
        priority: 0,
        deliberation: {
          id: d.id, question: d.question, phase: d.phase, tier: d.currentTier,
          participantCount: d._count.members, ideaCount: d._count.ideas,
          communityName: d.community?.name,
        },
        champion: champ ? { text: champ.text, authorName: champ.author?.name || 'Anonymous' } : undefined,
        completedAt: d.completedAt?.toISOString(),
      })
    }

    // 4. Pulse stats
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [cellsFillingNow, ideasToday, votesToday] = await Promise.all([
      prisma.cell.count({ where: { status: { in: ['VOTING', 'DELIBERATING'] } } }),
      prisma.idea.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.$queryRaw<[{ cnt: bigint }]>`SELECT COUNT(*) as cnt FROM "Vote" WHERE "votedAt" >= ${todayStart}`.then(r => Number(r[0]?.cnt || 0)),
    ])

    const activeVotersResult = await prisma.$queryRaw<[{ cnt: bigint }]>`
      SELECT COUNT(DISTINCT "userId") as cnt FROM "Vote" WHERE "votedAt" >= ${todayStart}
    `

    const response: StreamResponse = {
      featured: items[0] || null,
      queue: items.slice(1, 10),
      results,
      pulse: {
        activeVoters: Number(activeVotersResult[0]?.cnt || 0),
        cellsFillingNow,
        ideasToday,
        votesToday,
      },
    }

    // Cache
    if (streamCache.size >= MAX_CACHE) {
      const oldest = streamCache.keys().next().value
      if (oldest) streamCache.delete(oldest)
    }
    streamCache.set(cacheKey, { data: response, ts: now })

    return NextResponse.json(response)
  } catch (error) {
    console.error('Stream API error:', error)
    return NextResponse.json({ error: 'Failed to load stream' }, { status: 500 })
  }
}
