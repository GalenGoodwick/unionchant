import { prisma } from '@/lib/prisma'
import { CommunityRole } from '@prisma/client'

export async function getCommunityMemberRole(
  communitySlug: string,
  userId: string
): Promise<CommunityRole | null> {
  const member = await prisma.communityMember.findFirst({
    where: {
      community: { slug: communitySlug },
      userId,
    },
    select: { role: true },
  })
  return member?.role ?? null
}

export async function checkCommunityAccess(
  communitySlug: string,
  userEmail: string | null | undefined
): Promise<{
  allowed: boolean
  community: { id: string; name: string; slug: string; isPublic: boolean } | null
  role: CommunityRole | null
}> {
  const community = await prisma.community.findUnique({
    where: { slug: communitySlug },
    select: { id: true, name: true, slug: true, isPublic: true },
  })

  if (!community) {
    return { allowed: false, community: null, role: null }
  }

  if (community.isPublic) {
    if (!userEmail) {
      return { allowed: true, community, role: null }
    }
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true },
    })
    if (!user) return { allowed: true, community, role: null }

    const role = await getCommunityMemberRole(communitySlug, user.id)
    return { allowed: true, community, role }
  }

  // Private community - must be a member
  if (!userEmail) {
    return { allowed: false, community, role: null }
  }

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true },
  })
  if (!user) return { allowed: false, community, role: null }

  const role = await getCommunityMemberRole(communitySlug, user.id)
  return { allowed: role !== null, community, role }
}
