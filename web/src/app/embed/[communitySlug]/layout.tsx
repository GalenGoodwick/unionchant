import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { EmbedAuthProvider } from '@/components/EmbedAuthContext'
import EmbedLayout from '@/components/EmbedLayout'

export default async function EmbedCommunityLayout({
  params,
  children,
}: {
  params: Promise<{ communitySlug: string }>
  children: React.ReactNode
}) {
  const { communitySlug } = await params

  const community = await prisma.community.findUnique({
    where: { slug: communitySlug },
    select: { id: true, name: true, slug: true },
  })

  if (!community) {
    notFound()
  }

  return (
    <EmbedAuthProvider communitySlug={communitySlug}>
      <EmbedLayout>
        {children}
      </EmbedLayout>
    </EmbedAuthProvider>
  )
}
