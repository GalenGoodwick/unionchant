import { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import InvitePageClient from './InvitePageClient'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params

  const deliberation = await prisma.deliberation.findUnique({
    where: { inviteCode: code },
    select: {
      question: true,
      description: true,
      _count: { select: { members: true } },
    },
  })

  if (!deliberation) {
    return { title: 'Invalid Invite' }
  }

  return {
    title: `Join: ${deliberation.question}`,
    description: deliberation.description || `${deliberation._count.members} participants. Join the deliberation!`,
    openGraph: {
      title: `Join: ${deliberation.question}`,
      description: deliberation.description || `${deliberation._count.members} participants. Join the deliberation!`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `Join: ${deliberation.question}`,
      description: deliberation.description || `Join the deliberation!`,
    },
  }
}

export default function InvitePage() {
  return <InvitePageClient />
}
