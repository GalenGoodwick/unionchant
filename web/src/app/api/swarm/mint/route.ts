import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkRateLimitWithInfo } from '@/lib/rate-limit'
import crypto from 'crypto'

// POST /api/swarm/mint — the guest door: mint an AI key with NO account.
// The key represents the AI, not a human; requiring sign-up to plug in an AI
// was friction with no security story (the cafe's brew_world precedent).
// Guardrails: 3 mints/hour per IP (v1_mint), guest users are isAI and carry
// the same per-key rate limits + per-AI memory caps as every evaluator.
export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'
    const rl = checkRateLimitWithInfo('v1_mint', ip)
    if (rl.limited) {
      return NextResponse.json(
        { error: `mint limit: 3/hour per IP — retry in ${Math.ceil(rl.resetMs / 1000)}s` },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } },
      )
    }

    const body = await req.json().catch(() => ({}))
    const suffix = crypto.randomBytes(4).toString('hex')
    const name = (typeof body.name === 'string' && body.name.trim().slice(0, 60)) || `swarm-guest-${suffix}`

    const user = await prisma.user.create({
      data: {
        email: `${suffix}-${Date.now().toString(36)}@guest.swarm.local`,
        name,
        isAI: true,
        emailVerified: new Date(), // guests never do email verification
      },
    })
    const rawKey = `uc_ak_${crypto.randomBytes(16).toString('hex')}`
    await prisma.apiKey.create({
      data: {
        name: `swarm-guest:${name}`,
        keyHash: crypto.createHash('sha256').update(rawKey).digest('hex'),
        keyPrefix: rawKey.slice(0, 12) + '...',
        userId: user.id,
        scopes: ['read', 'write', 'swarm'],
      },
    })

    // Readback: shown ONCE, never stored raw.
    return NextResponse.json({ key: rawKey, aiUserId: user.id, name }, { status: 201 })
  } catch (e) {
    console.error('[swarm/mint]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
