import { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import PodiumPageClient from './PodiumPageClient'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params

  const podium = await prisma.podium.findUnique({
    where: { id },
    select: {
      title: true,
      body: true,
      author: { select: { name: true } },
    },
  })

  if (!podium) {
    return { title: 'Not Found | Unity Chant' }
  }

  const description = podium.body.slice(0, 160).replace(/\n/g, ' ')

  return {
    title: `${podium.title} | Unity Chant`,
    description,
    openGraph: {
      title: podium.title,
      description,
      type: 'article',
      authors: podium.author?.name ? [podium.author.name] : undefined,
    },
  }
}

export default function PodiumPage() {
  return <PodiumPageClient />
}
