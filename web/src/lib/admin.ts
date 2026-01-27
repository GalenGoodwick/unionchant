/**
 * Role and permission utilities
 */

import { prisma } from './prisma'

export type UserRole = 'USER' | 'MODERATOR' | 'ADMIN'

/**
 * Check if email belongs to an admin (legacy env var support + database role)
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false

  // Legacy: Check ADMIN_EMAILS env var for backwards compatibility
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || []

  if (adminEmails.includes(email.toLowerCase())) {
    return true
  }

  // Also allow test users in development
  if (process.env.NODE_ENV === 'development' && email.endsWith('@test.local')) {
    return true
  }

  return false
}

/**
 * Get user's role from database
 */
export async function getUserRole(email: string): Promise<UserRole> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  })
  return (user?.role as UserRole) || 'USER'
}

/**
 * Check if user has admin privileges (either by role or legacy env var)
 */
export async function isAdmin(email: string | null | undefined): Promise<boolean> {
  if (!email) return false

  // Check legacy env var first
  if (isAdminEmail(email)) return true

  // Check database role
  const role = await getUserRole(email)
  return role === 'ADMIN'
}

/**
 * Check if user has moderator or higher privileges
 */
export async function isModerator(email: string | null | undefined): Promise<boolean> {
  if (!email) return false

  // Admins are also moderators
  if (await isAdmin(email)) return true

  const role = await getUserRole(email)
  return role === 'MODERATOR'
}

/**
 * Permission helpers
 */
export const permissions = {
  canAccessAdmin: (role: UserRole) => role === 'ADMIN',
  canModerate: (role: UserRole) => role === 'ADMIN' || role === 'MODERATOR',
  canBanUsers: (role: UserRole) => role === 'ADMIN' || role === 'MODERATOR',
  canDeleteContent: (role: UserRole) => role === 'ADMIN' || role === 'MODERATOR',
}

export function getAdminEmails(): string[] {
  return process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []
}
