import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { verifyCaptcha } from '@/lib/captcha'
import { sendEmail } from '@/lib/email'
import { passwordResetEmail } from '@/lib/email-templates'

// POST /api/auth/forgot-password - Send password reset email
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const limited = await checkRateLimit('signup', ip)
    if (limited) {
      return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
    }

    const { email, captchaToken } = await req.json()
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Verify CAPTCHA
    const captchaResult = await verifyCaptcha(captchaToken)
    if (!captchaResult.success) {
      return NextResponse.json({ error: captchaResult.error || 'CAPTCHA verification required' }, { status: 400 })
    }

    // Always return success to prevent email enumeration
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash) {
      return NextResponse.json({ success: true })
    }

    // Delete any existing reset tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: `reset:${email}` },
    })

    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1h

    await prisma.verificationToken.create({
      data: {
        identifier: `reset:${email}`,
        token,
        expires,
      },
    })

    try {
      const emailContent = passwordResetEmail({ email, token })
      await sendEmail({ to: email, ...emailContent })
    } catch (err) {
      console.error('Failed to send reset email:', err)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
  }
}
