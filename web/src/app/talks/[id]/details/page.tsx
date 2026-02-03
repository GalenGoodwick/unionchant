import { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import DetailsPageClient from './DetailsPageClient'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params

  const deliberation = await prisma.deliberation.findUnique({
    where: { id },
    select: { question: true, isPublic: true },
  })

  if (!deliberation) {
    return { title: 'Not Found' }
  }

  if (!deliberation.isPublic) {
    return { title: 'Private Deliberation - Details' }
  }

  return {
    title: `${deliberation.question} - Details`,
  }
}

export default function DetailsPage() {
  return <DetailsPageClient />
}
