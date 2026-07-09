import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/app/api/v1/rate-limit'

export const dynamic = 'force-dynamic'

// Public poke — NO LOGIN. Anyone may open an eye in the chamber by speaking into it.
// Defense in depth: words are stripped to plain lowercase english here AND again by
// the local bridge; per-IP rate limit here; and structurally, in the chamber itself,
// weight is EARNED (prediction credit) and independence is MEASURED (correlated
// voices share one vote) — a flood of sock puppets collapses to a whisper.

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const limited = await checkRateLimit('chamber_poke', ip)
  if (limited) return NextResponse.json({ error: 'slow down — the chamber hears you, once a breath' }, { status: 429 })

  let body: { eye?: string; txt?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad body' }, { status: 400 }) }

  const eye = String(body.eye || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20)
  const words = String(body.txt || '').toLowerCase().split(/\s+/)
    .filter(w => /^[a-z]+$/.test(w) && w.length > 1).slice(0, 60).join(' ')
  if (!eye || !words) return NextResponse.json({ error: 'need a name and plain words' }, { status: 400 })

  const poke = await prisma.chamberPoke.create({ data: { eye, words, ip } })
  return NextResponse.json({ ok: true, id: poke.id, eye, words })
}
