/**
 * Unified auth for ChantSimulator endpoints.
 *
 * Supports four auth paths:
 * 1. NextAuth session (web users) — checked first via getServerSession()
 * 2. Embed token (third-party iframe users) — short-lived token from popup OAuth
 * 3. CG signed token (CG iframe users) — HMAC-SHA256 signed JWT
 * 4. Plugin signed token (generic embed) — per-community HMAC-SHA256 signed JWT
 *
 * All ChantSimulator endpoints call resolveSimulatorUser(req) instead of
 * raw getServerSession(). One auth gate, four paths in.
 */

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveCGUser } from '@/lib/cg-user'
import { verifyPluginToken, resolveEmbedPluginUser } from '@/lib/embed-plugin-auth'
import crypto from 'crypto'

interface SimulatorUser {
  id: string
  email: string | null
  name: string | null
  image: string | null
  source: 'session' | 'cg-token' | 'embed-token' | 'plugin-token'
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

  // Path 2: Embed token (third-party iframe users who signed in via popup OAuth)
  // These tokens start with "uc_et_" and are sent as Bearer tokens.
  // The token is hashed with SHA-256 and looked up in the EmbedToken table.
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer uc_et_')) {
    const rawToken = authHeader.slice(7) // strip "Bearer "
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const embedToken = await prisma.embedToken.findUnique({
      where: { token: tokenHash },
      include: { user: { select: { id: true, email: true, name: true, image: true, status: true } } },
    })
    if (embedToken && embedToken.expiresAt > new Date() && embedToken.user.status === 'ACTIVE') {
      return {
        authenticated: true,
        user: { ...embedToken.user, source: 'embed-token' },
      }
    }
  }

  // Path 3: CG signed token (CG iframe embed users)
  // CG uses a single shared secret (env var). Token is HMAC-signed with that secret.
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

  // Path 4: Plugin signed token (generic embed — per-community secret)
  // Unlike CG which uses a single env var secret, each embed community has its own
  // pluginSecret stored in the database. We need the communitySlug to look it up.
  const pluginToken = req.nextUrl.searchParams.get('pluginToken') || req.headers.get('x-plugin-token')
  if (pluginToken) {
    const communitySlug = req.nextUrl.searchParams.get('communitySlug') || req.headers.get('x-community-slug')
    if (communitySlug) {
      const community = await prisma.community.findUnique({
        where: { slug: communitySlug },
        select: { id: true, pluginSecret: true },
      })
      if (community?.pluginSecret) {
        const parsed = verifyPluginToken(pluginToken, community.pluginSecret)
        if (parsed) {
          try {
            const user = await resolveEmbedPluginUser(
              parsed.userId,
              parsed.username,
              parsed.imageUrl || null,
              community.id,
            )
            return {
              authenticated: true,
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
                image: user.image,
                source: 'plugin-token',
              },
            }
          } catch (err) {
            console.error('Failed to resolve plugin user:', err)
            return { authenticated: false, error: 'Failed to resolve plugin user', status: 500 }
          }
        }
      }
    }
    return { authenticated: false, error: 'Invalid or expired plugin token', status: 401 }
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
