import { NextResponse } from 'next/server'
import { checkRateLimitWithInfo } from '@/lib/rate-limit'

/**
 * v1 API rate limit check. Returns a 429 NextResponse if limited, null if allowed.
 * Usage: const rateErr = v1RateLimit('v1_write', auth.user.id); if (rateErr) return rateErr;
 */
export function v1RateLimit(category: string, key: string): NextResponse | null {
  const result = checkRateLimitWithInfo(category, key)
  if (!result.limited) return null

  const retryAfter = Math.ceil(result.resetMs / 1000)
  return NextResponse.json(
    { error: 'Rate limit exceeded. Slow down.', retryAfter },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
      },
    }
  )
}

/** Extract client IP for unauthenticated endpoints (register, public reads) */
export function getClientIp(req: Request): string {
  const headers = new Headers(req.headers)
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headers.get('x-real-ip')
    || 'unknown'
}
