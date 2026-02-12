import crypto from 'crypto'
import prisma from '@/lib/prisma'

/**
 * Find or create a Community for an embedding site.
 * Each unique embedOrigin gets one community.
 */
export async function createEmbedCommunity(
  name: string,
  embedOrigin: string,
  creatorUserId: string,
) {
  // Check if community with this origin already exists
  const existing = await prisma.community.findFirst({
    where: { embedOrigin },
  })
  if (existing) return existing

  // Generate slug from name
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'embed-community'

  let slug = baseSlug
  let attempt = 0
  while (true) {
    const found = await prisma.community.findUnique({ where: { slug } })
    if (!found) break
    attempt++
    slug = `${baseSlug}-${attempt}`
  }

  const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

  return prisma.community.create({
    data: {
      name,
      slug,
      embedOrigin,
      inviteCode,
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
}
