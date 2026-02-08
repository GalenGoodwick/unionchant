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

  // ── Redirect returning users to /chants ──
  if (req.method === 'GET' && pathname === '/') {
    const hasVisited = req.cookies.get('visited_feed')
    const wantsHome = req.nextUrl.searchParams.has('home')
    if (hasVisited && !wantsHome) {
      return NextResponse.redirect(new URL('/chants', req.url), 307)
    }
  }

  // ── Set cookie when visiting /chants ──
  if (req.method === 'GET' && pathname === '/chants') {
    const res = NextResponse.next()
    if (!req.cookies.get('visited_feed')) {
      res.cookies.set('visited_feed', '1', {
        path: '/',
        maxAge: 365 * 24 * 60 * 60, // 1 year
        sameSite: 'lax',
        httpOnly: true,
      })
    }
    return res
  }

  // ── CSRF protection for API mutations ──
  if (MUTATION_METHODS.includes(req.method) && pathname.startsWith('/api/')) {
    if (CSRF_EXEMPT_PATHS.some(p => pathname.startsWith(p))) {
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
  matcher: ['/', '/feed', '/chants', '/talks/:path*', '/api/:path*'],
}
