import { NextRequest, NextResponse } from 'next/server'

const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

// Endpoints that use Bearer token auth (not cookies), exempt from Origin check
const EXEMPT_PATHS = [
  '/api/cron/',
  '/api/auth/',
  '/api/og',
  '/api/admin/test/',
]

export function proxy(req: NextRequest) {
  // Only check mutations to API routes
  if (!MUTATION_METHODS.includes(req.method) || !req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Skip exempt paths (cron uses Bearer, auth uses NextAuth internal flows)
  if (EXEMPT_PATHS.some(p => req.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Validate Origin header (OWASP recommended)
  const origin = req.headers.get('origin')
  if (!origin) {
    // No Origin header on a mutation — block it
    return NextResponse.json({ error: 'Forbidden: missing origin' }, { status: 403 })
  }

  const allowed = req.nextUrl.origin
  if (origin !== allowed) {
    return NextResponse.json({ error: 'Forbidden: origin mismatch' }, { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
