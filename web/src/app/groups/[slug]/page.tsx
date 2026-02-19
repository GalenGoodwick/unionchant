import { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import CommunityPageClient from './CommunityPageClient'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params

  const community = await prisma.community.findUnique({
    where: { slug },
    select: {
      name: true,
      description: true,
      _count: { select: { members: true } },
    },
  })

  if (!community) {
    return { title: 'Community Not Found' }
  }

  const desc = community.description || `${community._count.members} members on Unity Chant`

  return {
    title: `${community.name} | Unity Chant`,
    description: desc,
    openGraph: {
      title: community.name,
      description: desc,
    },
    twitter: {
      card: 'summary_large_image',
      title: community.name,
      description: desc,
    },
  }
}

export default function CommunityPage() {
  return <CommunityPageClient />
}
