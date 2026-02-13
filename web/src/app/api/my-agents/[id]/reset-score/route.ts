import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/my-agents/[id]/reset-score — Reset an agent's Foresight Score
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const agent = await prisma.user.findUnique({
      where: { id },
      select: { ownerId: true, isAI: true },
    })

    if (!agent || !agent.isAI || agent.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    await prisma.user.update({
      where: { id },
      data: { scoreResetAt: new Date() },
    })

    return NextResponse.json({ success: true, scoreResetAt: new Date().toISOString() })
  } catch (err) {
    console.error('reset agent score error:', err)
    return NextResponse.json({ error: 'Failed to reset score' }, { status: 500 })
  }
}
