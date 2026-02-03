import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/ideas/[ideaId]/revise - Get active revision for an idea
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  try {
    const { ideaId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const revision = await prisma.ideaRevision.findFirst({
      where: { ideaId, status: 'pending' },
      include: {
        proposedBy: { select: { id: true, name: true } },
        votes: {
          select: { userId: true, approve: true, user: { select: { name: true } } },
        },
      },
    })

    return NextResponse.json({ revision })
  } catch (error) {
    console.error('Error fetching revision:', error)
    return NextResponse.json({ error: 'Failed to fetch revision' }, { status: 500 })
  }
}

// POST /api/ideas/[ideaId]/revise - Propose a revision (any cell member)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  try {
    const { ideaId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Look up user by email (consistent with vote route)
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { newText } = await req.json()
    if (!newText?.trim() || newText.trim().length < 5) {
      return NextResponse.json({ error: 'Revision text too short' }, { status: 400 })
    }

    // Find the idea and its active cells
    const idea = await prisma.idea.findUnique({
      where: { id: ideaId },
      include: {
        cellIdeas: {
          include: {
            cell: {
              include: {
                participants: { select: { userId: true, status: true } },
              },
            },
          },
        },
      },
    })

    if (!idea) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
    }

    // Find an active cell containing this idea where user is a participant
    const activeCell = idea.cellIdeas.find(ci => {
      const cell = ci.cell
      if (cell.status !== 'DELIBERATING' && cell.status !== 'VOTING') return false
      return cell.participants.some(
        p => p.userId === user.id && (p.status === 'ACTIVE' || p.status === 'VOTED')
      )
    })

    if (!activeCell) {
      return NextResponse.json({ error: 'You must be in an active cell with this idea' }, { status: 403 })
    }

    // Check for existing pending revision
    const existingRevision = await prisma.ideaRevision.findFirst({
      where: { ideaId, status: 'pending' },
    })

    if (existingRevision) {
      return NextResponse.json({ error: 'A revision is already pending for this idea' }, { status: 409 })
    }

    // Threshold: 30% of active participants (excluding proposer), min 1
    const activeParticipants = activeCell.cell.participants.filter(
      p => p.status === 'ACTIVE' || p.status === 'VOTED'
    )
    const othersCount = activeParticipants.filter(p => p.userId !== user.id).length
    const required = Math.max(1, Math.ceil(othersCount * 0.3))

    const revision = await prisma.ideaRevision.create({
      data: {
        ideaId,
        proposedText: newText.trim(),
        proposedById: user.id,
        cellId: activeCell.cell.id,
        required,
      },
      include: {
        proposedBy: { select: { id: true, name: true } },
        votes: {
          select: { userId: true, approve: true, user: { select: { name: true } } },
        },
      },
    })

    return NextResponse.json({ revision })
  } catch (error) {
    console.error('Error proposing revision:', error)
    return NextResponse.json({ error: 'Failed to propose edit' }, { status: 500 })
  }
}
