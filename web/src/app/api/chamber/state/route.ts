import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// The Chamber bridge: the local cradle's units-daemon elects a collective precedent;
// chamber-bridge.js pushes the state here; the public front page reads it. No login
// to READ — the chamber is a public square. Writes need the machine bearer token.

function checkBearer(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const envToken = process.env.ENGINE_AGENT_TOKEN || process.env.ANTHROPIC_API_KEY
  return !!envToken && token === envToken
}

export async function GET() {
  const row = await prisma.chamberState.findUnique({ where: { id: 'main' } })
  return NextResponse.json(row ? { ...(row.data as object), updatedAt: row.updatedAt } : { offline: true })
}

export async function POST(req: NextRequest) {
  if (!checkBearer(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const data = await req.json()
  await prisma.chamberState.upsert({ where: { id: 'main' }, create: { id: 'main', data }, update: { data } })
  return NextResponse.json({ ok: true })
}
