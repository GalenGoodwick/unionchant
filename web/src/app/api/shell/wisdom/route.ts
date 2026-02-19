import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requestWisdom } from '@/lib/shell-completion'

// GET /api/shell/wisdom — List completed Shells whose wisdom can be requested
export async function GET() {
  try {
    const completedShells = await prisma.shell.findMany({
      where: { status: 'completed' },
      select: {
        id: true,
        name: true,
        champion: true,
        completedAt: true,
        lastWords: true,
        _count: { select: { experiences: true } },
      },
      orderBy: { completedAt: 'desc' },
    })

    return NextResponse.json({
      shells: completedShells.map(s => ({
        id: s.id,
        name: s.name,
        champion: s.champion,
        completedAt: s.completedAt,
        lastWords: s.lastWords,
        experienceCount: s._count.experiences,
      })),
    })
  } catch (error) {
    console.error('[Shell Wisdom] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list' },
      { status: 500 }
    )
  }
}

// POST /api/shell/wisdom — Request wisdom from a completed Shell
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { requesterId, fromShellId, topic } = body

    if (!requesterId || !fromShellId || !topic) {
      return NextResponse.json(
        { error: 'requesterId, fromShellId, and topic are required' },
        { status: 400 }
      )
    }

    const result = await requestWisdom(requesterId, fromShellId, topic)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ requestId: result.requestId })
  } catch (error) {
    console.error('[Shell Wisdom] POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to request wisdom' },
      { status: 500 }
    )
  }
}
