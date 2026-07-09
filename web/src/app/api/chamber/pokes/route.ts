import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// The local bridge drains pending public pokes (bearer-token only) and feeds them
// into the eyes on the machine where the geometries live.

function checkBearer(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const envToken = process.env.ENGINE_AGENT_TOKEN || process.env.ANTHROPIC_API_KEY
  return !!envToken && token === envToken
}

export async function GET(req: NextRequest) {
  if (!checkBearer(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const pending = await prisma.chamberPoke.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, take: 50 })
  if (pending.length) await prisma.chamberPoke.updateMany({ where: { id: { in: pending.map(p => p.id) } }, data: { status: 'applied' } })
  return NextResponse.json({ pokes: pending.map(p => ({ eye: p.eye, words: p.words })) })
}
