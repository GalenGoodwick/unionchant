import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'

async function getAuthorizedUser(deliberationId: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return { error: 'Unauthorized', status: 401 }
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  })

  if (!user) {
    return { error: 'User not found', status: 404 }
  }

  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    select: { creatorId: true },
  })

  if (!deliberation) {
    return { error: 'Deliberation not found', status: 404 }
  }

  const isCreator = deliberation.creatorId === user.id
  const admin = await isAdmin(session.user.email)

  if (!isCreator && !admin) {
    return { error: 'Forbidden', status: 403 }
  }

  return { user, session }
}

// GET /api/deliberations/[id]/manage - Get full deliberation details for creator/admin
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await getAuthorizedUser(id)

    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            ideas: true,
            members: true,
            cells: true,
          },
        },
        ideas: {
          orderBy: [
            { isChampion: 'desc' },
            { status: 'asc' },
            { totalVotes: 'desc' },
          ],
          select: {
            id: true,
            text: true,
            status: true,
            tier: true,
            totalVotes: true,
            isChampion: true,
          },
        },
        cells: {
          orderBy: [
            { status: 'asc' },
            { tier: 'desc' },
            { batch: 'asc' },
            { createdAt: 'desc' },
          ],
          select: {
            id: true,
            tier: true,
            batch: true,
            status: true,
            participants: {
              select: { userId: true, status: true },
            },
            ideas: {
              include: {
                idea: {
                  select: { id: true, text: true, totalVotes: true },
                },
              },
            },
            comments: {
              orderBy: { createdAt: 'desc' },
              take: 50,
              include: {
                user: {
                  select: { name: true },
                },
                idea: {
                  select: { text: true },
                },
              },
            },
            _count: {
              select: { votes: true },
            },
          },
        },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    return NextResponse.json(deliberation)
  } catch (error) {
    console.error('Error fetching deliberation:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

// PATCH /api/deliberations/[id]/manage - Update deliberation settings
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await getAuthorizedUser(id)

    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json()

    const allowedFields: Record<string, boolean> = {
      question: true,
      description: true,
      isPublic: true,
      votingTimeoutMs: true,
      submissionEndsAt: true,
      ideaGoal: true,
      accumulationEnabled: true,
      discussionDurationMs: true,
      continuousFlow: true,
      phase: true,
    }

    const data: Record<string, unknown> = {}
    for (const key of Object.keys(body)) {
      if (allowedFields[key]) data[key] = body[key]
    }

    // Enforce 10-minute edit window for question and description
    if (data.question !== undefined || data.description !== undefined) {
      const delib = await prisma.deliberation.findUnique({
        where: { id },
        select: { createdAt: true },
      })
      if (delib && Date.now() - delib.createdAt.getTime() > 10 * 60 * 1000) {
        return NextResponse.json({ error: 'Question and description can only be edited within 10 minutes of creation' }, { status: 400 })
      }
    }

    // Validate question
    if (data.question !== undefined) {
      if (typeof data.question !== 'string' || data.question.trim().length === 0) {
        return NextResponse.json({ error: 'Question cannot be empty' }, { status: 400 })
      }
      if (data.question.trim().length > 2000) {
        return NextResponse.json({ error: 'Question too long (max 2000 characters)' }, { status: 400 })
      }
      data.question = data.question.trim()
    }

    // Validate description
    if (data.description !== undefined && data.description !== null) {
      if (typeof data.description !== 'string') {
        return NextResponse.json({ error: 'Invalid description' }, { status: 400 })
      }
      if (data.description.trim().length > 5000) {
        return NextResponse.json({ error: 'Description too long (max 5000 characters)' }, { status: 400 })
      }
      data.description = data.description.trim() || null
    }

    // Validate phase transitions
    if (data.phase) {
      const validPhases = ['SUBMISSION', 'VOTING', 'ACCUMULATING', 'COMPLETED']
      if (!validPhases.includes(data.phase as string)) {
        return NextResponse.json({ error: 'Invalid phase' }, { status: 400 })
      }
      // When reopening submission, clear submissionEndsAt so the timer
      // processor doesn't immediately auto-start voting
      if (data.phase === 'SUBMISSION') {
        data.submissionEndsAt = null
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const updated = await prisma.deliberation.update({
      where: { id },
      data,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating deliberation:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
