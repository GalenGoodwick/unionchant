import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/predictions - Create a prediction
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await req.json()
    const { deliberationId, cellId, tier, predictedIdeaId } = body

    if (!deliberationId || !predictedIdeaId || tier === undefined) {
      return NextResponse.json(
        { error: 'deliberationId, predictedIdeaId, and tier are required' },
        { status: 400 }
      )
    }

    // Verify the deliberation exists and is in voting phase
    const deliberation = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    if (deliberation.phase !== 'VOTING') {
      return NextResponse.json({ error: 'Deliberation is not in voting phase' }, { status: 400 })
    }

    // Verify the idea exists and is in voting
    const idea = await prisma.idea.findUnique({
      where: { id: predictedIdeaId },
    })

    if (!idea || idea.deliberationId !== deliberationId) {
      return NextResponse.json({ error: 'Idea not found in this deliberation' }, { status: 404 })
    }

    if (idea.status !== 'IN_VOTING' && idea.status !== 'ADVANCING') {
      return NextResponse.json({ error: 'Idea is not currently competing' }, { status: 400 })
    }

    // For Tier 1, require cellId. For Tier 2+, cellId is optional (batch prediction)
    if (tier === 1 && !cellId) {
      return NextResponse.json({ error: 'cellId required for Tier 1 predictions' }, { status: 400 })
    }

    // If cellId provided, verify the idea is in that cell
    if (cellId) {
      const cellIdea = await prisma.cellIdea.findFirst({
        where: { cellId, ideaId: predictedIdeaId },
      })

      if (!cellIdea) {
        return NextResponse.json({ error: 'Idea is not in this cell' }, { status: 400 })
      }

      // Check cell is still active
      const cell = await prisma.cell.findUnique({
        where: { id: cellId },
      })

      if (!cell || cell.status === 'COMPLETED') {
        return NextResponse.json({ error: 'Cell voting has already completed' }, { status: 400 })
      }
    }

    // Check if user is already a voter in this cell (can't predict on cells you vote in)
    if (cellId) {
      const isParticipant = await prisma.cellParticipation.findFirst({
        where: { cellId, userId: user.id },
      })

      if (isParticipant) {
        return NextResponse.json(
          { error: 'Cannot predict on cells you are voting in' },
          { status: 400 }
        )
      }
    }

    // Create or update prediction
    const prediction = await prisma.prediction.upsert({
      where: cellId
        ? { userId_cellId: { userId: user.id, cellId } }
        : { userId_deliberationId_tierPredictedAt: { userId: user.id, deliberationId, tierPredictedAt: tier } },
      create: {
        userId: user.id,
        deliberationId,
        cellId,
        tierPredictedAt: tier,
        predictedIdeaId,
      },
      update: {
        predictedIdeaId,
      },
      include: {
        predictedIdea: true,
      },
    })

    // Update user's total predictions count
    await prisma.user.update({
      where: { id: user.id },
      data: { totalPredictions: { increment: 1 } },
    })

    return NextResponse.json(prediction, { status: 201 })
  } catch (error) {
    console.error('Error creating prediction:', error)
    return NextResponse.json({ error: 'Failed to create prediction' }, { status: 500 })
  }
}

// GET /api/predictions - Get user's predictions
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const deliberationId = searchParams.get('deliberationId')

    const where: { userId: string; deliberationId?: string } = { userId: user.id }
    if (deliberationId) {
      where.deliberationId = deliberationId
    }

    const predictions = await prisma.prediction.findMany({
      where,
      include: {
        predictedIdea: true,
        cell: {
          include: {
            ideas: { include: { idea: true } },
          },
        },
        deliberation: {
          select: { question: true, phase: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Also return user's prediction stats
    const stats = {
      totalPredictions: user.totalPredictions,
      correctPredictions: user.correctPredictions,
      championPicks: user.championPicks,
      currentStreak: user.currentStreak,
      bestStreak: user.bestStreak,
      accuracy: user.totalPredictions > 0
        ? Math.round((user.correctPredictions / user.totalPredictions) * 100)
        : 0,
    }

    return NextResponse.json({ predictions, stats })
  } catch (error) {
    console.error('Error fetching predictions:', error)
    return NextResponse.json({ error: 'Failed to fetch predictions' }, { status: 500 })
  }
}
