/**
 * Signed admin verification cookie.
 * HMAC-SHA256 with NEXTAUTH_SECRET, 4-hour TTL.
 */
import crypto from 'crypto'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE_NAME = 'uc_admin_verified'
const TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set')
  return secret
}

function sign(payload: object): string {
  const data = JSON.stringify(payload)
  const hmac = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url')
  return `${Buffer.from(data).toString('base64url')}.${hmac}`
}

function verify(token: string): { userId: string; exp: number } | null {
  try {
    const [dataB64, sig] = token.split('.')
    if (!dataB64 || !sig) return null
    const data = Buffer.from(dataB64, 'base64url').toString()
    const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url')
    if (sig !== expected) return null
    const parsed = JSON.parse(data)
    if (Date.now() > parsed.exp) return null
    return parsed
  } catch {
    return null
  }
}

export function setAdminVerifiedCookie(res: NextResponse, userId: string): NextResponse {
  const token = sign({ userId, exp: Date.now() + TTL_MS })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_MS / 1000,
  })
  return res
}

export function isAdminVerified(req: NextRequest, userId: string): boolean {
  const cookie = req.cookies.get(COOKIE_NAME)?.value
  if (!cookie) return false
  const payload = verify(cookie)
  if (!payload) return false
  return payload.userId === userId
}

export { COOKIE_NAME }
