import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/email'
import { verificationEmail } from '@/lib/email-templates'

// POST /api/auth/resend-verification - Resend verification email
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Rate limit: 3 per hour per email
    const limited = await checkRateLimit('resend-verification', email)
    if (limited) {
      return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true, passwordHash: true },
    })

    // Always return success to prevent email enumeration
    if (!user || !user.passwordHash || user.emailVerified) {
      return NextResponse.json({ success: true })
    }

    // Delete any existing tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: email },
    })

    // Generate new token
    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires,
      },
    })

    // Send email
    try {
      const emailContent = verificationEmail({ email, token })
      await sendEmail({ to: email, ...emailContent })
    } catch (err) {
      console.error('Failed to resend verification email:', err)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Resend verification error:', error)
    return NextResponse.json({ error: 'Failed to resend' }, { status: 500 })
  }
}
