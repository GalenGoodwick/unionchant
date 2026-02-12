import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/deliberations/[id]/leave - Leave if user hasn't participated
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

    // Check if user is a member
    const membership = await prisma.deliberationMember.findUnique({
      where: {
        deliberationId_userId: {
          deliberationId: id,
          userId: user.id,
        },
      },
    })

    if (!membership) {
      return NextResponse.json({ message: 'Not a member' })
    }

    // Don't remove the creator
    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: { creatorId: true },
    })

    if (deliberation?.creatorId === user.id) {
      return NextResponse.json({ message: 'Creator cannot leave' })
    }

    // Check participation: ideas, votes, or comments
    const [ideaCount, voteCount, commentCount] = await Promise.all([
      prisma.idea.count({
        where: { deliberationId: id, authorId: user.id },
      }),
      prisma.vote.count({
        where: {
          cell: { deliberationId: id },
          userId: user.id,
        },
      }),
      prisma.comment.count({
        where: {
          cell: { deliberationId: id },
          userId: user.id,
        },
      }),
    ])

    if (ideaCount > 0 || voteCount > 0 || commentCount > 0) {
      return NextResponse.json({ message: 'Has participated, keeping membership' })
    }

    // Remove cell participant records (if any)
    await prisma.cellParticipation.deleteMany({
      where: {
        userId: user.id,
        cell: { deliberationId: id },
      },
    })

    // Remove membership
    await prisma.deliberationMember.delete({
      where: {
        deliberationId_userId: {
          deliberationId: id,
          userId: user.id,
        },
      },
    })

    return NextResponse.json({ message: 'Left successfully' })
  } catch (error) {
    console.error('Error leaving deliberation:', error)
    return NextResponse.json({ error: 'Failed to leave' }, { status: 500 })
  }
}
