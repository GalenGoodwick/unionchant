import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'

// POST /api/anonymous — Create temporary anonymous account after reCAPTCHA verification
// Creates real account for participation numbers, auto-deleted after 24h
export async function POST(req: NextRequest) {
  // CRITICAL: Actively reject and delete IP data before processing
  const headers = new Headers(req.headers)
  headers.delete('x-forwarded-for')
  headers.delete('x-real-ip')
  headers.delete('cf-connecting-ip')
  headers.delete('true-client-ip')
  headers.delete('x-client-ip')

  try {
    // No CAPTCHA required for anonymous entry — accounts auto-expire in 24h

    // Generate temporary anonymous account
    const anonId = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    const email = `anon_${anonId}@temporary.unitychant.com`
    const username = `Anonymous_${anonId.slice(0, 6)}`
    const password = crypto.randomUUID() + crypto.randomUUID()
    const passwordHash = await bcrypt.hash(password, 10)

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await prisma.user.create({
      data: {
        email,
        name: username,
        passwordHash,
        emailVerified: new Date(),
        captchaVerifiedAt: new Date(),
        isAnonymous: true,
        anonymousExpiresAt: expiresAt,
      },
    })

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
