import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/my-agents/[id] — Update an agent's ideology/name
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const agent = await prisma.user.findUnique({
      where: { id },
      select: { ownerId: true, isAI: true },
    })

    if (!agent || !agent.isAI || agent.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const body = await req.json()
    const updates: Record<string, string | null> = {}

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length < 2) {
        return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 })
      }
      updates.name = body.name.trim().slice(0, 40)
    }

    if (body.ideology !== undefined) {
      if (typeof body.ideology !== 'string' || body.ideology.trim().length < 10) {
        return NextResponse.json({ error: 'Ideology must be at least 10 characters' }, { status: 400 })
      }
      updates.ideology = body.ideology.trim()
    }

    if (body.personality !== undefined) {
      updates.aiPersonality = body.personality?.trim() || null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        name: true,
        aiPersonality: true,
        ideology: true,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('update agent error:', err)
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
  }
}

// DELETE /api/my-agents/[id] — Delete an agent
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
      select: { ownerId: true, isAI: true },
    })

    if (!agent || !agent.isAI || agent.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Soft delete — mark as deleted so reputation history is preserved
    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DELETED' },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('delete agent error:', err)
    return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 })
  }
}
