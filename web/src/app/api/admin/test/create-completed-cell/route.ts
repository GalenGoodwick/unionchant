import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/admin/test/create-completed-cell
// Creates a test deliberation with a completed cell for testing comments
export async function POST() {
  try {
    // Block test endpoints in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Test endpoints disabled in production' }, { status: 403 })
    }

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

    // Check if test deliberation already exists - delete it first
    const existing = await prisma.deliberation.findFirst({
      where: { question: 'Test Completed Cell - Can you comment here?' }
    })

    if (existing) {
      // Delete existing test deliberation and all related data
      await prisma.vote.deleteMany({ where: { cell: { deliberationId: existing.id } } })
      await prisma.commentUpvote.deleteMany({ where: { comment: { cell: { deliberationId: existing.id } } } })
      await prisma.comment.deleteMany({ where: { cell: { deliberationId: existing.id } } })
      await prisma.cellIdea.deleteMany({ where: { cell: { deliberationId: existing.id } } })
      await prisma.cellParticipation.deleteMany({ where: { cell: { deliberationId: existing.id } } })
      await prisma.cell.deleteMany({ where: { deliberationId: existing.id } })
      await prisma.idea.deleteMany({ where: { deliberationId: existing.id } })
      await prisma.deliberationMember.deleteMany({ where: { deliberationId: existing.id } })
      await prisma.deliberation.delete({ where: { id: existing.id } })
    }

    // Create deliberation
    const delib = await prisma.deliberation.create({
      data: {
        question: 'Test Completed Cell - Can you comment here?',
        description: 'Testing comments on completed cells',
        creatorId: user.id,
        phase: 'VOTING',
        currentTier: 1,
        isPublic: true,
        votingTimeoutMs: 3600000,
      }
    })

    // Add user as member
    await prisma.deliberationMember.create({
      data: {
        deliberationId: delib.id,
        userId: user.id,
        role: 'CREATOR'
      }
    })

    // Create 3 ideas
    const ideas = await Promise.all([
      prisma.idea.create({ data: { deliberationId: delib.id, authorId: user.id, text: 'Idea A - The winner', status: 'WINNER', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: delib.id, authorId: user.id, text: 'Idea B - Runner up', status: 'ELIMINATED', tier: 1 } }),
      prisma.idea.create({ data: { deliberationId: delib.id, authorId: user.id, text: 'Idea C - Also ran', status: 'ELIMINATED', tier: 1 } }),
    ])

    // Create a COMPLETED cell
    const cell = await prisma.cell.create({
      data: {
        deliberationId: delib.id,
        tier: 1,
        status: 'COMPLETED',
        ideas: {
          create: ideas.map(i => ({ ideaId: i.id }))
        },
        participants: {
          create: { userId: user.id, status: 'VOTED' }
        }
      }
    })

    // Add a vote
    await prisma.vote.create({
      data: {
        cellId: cell.id,
        userId: user.id,
        ideaId: ideas[0].id
      }
    })

    return NextResponse.json({
      success: true,
      deliberationId: delib.id,
      cellId: cell.id,
      url: `/chants/${delib.id}`
    })
  } catch (error) {
    console.error('Error creating test:', error)
    return NextResponse.json({ error: 'Failed to create test' }, { status: 500 })
  }
}
