import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { trackEvent } from '@/lib/funnel'

// POST /api/track — client-side funnel events (currently just email_click
// attribution when a ?src=email link lands). Server actions log directly.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const { type, deliberationId, source } = await req.json()
    if (type !== 'email_click') {
      return NextResponse.json({ error: 'Unknown event type' }, { status: 400 })
    }
    trackEvent('email_click', {
      userId: session?.user?.id || undefined,
      deliberationId: typeof deliberationId === 'string' ? deliberationId.slice(0, 64) : undefined,
      source: typeof source === 'string' ? source.slice(0, 32) : undefined,
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
