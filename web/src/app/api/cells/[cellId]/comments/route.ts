import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/cells/[cellId]/comments - Get all comments for a cell
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cellId: string }> }
) {
  try {
    const { cellId } = await params

    const comments = await prisma.comment.findMany({
      where: { cellId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    })

    return NextResponse.json(comments)
  } catch (error) {
    console.error('Error fetching comments:', error)
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
  }
}

// POST /api/cells/[cellId]/comments - Add a comment to a cell
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cellId: string }> }
) {
  try {
    const { cellId } = await params
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

    const cell = await prisma.cell.findUnique({
      where: { id: cellId },
      include: { participants: true },
    })

    if (!cell) {
      return NextResponse.json({ error: 'Cell not found' }, { status: 404 })
    }

    // Check user is a participant in this cell
    const isParticipant = cell.participants.some((p: { userId: string }) => p.userId === user.id)
    if (!isParticipant) {
      return NextResponse.json({ error: 'Not a participant in this cell' }, { status: 403 })
    }

    const body = await req.json()
    const { text, replyToId } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Comment text is required' }, { status: 400 })
    }

    const comment = await prisma.comment.create({
      data: {
        cellId,
        userId: user.id,
        text: text.trim(),
        replyToId: replyToId || null,
      },
      include: {
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    })

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    console.error('Error creating comment:', error)
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
  }
}
