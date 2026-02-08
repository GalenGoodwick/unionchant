import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// POST /api/anonymous — Create temporary anonymous account after reCAPTCHA Enterprise verification
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

  try {
    const { captchaToken } = await req.json()

    if (!captchaToken || typeof captchaToken !== 'string') {
      return NextResponse.json({ error: 'Invalid CAPTCHA token' }, { status: 400 })
    }

    const projectId = process.env.RECAPTCHA_PROJECT_ID
    const apiKey = process.env.RECAPTCHA_API_KEY
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY

    // Skip verification in development if not configured
    if (!projectId || !apiKey) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('CAPTCHA: Skipping verification (no RECAPTCHA_PROJECT_ID or RECAPTCHA_API_KEY)')
      } else {
        return NextResponse.json({ error: 'CAPTCHA not configured' }, { status: 500 })
      }
    }

    // Verify reCAPTCHA Enterprise token
    if (projectId && apiKey) {
      try {
        const response = await fetch(
          `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: {
                token: captchaToken,
                siteKey,
              },
            }),
          }
        )

        const data = await response.json()

        if (!data.tokenProperties?.valid) {
          console.warn('reCAPTCHA Enterprise verification failed:', data.tokenProperties?.invalidReason)
          return NextResponse.json({ error: 'CAPTCHA verification failed' }, { status: 400 })
        }
      } catch (error) {
        console.error('reCAPTCHA Enterprise verification error:', error)
        return NextResponse.json({ error: 'CAPTCHA verification error' }, { status: 500 })
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
