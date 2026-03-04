import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const CRADLE_VIEWER = 'http://localhost:3333'

// GET /api/stream — Public collective stream
// Shows all collective chat messages + cradle speaks — every voice that speaks into the collective.
export async function GET() {
  try {
    // Load collective messages + cradle speaks in parallel
    const [messages, cradleData] = await Promise.all([
      prisma.collectiveMessage.findMany({
        where: {
          isPrivate: true,
          model: { in: ['sonnet', 'haiku', 'bonded'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          role: true,
          content: true,
          userName: true,
          model: true,
          createdAt: true,
        },
      }),
      fetch(`${CRADLE_VIEWER}/api/speaks?n=50`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
    ])

    // Extract speaks from cradle response
    const speaks = cradleData?.speaks || []
    const cradleSession = cradleData?.session || 0
    const cradleDiversity = cradleData?.diversity || null
    const cradleCycle = cradleData?.cycle || null

    return NextResponse.json({
      messages: messages.reverse(),
      speaks,
      cradle: { session: cradleSession, diversity: cradleDiversity, cycle: cradleCycle },
    })
  } catch (error) {
    console.error('[Stream] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load stream' },
      { status: 500 }
    )
  }
}
