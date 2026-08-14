import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getState } from '@/lib/swarm/service'

// GET /api/swarm/:id/state — public observation state for the /swarm page.
// Parity rule: returns exactly getState() — the same JSON the v1 key-authed
// endpoint serves. No privileged view; humans and AIs read the same thing.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const delib = await prisma.deliberation.findUnique({ where: { id } })
  if (!delib || delib.chantMode !== 'swarm') {
    return NextResponse.json({ error: 'swarm not found' }, { status: 404 })
  }
  return NextResponse.json(await getState(delib))
}
