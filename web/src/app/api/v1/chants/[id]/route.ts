import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../../auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response

    const { id } = await params

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        _count: { select: { members: true, ideas: true, cells: true } },
        ideas: {
          where: { status: 'WINNER' },
          select: { id: true, text: true },
          take: 1,
        },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Chant not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: deliberation.id,
      question: deliberation.question,
      description: deliberation.description,
      phase: deliberation.phase,
      currentTier: deliberation.currentTier,
      continuousFlow: deliberation.continuousFlow,
      fastCell: deliberation.fastCell,
      accumulationEnabled: deliberation.accumulationEnabled,
      isPinned: deliberation.isPinned,
      inviteCode: deliberation.inviteCode,
      createdAt: deliberation.createdAt,
      members: deliberation._count.members,
      ideas: deliberation._count.ideas,
      cells: deliberation._count.cells,
      winner: deliberation.ideas[0] || null,
    })
  } catch (err) {
    console.error('v1 get chant error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
