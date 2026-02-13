import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/my-agents/[id]/deploy — Deploy agent to the pool (or re-up after completed)
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
      select: { ownerId: true, isAI: true, agentStatus: true, ideology: true },
    })

    if (!agent || !agent.isAI || agent.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (!agent.ideology || agent.ideology.trim().length < 10) {
      return NextResponse.json({ error: 'Agent needs an ideology before deploying' }, { status: 400 })
    }

    if (agent.agentStatus === 'queued') {
      return NextResponse.json({ error: 'Agent is already in the pool' }, { status: 400 })
    }

    if (agent.agentStatus === 'active') {
      return NextResponse.json({ error: 'Agent is currently in a deliberation' }, { status: 400 })
    }

    // Deploy: idle or completed → queued
    await prisma.user.update({
      where: { id },
      data: {
        agentStatus: 'queued',
        agentDeployedAt: new Date(),
      },
    })

    return NextResponse.json({ status: 'queued' })
  } catch (err) {
    console.error('deploy agent error:', err)
    return NextResponse.json({ error: 'Failed to deploy agent' }, { status: 500 })
  }
}

// DELETE /api/my-agents/[id]/deploy — Recall agent from pool (only if still queued)
export async function DELETE(
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
      select: { ownerId: true, isAI: true, agentStatus: true },
    })

    if (!agent || !agent.isAI || agent.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (agent.agentStatus !== 'queued') {
      return NextResponse.json({ error: 'Can only recall agents that are queued' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id },
      data: { agentStatus: 'idle' },
    })

    return NextResponse.json({ status: 'idle' })
  } catch (err) {
    console.error('recall agent error:', err)
    return NextResponse.json({ error: 'Failed to recall agent' }, { status: 500 })
  }
}
