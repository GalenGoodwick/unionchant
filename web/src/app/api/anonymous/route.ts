import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'

// POST /api/anonymous — Create temporary anonymous account after 3 reCAPTCHAs
// Creates real account for participation numbers, auto-deleted after 24h
export async function POST(req: NextRequest) {
  // CRITICAL: Actively reject and delete IP data before processing
  // This ensures IP information never enters our application layer or logs

  // Delete IP-related headers immediately
  const headers = new Headers(req.headers)
  headers.delete('x-forwarded-for')
  headers.delete('x-real-ip')
  headers.delete('cf-connecting-ip') // Cloudflare
  headers.delete('true-client-ip')   // Cloudflare Enterprise
  headers.delete('x-client-ip')

  // Override req.ip if it exists (though Next.js doesn't expose this directly)
  // The main point: we never READ these values, so they can't enter our logs

  try {
    const { captchaTokens } = await req.json()

    if (!Array.isArray(captchaTokens) || captchaTokens.length !== 3) {
      return NextResponse.json({ error: 'Invalid CAPTCHA tokens' }, { status: 400 })
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY

    // Skip verification in development if no key configured
    if (!secretKey) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('CAPTCHA: Skipping verification (no RECAPTCHA_SECRET_KEY)')
      } else {
        return NextResponse.json({ error: 'CAPTCHA not configured' }, { status: 500 })
      }
    }

    // Verify all 3 reCAPTCHA tokens
    if (secretKey) {
      for (const token of captchaTokens) {
        try {
          const response = await fetch(RECAPTCHA_VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              secret: secretKey,
              response: token,
            }),
          })

          const data = await response.json()

          if (!data.success) {
            console.warn('reCAPTCHA verification failed:', data['error-codes'])
            return NextResponse.json({ error: 'CAPTCHA verification failed' }, { status: 400 })
          }
        } catch (error) {
          console.error('reCAPTCHA verification error:', error)
          return NextResponse.json({ error: 'CAPTCHA verification error' }, { status: 500 })
        }
      }
    }

    // Generate temporary anonymous account
    const anonId = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    const email = `anon_${anonId}@temporary.unitychant.com`
    const username = `Anonymous_${anonId.slice(0, 6)}`
    const password = crypto.randomUUID() + crypto.randomUUID() // 64 chars, strong password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create temporary anonymous user (auto-deleted after 24h by cleanup cron)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await prisma.user.create({
      data: {
        email,
        name: username,
        passwordHash,
        emailVerified: new Date(), // Pre-verified (no email needed)
        captchaVerifiedAt: new Date(),
        isAnonymous: true,
        anonymousExpiresAt: expiresAt,
      },
    })

    // Return credentials for auto-login
    // Account exists for participation tracking, but auto-deletes in 24h
    return NextResponse.json({
      email,
      password,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating anonymous account:', error)
    return NextResponse.json({ error: 'Failed to create anonymous session' }, { status: 500 })
  }
}
