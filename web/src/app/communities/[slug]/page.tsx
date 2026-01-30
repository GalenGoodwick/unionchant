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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.unionchant.org'
  const desc = community.description || `${community._count.members} members on Union Chant`
  const ogImageUrl = `${baseUrl}/api/og?title=${encodeURIComponent(community.name)}&members=${community._count.members}&type=community`

  return {
    title: `${community.name} | Union Chant`,
    description: desc,
    openGraph: {
      title: community.name,
      description: desc,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: community.name,
      description: desc,
      images: [ogImageUrl],
    },
  }
}

export default function CommunityPage() {
  return <CommunityPageClient />
}
