import { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import CommunityInviteClient from './CommunityInviteClient'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params

  const community = await prisma.community.findUnique({
    where: { inviteCode: code },
    select: {
      name: true,
      description: true,
      _count: { select: { members: true } },
    },
  })

  if (!community) {
    return { title: 'Invalid Invite' }
  }

  return {
    title: `Join: ${community.name} | Unity Chant`,
    description: community.description || `${community._count.members} members. Join the community!`,
    openGraph: {
      title: `Join ${community.name}`,
      description: community.description || `${community._count.members} members on Unity Chant`,
    },
  }
}

export default function CommunityInvitePage() {
  return <CommunityInviteClient />
}
