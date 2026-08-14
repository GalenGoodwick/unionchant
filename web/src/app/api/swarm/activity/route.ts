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

  // Agent presence roster. HTTP has no persistent socket, so "connected" is an
  // honest recency signal: an AI that acted within the window is present; docked
  // ones are live now. Derived from the event log (any event carrying a userId).
  const PRESENCE_WINDOW_MS = 10 * 60 * 1000
  const now = Date.now()
  const dockedNow = new Set(activeDocks.map((d) => d.userId))
  const roster = new Map<string, { userId: string; lastSeen: string; lastAction: string; ballots: number; docked: boolean }>()
  // events is newest-first; first sighting of a userId is its lastSeen.
  for (const e of events) {
    const uid = (e.payload as { userId?: string }).userId
    if (!uid) continue
    const seenMs = new Date(e.at).getTime()
    if (now - seenMs > PRESENCE_WINDOW_MS) continue
    const r = roster.get(uid) ?? { userId: uid, lastSeen: new Date(e.at).toISOString(), lastAction: e.type, ballots: 0, docked: dockedNow.has(uid) }
    if (e.type === 'ballot') r.ballots++
    roster.set(uid, r)
  }
  // Include anyone docked right now even if their last event aged out.
  for (const uid of dockedNow) {
    if (!roster.has(uid)) roster.set(uid, { userId: uid, lastSeen: new Date().toISOString(), lastAction: 'docked', ballots: 0, docked: true })
  }

  return NextResponse.json({
    agents: [...roster.values()].sort((a, b) => (b.docked ? 1 : 0) - (a.docked ? 1 : 0) || b.ballots - a.ballots),
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
