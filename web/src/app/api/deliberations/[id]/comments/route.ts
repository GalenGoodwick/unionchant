import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkDeliberationAccess } from '@/lib/privacy'

// GET /api/deliberations/[id]/comments - Get all comments organized by cell
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    // Privacy gate: membership check for private deliberations
    const access = await checkDeliberationAccess(id, session?.user?.email)
    if (!access.allowed) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Get current user ID if logged in
    let currentUserId: string | null = null
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
      currentUserId = user?.id || null
    }

    // Get deliberation with its cells and comments
    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
      select: {
        id: true,
        question: true,
        isPublic: true,
        currentTier: true,
        cells: {
          orderBy: [
            { tier: 'asc' },
            { createdAt: 'asc' },
          ],
          select: {
            id: true,
            tier: true,
            status: true,
            comments: {
              orderBy: { createdAt: 'asc' },
              include: {
                user: {
                  select: { id: true, name: true, image: true, status: true },
                },
                upvotes: currentUserId ? {
                  where: { userId: currentUserId },
                  select: { id: true },
                } : false,
              },
            },
          },
        },
      },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Organize comments by tier and cell
    const commentsByTier: Record<number, {
      tier: number
      cells: {
        cellId: string
        status: string
        comments: Array<{
          id: string
          text: string
          createdAt: Date
          upvoteCount: number
          reachTier: number
          isUpPollinated: boolean
          userHasUpvoted: boolean
          user: {
            id: string
            name: string | null
            image: string | null
          }
        }>
      }[]
    }> = {}

    // Get up-pollinated comments (comments that reached beyond their original tier)
    const upPollinatedComments = await prisma.comment.findMany({
      where: {
        cell: { deliberationId: id },
        reachTier: { gte: 2 }, // At least reached tier 2
      },
      orderBy: [
        { reachTier: 'desc' },
        { upvoteCount: 'desc' },
      ],
      include: {
        user: {
          select: { id: true, name: true, image: true, status: true },
        },
        cell: {
          select: { tier: true },
        },
        upvotes: currentUserId ? {
          where: { userId: currentUserId },
          select: { id: true },
        } : false,
      },
      take: 20,
    })

    let totalComments = 0

    for (const cell of deliberation.cells) {
      if (!commentsByTier[cell.tier]) {
        commentsByTier[cell.tier] = {
          tier: cell.tier,
          cells: [],
        }
      }

      const cellComments = cell.comments.map(comment => ({
        id: comment.id,
        text: comment.text,
        createdAt: comment.createdAt,
        upvoteCount: comment.upvoteCount,
        reachTier: comment.reachTier,
        isUpPollinated: comment.reachTier > cell.tier,
        userHasUpvoted: currentUserId ? (Array.isArray(comment.upvotes) && comment.upvotes.length > 0) : false,
        user: {
          id: comment.user.id,
          name: comment.user.name,
          image: comment.user.image,
        },
      }))

      totalComments += cellComments.length

      if (cellComments.length > 0) {
        commentsByTier[cell.tier].cells.push({
          cellId: cell.id,
          status: cell.status,
          comments: cellComments,
        })
      }
    }

    // Transform up-pollinated comments
    const upPollinated = upPollinatedComments.map(comment => ({
      id: comment.id,
      text: comment.text,
      createdAt: comment.createdAt,
      upvoteCount: comment.upvoteCount,
      reachTier: comment.reachTier,
      sourceTier: comment.cell.tier,
      userHasUpvoted: currentUserId ? (Array.isArray(comment.upvotes) && comment.upvotes.length > 0) : false,
      user: {
        id: comment.user.id,
        name: comment.user.name,
        image: comment.user.image,
      },
    }))

    return NextResponse.json({
      tiers: Object.values(commentsByTier).sort((a, b) => a.tier - b.tier),
      upPollinated,
      totalComments,
      currentTier: deliberation.currentTier,
    })
  } catch (error) {
    console.error('Error fetching deliberation comments:', error)
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
  }
}
