import prisma from '@/lib/prisma'

/**
 * Resolve a Common Ground user to a Unity Chant User.
 * Finds by cgId or creates with a synthetic email.
 * CG-created users are pre-verified (trusted source).
 */
export async function resolveCGUser(
  cgUserId: string,
  cgUsername: string,
  cgImageUrl?: string | null,
) {
  // Try to find existing user by cgId
  const byCgId = await prisma.user.findUnique({
    where: { cgId: cgUserId },
  })
  if (byCgId) return byCgId

  // Try by synthetic email (handles case where user exists but cgId not linked)
  const email = `cg_${cgUserId}@plugin.unitychant.com`
  const byEmail = await prisma.user.findUnique({ where: { email } })
  if (byEmail) {
    if (!byEmail.cgId) {
      await prisma.user.update({ where: { id: byEmail.id }, data: { cgId: cgUserId } })
    }
    return byEmail
  }

  // Create new user with synthetic email
  const now = new Date()
  try {
    return await prisma.user.create({
      data: {
        email,
        name: cgUsername,
        image: cgImageUrl || null,
        cgId: cgUserId,
        emailVerified: now,
        captchaVerifiedAt: now,
        onboardedAt: now,
      },
    })
  } catch {
    // Race condition: another request created between our checks
    const fallback = await prisma.user.findFirst({
      where: { OR: [{ cgId: cgUserId }, { email }] },
    })
    if (fallback) return fallback
    throw new Error(`Failed to resolve CG user: ${cgUserId}`)
  }
}

/**
 * Resolve a CG community to a Unity Chant Community.
 * Finds by cgCommunityId or creates new.
 */
export async function resolveCGCommunity(
  cgCommunityId: string,
  cgCommunityName: string,
  creatorUserId: string,
) {
  const existing = await prisma.community.findUnique({
    where: { cgCommunityId },
  })

  if (existing) {
    // Sync name if CG community was renamed
    if (existing.name !== cgCommunityName) {
      await prisma.community.update({
        where: { id: existing.id },
        data: { name: cgCommunityName },
      })
    }
    return existing
  }

  // Generate slug from name
  const baseSlug = cgCommunityName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'cg-community'

  // Ensure unique slug
  let slug = baseSlug
  let attempt = 0
  while (true) {
    const existing = await prisma.community.findUnique({ where: { slug } })
    if (!existing) break
    attempt++
    slug = `${baseSlug}-${attempt}`
  }

  const community = await prisma.community.create({
    data: {
      name: cgCommunityName,
      slug,
      cgCommunityId,
      isPublic: true,
      creatorId: creatorUserId,
      members: {
        create: {
          userId: creatorUserId,
          role: 'OWNER',
        },
      },
    },
  })

  return community
}
