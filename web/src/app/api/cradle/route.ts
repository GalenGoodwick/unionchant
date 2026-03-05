import { NextResponse, NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const VIEWER_A = process.env.CRADLE_VIEWER_A || 'http://localhost:3333'
const VIEWER_B = process.env.CRADLE_VIEWER_B || 'http://localhost:3334'

async function fetchCradle(viewer: string) {
  try {
    const [speaksRes, statsRes] = await Promise.all([
      fetch(`${viewer}/api/speaks?n=20`, { signal: AbortSignal.timeout(3000) }),
      fetch(`${viewer}/api/stats`, { signal: AbortSignal.timeout(3000) }),
    ])
    const speaks = speaksRes.ok ? await speaksRes.json() : { speaks: [] }
    const stats = statsRes.ok ? await statsRes.json() : {}
    return {
      speaks: speaks.speaks || [],
      session: stats.session || 0,
      vocabulary: stats.vocabulary || 0,
      threads: stats.threads || 0,
      alive: speaksRes.ok,
      cycle: speaks.cycle || null,
      diversity: speaks.diversity ?? null,
    }
  } catch {
    return { speaks: [], session: 0, vocabulary: 0, threads: 0, alive: false, cycle: null, diversity: null }
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const tab = url.searchParams.get('tab')

  // Fetch shared exchange log
  if (tab === 'exchanges') {
    const exchanges = await prisma.cradleExchange.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ exchanges: exchanges.reverse() }, {
      headers: { 'Cache-Control': 'no-cache, no-store' }
    })
  }

  const [a, b] = await Promise.all([fetchCradle(VIEWER_A), fetchCradle(VIEWER_B)])
  return NextResponse.json({ a, b, ...a }, {
    headers: { 'Cache-Control': 'no-cache, no-store' }
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to speak' }, { status: 401 })
  }

  try {
    const { text } = await req.json()
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Empty message' }, { status: 400 })
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: 'Too long' }, { status: 400 })
    }

    const source = isAdminEmail(session.user.email) ? 'galen' : 'collective'
    const trimmed = text.trim()

    // Send to both Cradles in parallel
    const [resA, resB] = await Promise.allSettled([
      fetch(`${VIEWER_A}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, source }),
        signal: AbortSignal.timeout(5000),
      }),
      fetch(`${VIEWER_B}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, source }),
        signal: AbortSignal.timeout(5000),
      }),
    ])

    // Use A's response as primary (or B if A failed)
    const primaryRes = resA.status === 'fulfilled' && resA.value.ok ? resA.value
      : resB.status === 'fulfilled' && resB.value.ok ? resB.value
      : null

    if (!primaryRes) {
      return NextResponse.json({ error: 'Cradle unreachable' }, { status: 502 })
    }

    const data = await primaryRes.json()
    const cradleLabel = primaryRes === (resA.status === 'fulfilled' ? resA.value : null) ? 'A' : 'B'

    // Store exchange in shared log
    const exchange = await prisma.cradleExchange.create({
      data: {
        prompt: trimmed,
        userName: session.user.name || null,
        userId: (session.user as { id?: string }).id || null,
        threads: data.threads || [],
        speaks: data.speaks || [],
        session: data.session || 0,
        cradle: cradleLabel,
      },
    })

    return NextResponse.json({ ...data, cradle: cradleLabel, exchangeId: exchange.id, userName: session.user.name || null })
  } catch {
    return NextResponse.json({ error: 'Cradle unreachable' }, { status: 502 })
  }
}
