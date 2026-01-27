import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/deliberations/[id]/watch - Check if user is watching
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ isWatching: false })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ isWatching: false })
    }

    const watch = await prisma.watch.findUnique({
      where: {
        userId_deliberationId: {
          userId: user.id,
          deliberationId: id,
        },
      },
    })

    return NextResponse.json({ isWatching: !!watch })
  } catch (error) {
    console.error('Error checking watch status:', error)
    return NextResponse.json({ error: 'Failed to check watch status' }, { status: 500 })
  }
}

// POST /api/deliberations/[id]/watch - Watch a deliberation
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

    // Check if deliberation exists
    const deliberation = await prisma.deliberation.findUnique({
      where: { id },
    })

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 })
    }

    // Create watch (or do nothing if already watching)
    await prisma.watch.upsert({
      where: {
        userId_deliberationId: {
          userId: user.id,
          deliberationId: id,
        },
      },
      create: {
        userId: user.id,
        deliberationId: id,
      },
      update: {}, // No update needed
    })

    return NextResponse.json({ success: true, isWatching: true })
  } catch (error) {
    console.error('Error watching deliberation:', error)
    return NextResponse.json({ error: 'Failed to watch deliberation' }, { status: 500 })
  }
}

// DELETE /api/deliberations/[id]/watch - Unwatch a deliberation
export async function DELETE(
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

    // Delete watch if it exists
    await prisma.watch.deleteMany({
      where: {
        userId: user.id,
        deliberationId: id,
      },
    })

    return NextResponse.json({ success: true, isWatching: false })
  } catch (error) {
    console.error('Error unwatching deliberation:', error)
    return NextResponse.json({ error: 'Failed to unwatch deliberation' }, { status: 500 })
  }
}
