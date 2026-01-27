import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'

// GET /api/admin/users/[id] - Get user details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            deliberationsCreated: true,
            memberships: true,
            ideas: true,
            votes: true,
            comments: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      bannedAt: user.bannedAt,
      banReason: user.banReason,
      deletedAt: user.deletedAt,
      createdAt: user.createdAt,
      stats: user._count,
    })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}

// POST /api/admin/users/[id] - Update user status (ban/unban/delete)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action, reason } = body

    const user = await prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Prevent admins from banning themselves
    if (user.email === session.user.email) {
      return NextResponse.json({ error: 'Cannot modify your own account' }, { status: 400 })
    }

    switch (action) {
      case 'ban':
        await prisma.user.update({
          where: { id },
          data: {
            status: 'BANNED',
            bannedAt: new Date(),
            banReason: reason || 'Banned by administrator',
          },
        })
        // Invalidate sessions
        await prisma.session.deleteMany({ where: { userId: id } })
        break

      case 'unban':
        await prisma.user.update({
          where: { id },
          data: {
            status: 'ACTIVE',
            bannedAt: null,
            banReason: null,
          },
        })
        break

      case 'delete':
        await prisma.user.update({
          where: { id },
          data: {
            status: 'DELETED',
            deletedAt: new Date(),
            name: null,
            image: null,
          },
        })
        // Clean up auth
        await prisma.session.deleteMany({ where: { userId: id } })
        await prisma.account.deleteMany({ where: { userId: id } })
        await prisma.pushSubscription.deleteMany({ where: { userId: id } })
        await prisma.watch.deleteMany({ where: { userId: id } })
        break

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    return NextResponse.json({ success: true, action })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
