import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const UPVOTE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// POST /api/deliberations/[id]/upvote — toggle upvote on a deliberation
// Upvotes expire after 24 hours to keep feed relevant
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

    // Clean expired upvotes for this deliberation (background maintenance)
    const expiryCutoff = new Date(Date.now() - UPVOTE_TTL_MS)
    const expired = await prisma.deliberationUpvote.deleteMany({
      where: { deliberationId, createdAt: { lt: expiryCutoff } },
    })
    if (expired.count > 0) {
      // Recount active upvotes after cleanup
      const activeCount = await prisma.deliberationUpvote.count({
        where: { deliberationId },
      })
      await prisma.deliberation.update({
        where: { id: deliberationId },
        data: { upvoteCount: activeCount },
      })
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

      const newCount = await prisma.deliberationUpvote.count({ where: { deliberationId } })
      return NextResponse.json({ upvoted: false, upvoteCount: newCount })
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

      const newCount = await prisma.deliberationUpvote.count({ where: { deliberationId } })
      return NextResponse.json({ upvoted: true, upvoteCount: newCount })
    }
  } catch (error) {
    console.error('[Upvote] Error:', error)
    return NextResponse.json({ error: 'Failed to toggle upvote' }, { status: 500 })
  }
}

// GET /api/deliberations/[id]/upvote — check if user has upvoted
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deliberationId } = await params
    const session = await getServerSession(authOptions)

    const expiryCutoff = new Date(Date.now() - UPVOTE_TTL_MS)
    const activeCount = await prisma.deliberationUpvote.count({
      where: { deliberationId, createdAt: { gte: expiryCutoff } },
    })

    let userUpvoted = false
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
      if (user) {
        const vote = await prisma.deliberationUpvote.findUnique({
          where: { deliberationId_userId: { deliberationId, userId: user.id } },
        })
        userUpvoted = !!vote && vote.createdAt >= expiryCutoff
      }
    }

    return NextResponse.json({ upvoteCount: activeCount, userUpvoted })
  } catch (error) {
    console.error('[Upvote] Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
