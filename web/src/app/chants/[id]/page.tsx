import { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { cache } from 'react'
import DeliberationPageClient from './DeliberationPageClientNew'

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

  return {
    title: deliberation.question,
    description,
    openGraph: {
      title: deliberation.question,
      description,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: deliberation.question,
      description,
    },
  }
}

export default function DeliberationPage() {
  return <DeliberationPageClient />
}
