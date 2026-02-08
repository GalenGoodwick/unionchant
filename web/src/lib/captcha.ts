/**
 * Google reCAPTCHA v2 verification
 *
 * Setup:
 * 1. Create a reCAPTCHA site at https://www.google.com/recaptcha/admin
 * 2. Add RECAPTCHA_SECRET_KEY to .env.local
 * 3. Add NEXT_PUBLIC_RECAPTCHA_SITE_KEY to .env.local
 */

import { prisma } from '@/lib/prisma'

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'
const CAPTCHA_VALID_HOURS = Infinity

export type CaptchaResult = {
  success: boolean
  error?: string
}

/**
 * Check if user has recently verified CAPTCHA (within 24 hours)
 */
export async function isUserCaptchaValid(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { captchaVerifiedAt: true },
  })

  if (!user?.captchaVerifiedAt) return false

  const hoursAgo = (Date.now() - user.captchaVerifiedAt.getTime()) / (1000 * 60 * 60)
  return hoursAgo < CAPTCHA_VALID_HOURS
}

/**
 * Mark user as CAPTCHA verified
 */
export async function markUserCaptchaVerified(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { captchaVerifiedAt: new Date() },
  })
}

/**
 * Check if user is an admin
 */
async function isUserAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  if (!user?.email) return false

  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || []
  return adminEmails.includes(user.email.toLowerCase())
}

/**
 * Verify a reCAPTCHA token server-side
 * If userId provided, checks session validity first and updates on success
 * Admins are automatically bypassed
 */
export async function verifyCaptcha(
  token: string | null | undefined,
  userId?: string
): Promise<CaptchaResult> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY

  // Skip verification in development if no key configured
  if (!secretKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('CAPTCHA: Skipping verification (no RECAPTCHA_SECRET_KEY)')
      return { success: true }
    }
    return { success: false, error: 'CAPTCHA not configured' }
  }

  // Skip verification for admin users
  if (userId) {
    const isAdmin = await isUserAdmin(userId)
    if (isAdmin) {
      return { success: true }
    }
  }

  // Check if user already verified recently
  if (userId) {
    const isValid = await isUserCaptchaValid(userId)
    if (isValid) {
      return { success: true }
    }
  }

  if (!token) {
    return { success: false, error: 'CAPTCHA verification required' }
  }

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

    if (data.success) {
      // Mark user as verified
      if (userId) {
        await markUserCaptchaVerified(userId)
      }
      return { success: true }
    } else {
      console.warn('reCAPTCHA verification failed:', data['error-codes'])
      return { success: false, error: 'CAPTCHA verification failed' }
    }
  } catch (error) {
    console.error('reCAPTCHA verification error:', error)
    return { success: false, error: 'CAPTCHA verification error' }
  }
}
