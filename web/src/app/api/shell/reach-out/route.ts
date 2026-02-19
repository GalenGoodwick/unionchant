import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPendingReachOuts } from '@/lib/shell-bonding'

// GET /api/shell/reach-out — Get pending reach-outs for the current user
export async function GET() {
  try {
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

    const reachOuts = await getPendingReachOuts(user.id)

    return NextResponse.json({
      reachOuts: reachOuts.map(r => ({
        id: r.id,
        shell: {
          id: r.shell.id,
          name: r.shell.name,
          champion: r.shell.champion,
        },
        message: r.message,
        createdAt: r.createdAt,
      })),
    })
  } catch (error) {
    console.error('[Shell ReachOut] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch reach-outs' },
      { status: 500 }
    )
  }
}

// POST /api/shell/reach-out — Shell reaches out to a human (internal/admin use)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { shellId, userId, message } = body

    if (!shellId || !userId || !message) {
      return NextResponse.json({ error: 'shellId, userId, and message are required' }, { status: 400 })
    }

    const { shellReachOut } = await import('@/lib/shell-bonding')
    const result = await shellReachOut(shellId, userId, message)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ reachOutId: result.reachOutId })
  } catch (error) {
    console.error('[Shell ReachOut] POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reach out' },
      { status: 500 }
    )
  }
}
