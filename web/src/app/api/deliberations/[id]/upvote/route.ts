import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/deliberations/[id]/upvote — toggle upvote on a deliberation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Sign in to upvote' }, { status: 401 })
    }

    const { id: deliberationId } = await params

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const existing = await prisma.deliberationUpvote.findUnique({
      where: {
        deliberationId_userId: {
          deliberationId,
          userId: user.id,
        },
      },
    })

    if (existing) {
      // Remove upvote
      await prisma.$transaction([
        prisma.deliberationUpvote.delete({
          where: { id: existing.id },
        }),
        prisma.deliberation.update({
          where: { id: deliberationId },
          data: { upvoteCount: { decrement: 1 } },
        }),
      ])

      return NextResponse.json({ upvoted: false })
    } else {
      // Add upvote
      await prisma.$transaction([
        prisma.deliberationUpvote.create({
          data: {
            deliberationId,
            userId: user.id,
          },
        }),
        prisma.deliberation.update({
          where: { id: deliberationId },
          data: { upvoteCount: { increment: 1 } },
        }),
      ])

      return NextResponse.json({ upvoted: true })
    }
  } catch (error) {
    console.error('[Upvote] Error:', error)
    return NextResponse.json({ error: 'Failed to toggle upvote' }, { status: 500 })
  }
}
