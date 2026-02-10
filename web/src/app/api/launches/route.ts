import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { solToLamports } from '@/lib/solana'

/**
 * POST /api/launches — Create a new launch pool
 *
 * Creates both a UC deliberation (the chant) and a LaunchPool record.
 * The chant IS the launch — proposals are ideas, voting determines the winner.
 *
 * Body: { name: string, description?: string, targetSol: number, deadlineDays: number }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await req.json()
    const { name, description, targetSol, deadlineDays } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!targetSol || typeof targetSol !== 'number' || targetSol <= 0) {
      return NextResponse.json({ error: 'targetSol must be a positive number' }, { status: 400 })
    }
    if (!deadlineDays || typeof deadlineDays !== 'number' || deadlineDays < 1) {
      return NextResponse.json({ error: 'deadlineDays must be at least 1' }, { status: 400 })
    }

    const poolDeadline = new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000)

    // Create the deliberation (the chant that powers this launch)
    const deliberation = await prisma.deliberation.create({
      data: {
        question: name.trim(),
        description: description?.trim() || null,
        creatorId: session.user.id,
        phase: 'SUBMISSION',
        continuousFlow: true,
        allocationMode: 'fcfs',
        cellSize: 5,
        votingTimeoutMs: 0,
        accumulationEnabled: false,
        allowAI: true, // AI agents deliberate on proposals
        isPublic: true,
      },
    })

    // Create the launch pool linked to the deliberation
    const launchPool = await prisma.launchPool.create({
      data: {
        deliberationId: deliberation.id,
        creatorId: session.user.id,
        targetLamports: solToLamports(targetSol),
        poolDeadline,
      },
    })

    return NextResponse.json({
      success: true,
      launch: {
        id: launchPool.id,
        chantId: deliberation.id,
        name: deliberation.question,
        targetSol,
        poolDeadline: poolDeadline.toISOString(),
        status: launchPool.status,
      },
    })
  } catch (err) {
    console.error('Create launch error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/launches — List active launch pools
 */
export async function GET() {
  try {
    const launches = await prisma.launchPool.findMany({
      where: { status: { in: ['FUNDING', 'DELIBERATING'] } },
      include: {
        deliberation: {
          select: {
            id: true,
            question: true,
            description: true,
            phase: true,
            currentTier: true,
            _count: { select: { ideas: true, members: true } },
          },
        },
        creator: { select: { id: true, name: true, walletAddress: true } },
        _count: { select: { contributions: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({
      launches: launches.map(l => ({
        id: l.id,
        chantId: l.deliberationId,
        name: l.deliberation.question,
        description: l.deliberation.description,
        targetLamports: l.targetLamports.toString(),
        currentLamports: l.currentLamports.toString(),
        status: l.status,
        poolDeadline: l.poolDeadline.toISOString(),
        phase: l.deliberation.phase,
        currentTier: l.deliberation.currentTier,
        ideaCount: l.deliberation._count.ideas,
        memberCount: l.deliberation._count.members,
        contributorCount: l._count.contributions,
        creator: l.creator,
        createdAt: l.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('List launches error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
