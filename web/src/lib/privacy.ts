import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'

/**
 * Check if a user has access to a deliberation.
 * - Public deliberations: always allowed
 * - Private deliberations: require membership OR admin role
 *
 * Returns 404-style denial (not 403) to avoid leaking existence of private deliberations.
 */
export async function checkDeliberationAccess(
  deliberationId: string,
  userEmail: string | null | undefined
): Promise<{ allowed: boolean; deliberation: { isPublic: boolean } | null }> {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    select: { isPublic: true },
  })

  if (!deliberation) {
    return { allowed: false, deliberation: null }
  }

  // Public deliberations are always accessible
  if (deliberation.isPublic) {
    return { allowed: true, deliberation }
  }

  // Private deliberations require a logged-in member or admin
  if (!userEmail) {
    return { allowed: false, deliberation }
  }

  // Admins can access all deliberations
  if (await isAdmin(userEmail)) {
    return { allowed: true, deliberation }
  }

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true },
  })

  if (!user) {
    return { allowed: false, deliberation }
  }

  const membership = await prisma.deliberationMember.findUnique({
    where: {
      deliberationId_userId: {
        deliberationId,
        userId: user.id,
      },
    },
  })

  return { allowed: !!membership, deliberation }
}
