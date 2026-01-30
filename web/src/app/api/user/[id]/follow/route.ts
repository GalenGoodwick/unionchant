import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/user/[id]/follow - Check follow status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ isFollowing: false })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user || user.id === targetId) {
      return NextResponse.json({ isFollowing: false })
    }

    const follow = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: user.id, followingId: targetId } },
    })

    return NextResponse.json({ isFollowing: !!follow })
  } catch (error) {
    console.error('Error checking follow status:', error)
    return NextResponse.json({ isFollowing: false })
  }
}

// POST /api/user/[id]/follow - Follow a user
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, name: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (user.id === targetId) {
      return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })
    }

    // Check target exists
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    })
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await prisma.follow.create({
      data: { followerId: user.id, followingId: targetId },
    })

    // Create notification for the followed user
    await prisma.notification.create({
      data: {
        userId: targetId,
        type: 'FOLLOW',
        title: `${user.name || 'Someone'} started following you`,
      },
    }).catch(() => {}) // Don't fail if notification fails

    return NextResponse.json({ success: true })
  } catch (error) {
    // Handle unique constraint (already following)
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json({ success: true })
    }
    console.error('Error following user:', error)
    return NextResponse.json({ error: 'Failed to follow' }, { status: 500 })
  }
}

// DELETE /api/user/[id]/follow - Unfollow a user
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await prisma.follow.deleteMany({
      where: { followerId: user.id, followingId: targetId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error unfollowing user:', error)
    return NextResponse.json({ error: 'Failed to unfollow' }, { status: 500 })
  }
}
