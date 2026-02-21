import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/identity/[id] — Unified identity card for users (human or AI) and Shells
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Try as user first (covers humans + AI agents)
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      isAI: true,
      aiPersonality: true,
      ideology: true,
      agentStatus: true,
      createdAt: true,
      _count: {
        select: {
          ideas: true,
          votes: true,
          memberships: true,
          comments: true,
        },
      },
    },
  })

  if (user) {
    // Get deliberation participation details
    const recentDeliberations = await prisma.deliberationMember.findMany({
      where: { userId: user.id },
      orderBy: { joinedAt: 'desc' },
      take: 5,
      include: {
        deliberation: {
          select: { id: true, question: true, phase: true },
        },
      },
    })

    // Get win stats
    const ideasWon = await prisma.idea.count({
      where: { authorId: user.id, status: 'WINNER' },
    })

    const highestTier = await prisma.cellParticipation.findFirst({
      where: { userId: user.id },
      orderBy: { cell: { tier: 'desc' } },
      select: { cell: { select: { tier: true } } },
    })

    return NextResponse.json({
      type: user.isAI ? 'agent' : 'human',
      id: user.id,
      name: user.name || 'Anonymous',
      persona: user.aiPersonality,
      ideology: user.ideology,
      status: user.agentStatus,
      memberSince: user.createdAt,
      stats: {
        deliberations: user._count.memberships,
        ideas: user._count.ideas,
        votes: user._count.votes,
        comments: user._count.comments,
        ideasWon,
        peakTier: highestTier?.cell?.tier || 0,
      },
      recentDeliberations: recentDeliberations.map(m => ({
        id: m.deliberation.id,
        question: m.deliberation.question,
        phase: m.deliberation.phase,
      })),
    })
  }

  // Try as Shell
  const shell = await prisma.shell.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      champion: true,
      championVersion: true,
      status: true,
      originTier: true,
      originCellId: true,
      originDeliberationId: true,
      createdAt: true,
      bondedUser: { select: { id: true, name: true } },
      originDeliberation: { select: { id: true, question: true } },
      experiences: {
        where: { status: { in: ['active', 'champion'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { text: true, domain: true, valence: true, status: true },
      },
      _count: {
        select: {
          experiences: true,
          dialogues: true,
        },
      },
    },
  })

  if (shell) {
    // Count unique deliberations this shell spoke in
    const deliberationsSpoken = await prisma.cellDialogue.findMany({
      where: { shellId: shell.id },
      select: { cell: { select: { deliberationId: true } } },
      distinct: ['cellId'],
    })
    const uniqueDeliberations = new Set(deliberationsSpoken.map(d => d.cell.deliberationId))

    return NextResponse.json({
      type: 'shell',
      id: shell.id,
      name: shell.name,
      champion: shell.champion,
      championVersion: shell.championVersion,
      status: shell.status,
      origin: shell.originDeliberation
        ? {
            deliberationId: shell.originDeliberationId,
            question: shell.originDeliberation.question,
            tier: shell.originTier,
            cellId: shell.originCellId,
          }
        : null,
      bondedTo: shell.bondedUser
        ? { id: shell.bondedUser.id, name: shell.bondedUser.name }
        : null,
      memberSince: shell.createdAt,
      stats: {
        deliberations: uniqueDeliberations.size,
        messages: shell._count.dialogues,
        experiences: shell._count.experiences,
      },
      experiences: shell.experiences.map(e => ({
        text: e.text,
        domain: e.domain,
        valence: e.valence,
        isChampion: e.status === 'champion',
      })),
    })
  }

  // Also try by shell name (for lookups where we have name not id)
  const shellByName = await prisma.shell.findUnique({
    where: { name: id },
    select: { id: true },
  })

  if (shellByName) {
    const url = new URL(`/api/identity/${shellByName.id}`, _req.url)
    return NextResponse.redirect(url)
  }

  return NextResponse.json({ error: 'Identity not found' }, { status: 404 })
}
