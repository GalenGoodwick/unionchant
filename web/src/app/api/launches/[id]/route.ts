import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/launches/:id — Get launch pool details
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const launch = await prisma.launchPool.findUnique({
      where: { id },
      include: {
        deliberation: {
          select: {
            id: true,
            question: true,
            description: true,
            phase: true,
            currentTier: true,
            championId: true,
            completedAt: true,
            _count: { select: { ideas: true, members: true, cells: true } },
          },
        },
        creator: { select: { id: true, name: true, walletAddress: true } },
        contributions: {
          select: {
            id: true,
            amountLamports: true,
            verified: true,
            createdAt: true,
            user: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    })

    if (!launch) {
      return NextResponse.json({ error: 'Launch not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: launch.id,
      chantId: launch.deliberationId,
      name: launch.deliberation.question,
      description: launch.deliberation.description,
      targetLamports: launch.targetLamports.toString(),
      currentLamports: launch.currentLamports.toString(),
      status: launch.status,
      poolDeadline: launch.poolDeadline.toISOString(),
      winnerIdeaId: launch.winnerIdeaId,
      phase: launch.deliberation.phase,
      currentTier: launch.deliberation.currentTier,
      championId: launch.deliberation.championId,
      ideaCount: launch.deliberation._count.ideas,
      memberCount: launch.deliberation._count.members,
      cellCount: launch.deliberation._count.cells,
      creator: launch.creator,
      contributions: launch.contributions.map(c => ({
        id: c.id,
        amountLamports: c.amountLamports.toString(),
        verified: c.verified,
        user: c.user,
        createdAt: c.createdAt.toISOString(),
      })),
      createdAt: launch.createdAt.toISOString(),
    })
  } catch (err) {
    console.error('Get launch error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
