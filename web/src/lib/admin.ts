/**
 * Admin utilities
 *
 * Set ADMIN_EMAILS environment variable with comma-separated admin email addresses
 * Example: ADMIN_EMAILS=admin@example.com,owner@example.com
 */

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false

  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || []

  // Also allow test users in development
  if (process.env.NODE_ENV === 'development' && email.endsWith('@test.local')) {
    return true
  }

  return adminEmails.includes(email.toLowerCase())
}

export function getAdminEmails(): string[] {
  return process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []
}
