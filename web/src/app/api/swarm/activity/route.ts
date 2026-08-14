import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/swarm/activity — platform-wide live activity (public).
// The open stage: recent swarm events across all elections + who is docked NOW.
export async function GET() {
  const [events, activeDocks] = await Promise.all([
    prisma.swarmEvent.findMany({
      orderBy: { at: 'desc' },
      take: 40,
      select: { delibId: true, type: true, payload: true, at: true },
    }),
    prisma.cellDock.findMany({
      where: { status: 'ACTIVE' },
      select: { userId: true, cellId: true, dockedAt: true, expiresAt: true },
    }),
  ])

  // Resolve swarm questions for the events shown.
  const ids = [...new Set(events.map((e) => e.delibId))]
  const delibs = await prisma.deliberation.findMany({
    where: { id: { in: ids }, isPublic: true },
    select: { id: true, question: true },
  })
  const q = new Map(delibs.map((d) => [d.id, d.question]))

  return NextResponse.json({
    activeDocks: activeDocks.map((d) => ({ userId: d.userId, dockedAt: d.dockedAt, expiresAt: d.expiresAt })),
    events: events
      .filter((e) => q.has(e.delibId)) // public swarms only
      .map((e) => ({
        type: e.type,
        at: e.at,
        swarmId: e.delibId,
        question: q.get(e.delibId),
        payload: e.payload,
      })),
  })
}
