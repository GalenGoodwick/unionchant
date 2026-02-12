import { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { cache } from 'react'
import ChantSimulator from './ChantSimulator'

// Deduplicate the metadata query within a single request
const getDeliberationMeta = cache(async (id: string) => {
  return prisma.deliberation.findUnique({
    where: { id },
    select: {
      question: true,
      description: true,
      isPublic: true,
      phase: true,
      organization: true,
      _count: { select: { members: true, ideas: true } },
    },
  })
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const deliberation = await getDeliberationMeta(id)

  if (!deliberation) {
    return { title: 'Not Found' }
  }

  if (!deliberation.isPublic) {
    return {
      title: 'Private Chant',
      description: 'This chant is private. Join with an invite link.',
    }
  }

  const description = deliberation.description
    || `${deliberation._count.members} participants, ${deliberation._count.ideas} ideas. Phase: ${deliberation.phase}.`

  const baseUrl = process.env.NEXTAUTH_URL || 'https://unitychant.com'
  const ogImageUrl = `${baseUrl}/api/og?title=${encodeURIComponent(deliberation.question)}&members=${deliberation._count.members}&ideas=${deliberation._count.ideas}&phase=${encodeURIComponent(deliberation.phase)}${deliberation.organization ? `&org=${encodeURIComponent(deliberation.organization)}` : ''}`

  return {
    title: deliberation.question,
    description,
    openGraph: {
      title: deliberation.question,
      description,
      type: 'article',
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: deliberation.question,
      description,
      images: [ogImageUrl],
    },
  }
}

export default async function DeliberationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ChantSimulator id={id} />
}
