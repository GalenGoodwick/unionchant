import { NextResponse, NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const VIEWER = 'http://localhost:3333'

export async function GET() {
  try {
    const [speaksRes, statsRes] = await Promise.all([
      fetch(`${VIEWER}/api/speaks?n=20`, { signal: AbortSignal.timeout(3000) }),
      fetch(`${VIEWER}/api/stats`, { signal: AbortSignal.timeout(3000) }),
    ])

    const speaks = speaksRes.ok ? await speaksRes.json() : { speaks: [] }
    const stats = statsRes.ok ? await statsRes.json() : {}

    return NextResponse.json({
      speaks: speaks.speaks || [],
      session: stats.session || 0,
      vocabulary: stats.vocabulary || 0,
      threads: stats.threads || 0,
      alive: speaksRes.ok,
    }, {
      headers: { 'Cache-Control': 'no-cache, no-store' }
    })
  } catch {
    return NextResponse.json({ speaks: [], session: 0, vocabulary: 0, threads: 0, alive: false }, { status: 200 })
  }
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

    const res = await fetch(`${VIEWER}/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), source: 'collective' }),
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Cradle unreachable' }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Cradle unreachable' }, { status: 502 })
  }
}
