import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startVotingPhase } from '@/lib/voting'

// POST /api/deliberations/[id]/start-voting - Transition to voting phase
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Only creator can start voting
    if (deliberation.creatorId !== user.id) {
      return NextResponse.json({ error: 'Only the creator can start voting' }, { status: 403 })
    }

    const result = await startVotingPhase(id)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error starting voting:', error)
    const message = error instanceof Error ? error.message : 'Failed to start voting'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
