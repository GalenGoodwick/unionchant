import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkCommunityAccess } from '@/lib/community'
import { phaseLabel } from '@/lib/labels'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const session = await getServerSession(authOptions)

  const access = await checkCommunityAccess(slug, session?.user?.email || null)
  if (!access.allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const community = access.community!
  const userId = session?.user?.email
    ? (await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } }))?.id
    : null

  // Get all deliberations for this community
  const deliberations = await prisma.deliberation.findMany({
    where: { communityId: community.id },
    select: {
      id: true,
      question: true,
      phase: true,
      isPublic: true,
      currentTier: true,
      challengeRound: true,
      createdAt: true,
      completedAt: true,
      submissionEndsAt: true,
      votingTimeoutMs: true,
      currentTierStartedAt: true,
      creator: { select: { id: true, name: true } },
      _count: { select: { members: true, ideas: true } },
      ideas: {
        where: { status: { in: ['WINNER', 'DEFENDING'] } },
        select: { text: true, author: { select: { name: true } } },
        take: 1,
      },
      members: userId ? {
        where: { userId },
        select: { userId: true },
        take: 1,
      } : undefined,
      cells: userId ? {
        where: {
          status: { in: ['VOTING', 'DELIBERATING'] },
          participants: { some: { userId } },
        },
        select: {
          id: true,
          status: true,
          tier: true,
          votes: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
        },
        take: 1,
      } : undefined,
    },
    orderBy: [
      { phase: 'asc' }, // Active phases first
      { createdAt: 'desc' },
    ],
  })

  // Build feed items
  type FeedItem = {
    id: string
    kind: 'vote_now' | 'deliberate' | 'submit' | 'champion' | 'completed' | 'waiting' | 'join'
    question: string
    phase: string
    phaseLabel: string
    tier: number
    creatorName: string | null
    memberCount: number
    ideaCount: number
    isPublic: boolean
    isMember: boolean
    hasVoted: boolean
    cellId: string | null
    cellStatus: string | null
    champion: { text: string; authorName: string } | null
    votingDeadline: string | null
    submissionDeadline: string | null
    completedAt: string | null
    createdAt: string
  }

  const items: FeedItem[] = deliberations.map((d: any) => {
    const isMember = d.members?.length > 0
    const cell = d.cells?.[0]
    const hasVoted = cell?.votes?.length > 0
    const championIdea = d.ideas[0]

    let kind: FeedItem['kind'] = 'join'
    if (d.phase === 'COMPLETED') {
      kind = 'completed'
    } else if (d.phase === 'SUBMISSION') {
      kind = 'submit'
    } else if (d.phase === 'ACCUMULATING') {
      kind = 'champion'
    } else if (cell?.status === 'DELIBERATING') {
      kind = 'deliberate'
    } else if (cell?.status === 'VOTING' && !hasVoted) {
      kind = 'vote_now'
    } else if (cell?.status === 'VOTING' && hasVoted) {
      kind = 'waiting'
    } else if (isMember) {
      kind = 'waiting'
    }

    return {
      id: d.id,
      kind,
      question: d.question,
      phase: d.phase,
      phaseLabel: phaseLabel(d.phase),
      tier: d.currentTier,
      creatorName: d.creator?.name || null,
      memberCount: d._count.members,
      ideaCount: d._count.ideas,
      isPublic: d.isPublic,
      isMember,
      hasVoted,
      cellId: cell?.id || null,
      cellStatus: cell?.status || null,
      champion: championIdea
        ? { text: championIdea.text, authorName: championIdea.author?.name || 'Anonymous' }
        : null,
      votingDeadline: d.currentTierStartedAt && d.votingTimeoutMs
        ? new Date(d.currentTierStartedAt.getTime() + d.votingTimeoutMs).toISOString()
        : null,
      submissionDeadline: d.submissionEndsAt?.toISOString() || null,
      completedAt: d.completedAt?.toISOString() || null,
      createdAt: d.createdAt.toISOString(),
    }
  })

  // Sort: actionable items first (vote_now, deliberate, submit), then waiting, then completed
  const priority: Record<string, number> = {
    vote_now: 0, deliberate: 1, submit: 2, champion: 3, join: 4, waiting: 5, completed: 6,
  }
  items.sort((a, b) => (priority[a.kind] ?? 9) - (priority[b.kind] ?? 9))

  return NextResponse.json({
    community: {
      id: community.id,
      name: community.name,
      slug: community.slug,
    },
    items,
  })
}
