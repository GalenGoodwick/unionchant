import { NextRequest, NextResponse } from 'next/server'
import { verifyBotAuth } from '../../../auth'
import { resolveDiscordUser } from '@/lib/bot-user'
import { prisma } from '@/lib/prisma'
import { processCellResults, checkTierCompletion } from '@/lib/voting'

// POST /api/bot/chants/[id]/end — Force-end a chant. Creator-only.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = verifyBotAuth(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params
    const body = await req.json()
    const { discordUserId, discordUsername } = body

    if (!discordUserId || !discordUsername) {
      return NextResponse.json({ error: 'discordUserId and discordUsername are required' }, { status: 400 })
    }

    const user = await resolveDiscordUser(discordUserId, discordUsername)

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can end the chant' }, { status: 403 })
    }

    if (deliberation.phase === 'COMPLETED') {
      return NextResponse.json({ error: 'Chant is already completed' }, { status: 400 })
    }

    if (deliberation.phase === 'SUBMISSION') {
      // No voting happened — just mark as completed
      await prisma.deliberation.update({
        where: { id },
        data: { phase: 'COMPLETED', completedAt: new Date() },
      })

      return NextResponse.json({
        success: true,
        phase: 'COMPLETED',
        message: 'Chant ended before voting started',
      })
    }

    // Force-complete all open cells
    const openCells = await prisma.cell.findMany({
      where: {
        deliberationId: id,
        status: { in: ['VOTING', 'DELIBERATING'] },
      },
      select: { id: true, tier: true },
    })

    for (const cell of openCells) {
      await processCellResults(cell.id, true)
    }

    // Check tier completion for all tiers that had open cells
    const tiers = [...new Set(openCells.map(c => c.tier))].sort()
    for (const tier of tiers) {
      await checkTierCompletion(id, tier)
    }

    // If still not completed (e.g. multi-tier in progress), force complete
    const updated = await prisma.deliberation.findUnique({
      where: { id },
      select: { phase: true, championId: true },
    })

    if (updated?.phase !== 'COMPLETED') {
      // Find the top idea by XP and crown it
      const topIdea = await prisma.idea.findFirst({
        where: { deliberationId: id, status: { in: ['ADVANCING', 'IN_VOTING', 'SUBMITTED', 'PENDING'] } },
        orderBy: { totalXP: 'desc' },
      })

      if (topIdea) {
        await prisma.$transaction([
          prisma.idea.update({
            where: { id: topIdea.id },
            data: { status: 'WINNER', isChampion: true },
          }),
          prisma.deliberation.update({
            where: { id },
            data: {
              phase: 'COMPLETED',
              completedAt: new Date(),
              championId: topIdea.id,
            },
          }),
        ])
      } else {
        await prisma.deliberation.update({
          where: { id },
          data: { phase: 'COMPLETED', completedAt: new Date() },
        })
      }
    }

    const final = await prisma.deliberation.findUnique({
      where: { id },
      select: {
        phase: true,
        championId: true,
        ideas: {
          where: { isChampion: true },
          select: { id: true, text: true },
          take: 1,
        },
      },
    })

    return NextResponse.json({
      success: true,
      phase: final?.phase,
      champion: final?.ideas[0] || null,
      closedCells: openCells.length,
    })
  } catch (error) {
    console.error('Error ending chant:', error)
    return NextResponse.json({ error: 'Failed to end chant' }, { status: 500 })
  }
}
