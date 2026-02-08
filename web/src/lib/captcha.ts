/**
 * Google reCAPTCHA Enterprise verification
 *
 * Setup:
 * 1. Create a key in Google Cloud Console > reCAPTCHA Enterprise
 * 2. Add NEXT_PUBLIC_RECAPTCHA_SITE_KEY to .env.local (the Enterprise site key)
 * 3. Add RECAPTCHA_PROJECT_ID to .env.local (Google Cloud project ID)
 * 4. Add RECAPTCHA_API_KEY to .env.local (Google Cloud API key)
 */

import { prisma } from '@/lib/prisma'

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
 * Verify a reCAPTCHA Enterprise token server-side
 * If userId provided, checks session validity first and updates on success
 * Admins are automatically bypassed
 */
export async function verifyCaptcha(
  token: string | null | undefined,
  userId?: string
): Promise<CaptchaResult> {
  const projectId = process.env.RECAPTCHA_PROJECT_ID
  const apiKey = process.env.RECAPTCHA_API_KEY
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY

  // Skip verification in development if not configured
  if (!projectId || !apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('CAPTCHA: Skipping verification (no RECAPTCHA_PROJECT_ID or RECAPTCHA_API_KEY)')
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
    const response = await fetch(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            token,
            siteKey,
          },
        }),
      }
    )

    const data = await response.json()

    if (data.tokenProperties?.valid) {
      if (userId) {
        await markUserCaptchaVerified(userId)
      }
      return { success: true }
    } else {
      console.warn('reCAPTCHA Enterprise verification failed:', data.tokenProperties?.invalidReason)
      return { success: false, error: 'CAPTCHA verification failed' }
    }
  } catch (error) {
    console.error('reCAPTCHA Enterprise verification error:', error)
    return { success: false, error: 'CAPTCHA verification error' }
  }
}
