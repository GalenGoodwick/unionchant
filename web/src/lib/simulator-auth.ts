/**
 * Unified auth for ChantSimulator endpoints.
 *
 * Supports two auth paths:
 * 1. NextAuth session (web users) — checked first via getServerSession()
 * 2. CG signed token (CG iframe users) — HMAC-SHA256 signed JWT in query param or header
 *
 * All ChantSimulator endpoints call resolveSimulatorUser(req) instead of
 * raw getServerSession(). One auth gate, two paths in.
 */

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveCGUser } from '@/lib/cg-user'
import crypto from 'crypto'

interface SimulatorUser {
  id: string
  email: string | null
  name: string | null
  image: string | null
  source: 'session' | 'cg-token'
}

interface AuthSuccess {
  authenticated: true
  user: SimulatorUser
}

interface AuthFailure {
  authenticated: false
  error: string
  status: number
}

export type SimulatorAuthResult = AuthSuccess | AuthFailure

/**
 * Resolve the current user from either NextAuth session or CG signed token.
 *
 * CG token format (query param `cgToken` or header `X-CG-Token`):
 *   base64url({ cgUserId, cgUsername, cgImageUrl, exp }) + '.' + hmac_signature
 *
 * Signed with CG_PLUGIN_SECRET using HMAC-SHA256.
 */
export async function resolveSimulatorUser(req: NextRequest): Promise<SimulatorAuthResult> {
  // Path 1: NextAuth session (web users)
  const session = await getServerSession(authOptions)
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true, name: true, image: true },
    })
    if (user) {
      return {
        authenticated: true,
        user: { ...user, source: 'session' },
      }
    }
  }

  // Path 2: CG signed token (iframe embed users)
  const cgToken = req.nextUrl.searchParams.get('cgToken') || req.headers.get('x-cg-token')
  if (cgToken) {
    const secret = process.env.CG_PLUGIN_SECRET
    if (!secret) {
      return { authenticated: false, error: 'CG auth not configured', status: 500 }
    }

    const parsed = verifyCGToken(cgToken, secret)
    if (!parsed) {
      return { authenticated: false, error: 'Invalid or expired CG token', status: 401 }
    }

    try {
      const user = await resolveCGUser(parsed.cgUserId, parsed.cgUsername, parsed.cgImageUrl)
      return {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          source: 'cg-token',
        },
      }
    } catch (err) {
      console.error('Failed to resolve CG user from token:', err)
      return { authenticated: false, error: 'Failed to resolve CG user', status: 500 }
    }
  }

  return { authenticated: false, error: 'Unauthorized', status: 401 }
}

// ─── CG Token Signing & Verification ───

interface CGTokenPayload {
  cgUserId: string
  cgUsername: string
  cgImageUrl?: string | null
  exp: number // Unix timestamp (seconds)
}

/**
 * Create a signed CG token for embedding.
 * Called by the CG plugin when redirecting users to unitychant.com.
 *
 * Token format: base64url(payload) + '.' + hmac_hex
 * Expires in `ttlSeconds` (default 4 hours, matching admin session TTL).
 */
export function createCGToken(
  payload: Omit<CGTokenPayload, 'exp'>,
  secret: string,
  ttlSeconds = 14400, // 4 hours
): string {
  const full: CGTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }
  const data = Buffer.from(JSON.stringify(full)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(data).digest('hex')
  return `${data}.${sig}`
}

/**
 * Verify a CG signed token. Returns payload if valid, null if invalid/expired.
 */
function verifyCGToken(token: string, secret: string): CGTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [data, sig] = parts

  // Verify signature
  const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('hex')
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
    return null
  }

  // Decode and check expiry
  try {
    const payload: CGTokenPayload = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (!payload.cgUserId || !payload.cgUsername) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}
