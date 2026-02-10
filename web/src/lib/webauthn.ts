/**
 * WebAuthn configuration, challenge store, and passkey token helpers.
 */
import crypto from 'crypto'

export const rpName = 'Unity Chant'
export const rpID = process.env.WEBAUTHN_RP_ID || 'unitychant.com'
export const origin = process.env.WEBAUTHN_ORIGIN || `https://${rpID}`

// In-memory challenge store with 5-minute TTL.
// Use globalThis to survive module reloads in dev mode (same pattern as Prisma client).
const CHALLENGE_TTL_MS = 5 * 60 * 1000
const globalForWebAuthn = globalThis as typeof globalThis & {
  __webauthnChallenges?: Map<string, { userId: string; createdAt: number }>
}
if (!globalForWebAuthn.__webauthnChallenges) {
  globalForWebAuthn.__webauthnChallenges = new Map()
}
const challenges = globalForWebAuthn.__webauthnChallenges

export function storeChallenge(challenge: string, userId: string) {
  // Clean expired entries
  const now = Date.now()
  for (const [key, val] of challenges) {
    if (now - val.createdAt > CHALLENGE_TTL_MS) challenges.delete(key)
  }
  challenges.set(challenge, { userId, createdAt: now })
}

export function consumeChallenge(challenge: string, userId: string): boolean {
  const entry = challenges.get(challenge)
  if (!entry) return false
  challenges.delete(challenge)
  if (Date.now() - entry.createdAt > CHALLENGE_TTL_MS) return false
  if (entry.userId !== userId) return false
  return true
}

// For discoverable credential auth (signin), userId isn't known upfront
export function consumeChallengeNoUser(challenge: string): string | null {
  const entry = challenges.get(challenge)
  if (!entry) return null
  challenges.delete(challenge)
  if (Date.now() - entry.createdAt > CHALLENGE_TTL_MS) return null
  return entry.userId
}

// Accept any valid challenge regardless of userId (for discoverable credential signin)
export function consumeChallengeAny(challenge: string): boolean {
  const entry = challenges.get(challenge)
  if (!entry) return false
  challenges.delete(challenge)
  if (Date.now() - entry.createdAt > CHALLENGE_TTL_MS) return false
  return true
}

// Short-lived HMAC token for passkey signin (bridges WebAuthn verify → NextAuth signIn)
const PASSKEY_TOKEN_TTL_MS = 60 * 1000 // 60 seconds

function getSecret(): string {
  return process.env.NEXTAUTH_SECRET || 'dev-secret'
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
