import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

const SECRET = process.env.NEXTAUTH_SECRET || 'dev-secret'
const MIN_ELAPSED_MS = 1500
const MAX_ELAPSED_MS = 300000

function signToken(timestamp: number): string {
  return createHmac('sha256', SECRET).update(`anon-challenge:${timestamp}`).digest('hex')
}

// GET — generate a signed challenge token (no auth required)
export async function GET() {
  const ts = Date.now()
  const sig = signToken(ts)
  return NextResponse.json({ token: `${ts}.${sig}` })
}

// POST — verify challenge completion (no auth required)
export async function POST(req: NextRequest) {
  try {
    const { token, pointerEvents, chaseDurationMs, evadeCount, surrendered } = await req.json()

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ verified: false })
    }

    // Validate HMAC signature
    const [tsStr, sig] = token.split('.')
    const ts = parseInt(tsStr, 10)
    if (isNaN(ts) || signToken(ts) !== sig) {
      return NextResponse.json({ verified: false })
    }

    // Validate timing
    const elapsed = Date.now() - ts
    if (elapsed < MIN_ELAPSED_MS || elapsed > MAX_ELAPSED_MS) {
      return NextResponse.json({ verified: false })
    }

    // Validate behavioral data
    const isSurrender = !!surrendered
    const validPointer = typeof pointerEvents === 'number' && pointerEvents >= (isSurrender ? 5 : 10)
    const validDuration = typeof chaseDurationMs === 'number' && chaseDurationMs >= (isSurrender ? 800 : 1200)
    const validEvade = typeof evadeCount === 'number' && evadeCount >= (isSurrender ? 1 : 2)

    if (!validPointer || !validDuration || !validEvade) {
      return NextResponse.json({ verified: false })
    }

    return NextResponse.json({ verified: true })
  } catch {
    return NextResponse.json({ verified: false })
  }
}
