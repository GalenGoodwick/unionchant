/**
 * Generalized embed plugin auth — mirrors the CG pattern but per-community.
 *
 * Each embed community has its own pluginSecret (stored on Community model).
 * The embedder's backend signs HMAC-SHA256 tokens for their users.
 * UC verifies the signature and auto-creates synthetic accounts.
 */

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

// ─── Token Types ───

export interface PluginTokenPayload {
  userId: string        // External user ID on the embedder's platform
  username: string      // Display name
  imageUrl?: string | null
  exp: number           // Unix timestamp (seconds)
}

// ─── Token Signing (for setup page testing + documentation) ───

export function createPluginToken(
  payload: Omit<PluginTokenPayload, 'exp'>,
  secret: string,
  ttlSeconds = 14400, // 4 hours
): string {
  const full: PluginTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }
  const data = Buffer.from(JSON.stringify(full)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(data).digest('hex')
  return `${data}.${sig}`
}

// ─── Token Verification ───

export function verifyPluginToken(token: string, secret: string): PluginTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [data, sig] = parts

  // Verify HMAC signature
  let expectedSig: string
  try {
    expectedSig = crypto.createHmac('sha256', secret).update(data).digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
      return null
    }
  } catch {
    return null
  }

  // Decode and validate payload
  try {
    const payload: PluginTokenPayload = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (!payload.userId || !payload.username) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

// ─── Synthetic User Resolution ───

/**
 * Find or create a synthetic UC account for an embed plugin user.
 * Mirrors resolveCGUser() but uses embedExternalId + community scoping.
 *
 * Email format: embed_{externalUserId}_{communityId}@plugin.unitychant.com
 */
export async function resolveEmbedPluginUser(
  externalUserId: string,
  username: string,
  imageUrl: string | null,
  communityId: string,
) {
  // Synthetic email scoped to this community
  const email = `embed_${externalUserId}_${communityId}@plugin.unitychant.com`

  // Try by email first (most reliable lookup)
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    // Sync name/image if changed
    if (existing.name !== username || existing.image !== imageUrl) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { name: username, image: imageUrl || existing.image },
      })
    }
    return existing
  }

  // Create new synthetic user
  const now = new Date()
  try {
    const user = await prisma.user.create({
      data: {
        email,
        name: username,
        image: imageUrl || null,
        embedExternalId: `${externalUserId}:${communityId}`,
        emailVerified: now,
        captchaVerifiedAt: now,
        onboardedAt: now,
      },
    })

    // Auto-add to community as MEMBER
    await prisma.communityMember.upsert({
      where: { communityId_userId: { communityId, userId: user.id } },
      update: { lastActiveAt: now },
      create: { communityId, userId: user.id, role: 'MEMBER' },
    })

    return user
  } catch {
    // Race condition — another request created between our check
    const fallback = await prisma.user.findUnique({ where: { email } })
    if (fallback) return fallback
    throw new Error(`Failed to resolve embed plugin user: ${externalUserId}`)
  }
}
