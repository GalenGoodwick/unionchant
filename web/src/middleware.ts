import { NextRequest, NextResponse } from 'next/server'

const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

const CSRF_EXEMPT_PATHS = [
  '/api/cron/',
  '/api/auth/',
  '/api/og',
  '/api/admin/test/',
  '/api/stripe/webhook',
  '/api/bot/',
  '/api/cg/',
  '/api/v1/',
]

// Patterns that match via regex (for dynamic segments)
const CSRF_EXEMPT_PATTERNS = [
  /^\/api\/deliberations\/[^/]+\/leave$/, // sendBeacon from page unload
  /^\/api\/deliberations\/[^/]+\/release-seats$/, // sendBeacon from page unload
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Backward-compat: /talks/* → /chants/* ──
  if (pathname.startsWith('/talks')) {
    const newPath = pathname.replace(/^\/talks/, '/chants') + req.nextUrl.search
    return NextResponse.redirect(new URL(newPath, req.url), 301)
  }

  // ── Backward-compat: /api/bot/talks/* → /api/bot/chants/* ──
  if (pathname.startsWith('/api/bot/talks')) {
    const newPath = pathname.replace(/^\/api\/bot\/talks/, '/api/bot/chants') + req.nextUrl.search
    return NextResponse.redirect(new URL(newPath, req.url), 308)
  }

  // ── CSRF protection for API mutations ──
  if (MUTATION_METHODS.includes(req.method) && pathname.startsWith('/api/')) {
    if (CSRF_EXEMPT_PATHS.some(p => pathname.startsWith(p)) ||
        CSRF_EXEMPT_PATTERNS.some(p => p.test(pathname))) {
      return NextResponse.next()
    }

    const origin = req.headers.get('origin')
    if (!origin) {
      return NextResponse.json({ error: 'Forbidden: missing origin' }, { status: 403 })
    }

    const allowed = req.nextUrl.origin
    if (origin !== allowed) {
      return NextResponse.json({ error: 'Forbidden: origin mismatch' }, { status: 403 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/talks/:path*', '/api/:path*'],
}
