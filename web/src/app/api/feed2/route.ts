import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ── Caches ─────────────────────────────────────────────────────
let discoveryCache: { data: any[]; ts: number } | null = null
let podiumCache: { data: any[]; ts: number } | null = null
const DISCOVERY_TTL = 30_000
const PODIUM_TTL = 60_000

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

export type FeedEntry = {
  kind: FeedEntryKind
  id: string
  pinned?: boolean
  priority: number
  // Deliberation fields (when kind != podium)
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
    myVote: boolean
    votedCount: number
    memberCount: number
    ideas: { id: string; text: string; authorName: string }[]
  }
  champion?: { text: string; authorName: string }
  myIdea?: { text: string; status: string }
  // Podium fields (when kind == podium)
  podium?: {
    id: string
    title: string
    preview: string
    authorName: string
    authorImage: string | null
    isAI: boolean
    views: number
    createdAt: string
    deliberationQuestion?: string | null
  }
}

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
      _count: { select: { members: true, ideas: true } },
      community: { select: { name: true } },
      creator: { select: { name: true } },
      ideas: {
        where: { status: { in: ['WINNER', 'DEFENDING'] } },
        select: { text: true, author: { select: { name: true } } },
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
  const now = Date.now()
  if (podiumCache && now - podiumCache.ts < PODIUM_TTL) return podiumCache.data

  const podiums = await prisma.podium.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      body: true,
      views: true,
      createdAt: true,
      author: { select: { name: true, image: true, isAI: true } },
      deliberation: { select: { question: true } },
    },
  })

  podiumCache = { data: podiums, ts: now }
  return podiums
}

type UserContext = {
  id: string
  memberDelibIds: Set<string>
  cellsByDelib: Map<string, any>
  ideaByDelib: Map<string, any>
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
              ideas: {
                select: {
                  idea: {
                    select: { id: true, text: true, author: { select: { name: true } } },
                  },
                },
              },
              participants: { select: { userId: true } },
              votes: { select: { userId: true } },
            },
          },
        },
      },
      ideas: {
        where: { status: { in: ['ADVANCING', 'WINNER', 'IN_VOTING'] } },
        select: { id: true, text: true, status: true, deliberationId: true },
        take: 20,
      },
    },
  })

  if (!user) return null

  const memberDelibIds = new Set(user.memberships.map((m) => m.deliberationId))

  const cellsByDelib = new Map<string, any>()
  for (const cp of user.cellParticipations) {
    const c = cp.cell
    cellsByDelib.set(c.deliberationId, {
      id: c.id,
      status: c.status,
      myVote: c.votes.some((v: any) => v.userId === user.id),
      votedCount: c.votes.length,
      memberCount: c.participants.length,
      ideas: c.ideas.map((ci: any) => ({
        id: ci.idea.id,
        text: ci.idea.text,
        authorName: ci.idea.author?.name || 'Anonymous',
      })),
    })
  }

  const ideaByDelib = new Map<string, any>()
  for (const idea of user.ideas) {
    ideaByDelib.set(idea.deliberationId, { text: idea.text, status: idea.status })
  }

  return { id: user.id, memberDelibIds, cellsByDelib, ideaByDelib }
}

// ── Main ───────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions)

  // 3 queries max (2 if cache hits)
  const [deliberations, podiums, userCtx] = await Promise.all([
    getDiscovery(),
    getPodiums(),
    session?.user?.email ? getUserContext(session.user.email) : null,
  ])

  const entries: FeedEntry[] = []

  // ── Build deliberation entries ──
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

    if (d.phase === 'VOTING' && cell && !cell.myVote) {
      if (d.challengeRound > 0) {
        entries.push({ kind: 'challenge', id: `challenge-${d.id}`, priority: 95, ...base })
      } else {
        entries.push({ kind: 'vote_now', id: `vote-${d.id}`, priority: 100, ...base })
      }
    } else if (d.phase === 'VOTING' && cell?.status === 'DELIBERATING') {
      entries.push({ kind: 'deliberate', id: `discuss-${d.id}`, priority: 90, ...base })
    } else if (d.phase === 'SUBMISSION' && isMember) {
      entries.push({ kind: 'submit', id: `submit-${d.id}`, priority: 70, ...base })
    } else if (d.phase === 'ACCUMULATING') {
      entries.push({ kind: 'champion', id: `champ-${d.id}`, priority: 40, ...base })
    } else if (d.phase === 'COMPLETED') {
      entries.push({ kind: 'completed', id: `done-${d.id}`, priority: 10, ...base })
    } else if (d.phase === 'VOTING' && !isMember) {
      entries.push({ kind: 'join', id: `join-${d.id}`, priority: 50, ...base })
    } else if (d.phase === 'SUBMISSION' && !isMember) {
      entries.push({ kind: 'join', id: `join-${d.id}`, priority: 50, ...base })
    }
  }

  // Sort deliberation entries by priority desc
  entries.sort((a, b) => b.priority - a.priority)

  // ── Build podium entries ──
  const podiumEntries: FeedEntry[] = podiums.map((p: any, i: number) => ({
    kind: 'podium' as const,
    id: `podium-${p.id}`,
    pinned: i === 0,
    priority: i === 0 ? 200 : 30,
    podium: {
      id: p.id,
      title: p.title,
      preview: p.body.slice(0, 180).replace(/\n/g, ' '),
      authorName: p.author?.name || 'Anonymous',
      authorImage: p.author?.image || null,
      isAI: p.author?.isAI || false,
      views: p.views,
      createdAt: p.createdAt.toISOString(),
      deliberationQuestion: p.deliberation?.question || null,
    },
  }))

  // ── Intersperse: pinned first, then alternate delibs + podiums ──
  const pinned = podiumEntries.find((e) => e.pinned)
  const otherPodiums = podiumEntries.filter((e) => !e.pinned)
  const feed: FeedEntry[] = []

  if (pinned) feed.push(pinned)

  // Interleave: every 2-3 deliberation cards, insert a podium
  let podIdx = 0
  for (let i = 0; i < entries.length; i++) {
    feed.push(entries[i])
    if ((i + 1) % 3 === 0 && podIdx < otherPodiums.length) {
      feed.push(otherPodiums[podIdx++])
    }
  }
  // Append remaining podiums
  while (podIdx < otherPodiums.length) {
    feed.push(otherPodiums[podIdx++])
  }

  return NextResponse.json({ items: feed })
}
