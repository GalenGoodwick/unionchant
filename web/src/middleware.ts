import { NextRequest, NextResponse } from 'next/server'

const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

const CSRF_EXEMPT_PATHS = [
  '/api/cron/',
  '/api/auth/',
  '/api/admin/test/',
  '/api/stripe/webhook',
  '/api/bot/',
  '/api/cg/',
  '/api/v1/',
  '/api/embed/',
  '/api/ask-ai',
  '/api/shell/',
  '/api/eye/',
  '/api/claude-bridge',
]

// Patterns that match via regex (for dynamic segments)
const CSRF_EXEMPT_PATTERNS = [
  /^\/api\/deliberations\/[^/]+\/leave$/, // sendBeacon from page unload
  /^\/api\/deliberations\/[^/]+\/release-seats$/, // sendBeacon from page unload
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── First-time visitors → /how ──
  if (pathname === '/' || pathname === '/chants') {
    const visited = req.cookies.get('uc_visited')
    const hasSession = req.cookies.get('next-auth.session-token') ||
                       req.cookies.get('__Secure-next-auth.session-token')
    if (!visited && !hasSession) {
      const response = NextResponse.redirect(new URL('/how', req.url))
      response.cookies.set('uc_visited', '1', {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: '/',
        sameSite: 'lax',
      })
      return response
    }
    // Logged-in user without uc_visited cookie — set it silently
    if (!visited && hasSession) {
      const response = NextResponse.next()
      response.cookies.set('uc_visited', '1', {
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
        sameSite: 'lax',
      })
      return response
    }
  }

  // ── CORS preflight for embed API routes ──
  if (req.method === 'OPTIONS' && pathname.startsWith('/api/embed/')) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Plugin-Token, X-Community-Slug',
      },
    })
  }

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
  matcher: ['/', '/chants', '/talks/:path*', '/api/:path*'],
}
