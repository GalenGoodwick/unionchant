import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const deliberationId = searchParams.get('id')

  // Find the most recent Ask AI deliberation if no ID provided
  let delib
  if (deliberationId) {
    delib = await prisma.deliberation.findUnique({
      where: { id: deliberationId },
      include: {
        members: { select: { userId: true, role: true } },
      },
    })
  } else {
    delib = await prisma.deliberation.findFirst({
      where: { tags: { has: 'ask-ai' } },
      orderBy: { createdAt: 'desc' },
      include: {
        members: { select: { userId: true, role: true } },
      },
    })
  }

  if (!delib) {
    return NextResponse.json({ error: 'No Ask AI deliberation found' }, { status: 404 })
  }

  // Get tier-by-tier breakdown
  const maxTier = await prisma.cell.aggregate({
    where: { deliberationId: delib.id },
    _max: { tier: true },
  })

  const totalTiers = maxTier._max.tier || 0
  const tierData: Array<{
    tier: number
    totalCells: number
    totalBatches: number
    totalParticipants: number
    totalVotes: number
    advancingIdeas: number
    batches: Array<{
      batch: number
      cells: number
      totalParticipants: number
      totalVotes: number
      uniqueIdeas: number
      cellDetails: Array<{
        id: string
        status: string
        participants: number
        ideas: number
        votes: number
      }>
    }>
  }> = []

  for (let tier = 1; tier <= totalTiers; tier++) {
    const cells = await prisma.cell.findMany({
      where: { deliberationId: delib.id, tier },
      include: {
        _count: {
          select: { participants: true, ideas: true, votes: true },
        },
      },
      orderBy: { batch: 'asc' },
    })

    // Group by batch
    const batches = new Map<number, typeof cells>()
    for (const cell of cells) {
      const batchNum = cell.batch ?? 0
      if (!batches.has(batchNum)) batches.set(batchNum, [])
      batches.get(batchNum)!.push(cell)
    }

    const batchDetails = Array.from(batches.entries()).map(([batchNum, batchCells]) => ({
      batch: batchNum,
      cells: batchCells.length,
      totalParticipants: batchCells.reduce((sum, c) => sum + c._count.participants, 0),
      totalVotes: batchCells.reduce((sum, c) => sum + c._count.votes, 0),
      uniqueIdeas: new Set(batchCells.flatMap(c => c._count.ideas)).size,
      cellDetails: batchCells.map(c => ({
        id: c.id,
        status: c.status,
        participants: c._count.participants,
        ideas: c._count.ideas,
        votes: c._count.votes,
      })),
    }))

    // Get advancing ideas from this tier
    const advancingIdeas = await prisma.idea.count({
      where: {
        deliberationId: delib.id,
        tier,
        status: { in: ['ADVANCING', 'WINNER'] },
      },
    })

    tierData.push({
      tier,
      totalCells: cells.length,
      totalBatches: batches.size,
      totalParticipants: cells.reduce((sum, c) => sum + c._count.participants, 0),
      totalVotes: cells.reduce((sum, c) => sum + c._count.votes, 0),
      advancingIdeas,
      batches: batchDetails,
    })
  }

  // Get total ideas
  const totalIdeas = await prisma.idea.count({
    where: { deliberationId: delib.id },
  })

  const championIdea = delib.championId
    ? await prisma.idea.findUnique({
        where: { id: delib.championId },
        select: { text: true, tier: true },
      })
    : null

  return NextResponse.json({
    deliberation: {
      id: delib.id,
      question: delib.question,
      phase: delib.phase,
      currentTier: delib.currentTier,
      totalMembers: delib.members.length,
      totalIdeas,
      championText: championIdea?.text,
      championTier: championIdea?.tier,
      createdAt: delib.createdAt,
      completedAt: delib.completedAt,
    },
    totalTiers,
    tiers: tierData,
  })
}
