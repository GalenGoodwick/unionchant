/**
 * WebAuthn configuration, challenge store, and passkey token helpers.
 * Challenge store uses database (not in-memory) to work across Vercel serverless instances.
 */
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

export const rpName = 'Unity Chant'
export const rpID = process.env.WEBAUTHN_RP_ID || 'unitychant.com'
export const origin = process.env.WEBAUTHN_ORIGIN || `https://${rpID}`

const CHALLENGE_TTL_MS = 5 * 60 * 1000

export async function storeChallenge(challenge: string, userId: string) {
  // Clean expired entries
  const cutoff = new Date(Date.now() - CHALLENGE_TTL_MS)
  await prisma.webAuthnChallenge.deleteMany({ where: { createdAt: { lt: cutoff } } })
  await prisma.webAuthnChallenge.create({ data: { challenge, userId } })
}

export async function consumeChallenge(challenge: string, userId: string): Promise<boolean> {
  const entry = await prisma.webAuthnChallenge.findUnique({ where: { challenge } })
  if (!entry) return false
  await prisma.webAuthnChallenge.delete({ where: { challenge } })
  if (Date.now() - entry.createdAt.getTime() > CHALLENGE_TTL_MS) return false
  if (entry.userId !== userId) return false
  return true
}

// For discoverable credential auth (signin), userId isn't known upfront
export async function consumeChallengeNoUser(challenge: string): Promise<string | null> {
  const entry = await prisma.webAuthnChallenge.findUnique({ where: { challenge } })
  if (!entry) return null
  await prisma.webAuthnChallenge.delete({ where: { challenge } })
  if (Date.now() - entry.createdAt.getTime() > CHALLENGE_TTL_MS) return null
  return entry.userId
}

// Accept any valid challenge regardless of userId (for discoverable credential signin)
export async function consumeChallengeAny(challenge: string): Promise<boolean> {
  const entry = await prisma.webAuthnChallenge.findUnique({ where: { challenge } })
  if (!entry) return false
  await prisma.webAuthnChallenge.delete({ where: { challenge } })
  if (Date.now() - entry.createdAt.getTime() > CHALLENGE_TTL_MS) return false
  return true
}

// Short-lived HMAC token for passkey signin (bridges WebAuthn verify → NextAuth signIn)
const PASSKEY_TOKEN_TTL_MS = 60 * 1000 // 60 seconds

function getSecret(): string {
  if (!process.env.NEXTAUTH_SECRET) {
    throw new Error('NEXTAUTH_SECRET environment variable is required')
  }
  return process.env.NEXTAUTH_SECRET
}

export function createPasskeyToken(userId: string): string {
  const payload = JSON.stringify({ userId, exp: Date.now() + PASSKEY_TOKEN_TTL_MS })
  const b64 = Buffer.from(payload).toString('base64url')
  const sig = crypto.createHmac('sha256', getSecret()).update(b64).digest('base64url')
  return `${b64}.${sig}`
}

export function verifyPasskeyToken(token: string): string | null {
  const [b64, sig] = token.split('.')
  if (!b64 || !sig) return null
  const expectedSig = crypto.createHmac('sha256', getSecret()).update(b64).digest('base64url')
  if (sig !== expectedSig) return null
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString())
    if (Date.now() > payload.exp) return null
    return payload.userId
  } catch {
    return null
  }
}
