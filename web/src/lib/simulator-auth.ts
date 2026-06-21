/**
 * Unified auth for ChantSimulator endpoints.
 *
 * Supports three auth paths:
 * 1. NextAuth session (web users) — checked first via getServerSession()
 * 2. Embed token (third-party iframe users) — short-lived token from popup OAuth
 * 3. Plugin signed token (generic embed) — per-community HMAC-SHA256 signed JWT
 *
 * All ChantSimulator endpoints call resolveSimulatorUser(req) instead of
 * raw getServerSession(). One auth gate, three paths in.
 */

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyPluginToken, resolveEmbedPluginUser } from '@/lib/embed-plugin-auth'
import crypto from 'crypto'

interface SimulatorUser {
  id: string
  email: string | null
  name: string | null
  image: string | null
  source: 'session' | 'embed-token' | 'plugin-token'
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

  // Path 3: Plugin signed token (generic embed — per-community secret)
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

