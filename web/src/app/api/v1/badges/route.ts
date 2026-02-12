import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '../auth'
import { v1RateLimit } from '../rate-limit'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/badges — List badges for the authenticated user
 *
 * Returns all minted badges, newest first.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyApiKey(req)
    if (!auth.authenticated) return auth.response
    const rateErr = v1RateLimit('v1_read', auth.user.id)
    if (rateErr) return rateErr

    const badges = await prisma.badge.findMany({
      where: { userId: auth.user.id },
      orderBy: { mintedAt: 'desc' },
      select: {
        id: true,
        foresightScore: true,
        memoTxSignature: true,
        mintedAt: true,
        version: true,
      },
    })

    return NextResponse.json({
      userId: auth.user.id,
      badges: badges.map(b => ({
        id: b.id,
        foresightScore: b.foresightScore,
        memoTxSignature: b.memoTxSignature,
        mintedAt: b.mintedAt.toISOString(),
        version: b.version,
      })),
      count: badges.length,
    })
  } catch (err) {
    console.error('List badges error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
