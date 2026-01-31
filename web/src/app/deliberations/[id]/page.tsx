import { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import DeliberationPageClient from './DeliberationPageClientNew'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params

  const deliberation = await prisma.deliberation.findUnique({
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

  if (!deliberation) {
    return { title: 'Not Found' }
  }

  // Private deliberations get generic metadata
  if (!deliberation.isPublic) {
    return {
      title: 'Private Deliberation',
      description: 'This deliberation is private. Join with an invite link.',
    }
  }

  const description = deliberation.description
    || `${deliberation._count.members} participants, ${deliberation._count.ideas} ideas. Phase: ${deliberation.phase}.`

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.unionchant.org'
  const ogImageUrl = `${baseUrl}/api/og?title=${encodeURIComponent(deliberation.question)}&members=${deliberation._count.members}&ideas=${deliberation._count.ideas}&phase=${deliberation.phase}${deliberation.organization ? `&org=${encodeURIComponent(deliberation.organization)}` : ''}`

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

export default function DeliberationPage() {
  return <DeliberationPageClient />
}
