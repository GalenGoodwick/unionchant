import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// The reader polls this with their poke id; when the cradle's geometry has answered
// their words (the bridge fills `response`), it comes back here — the personal reply,
// fed to whoever spoke most recently. No login.

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'need id' }, { status: 400 })
  const poke = await prisma.chamberPoke.findUnique({ where: { id }, select: { response: true, eye: true, words: true } })
  if (!poke) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ response: poke.response, eye: poke.eye, words: poke.words })
}
