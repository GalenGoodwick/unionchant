import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/prisma'
import { OGCard, ogSize, brandedFallback } from '@/lib/og-helpers'

export const runtime = 'nodejs'
export const alt = 'Unity Chant Podium'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
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
    return brandedFallback('Podium')
  }

  const excerpt = podium.body.replace(/\n/g, ' ').slice(0, 160).trim()
  const subtitle = excerpt.length >= 160 ? excerpt + '...' : excerpt

  return new ImageResponse(
    (
      <OGCard
        badge="PODIUM"
        badgeColor="#d97706"
        borderColor="#d97706"
        title={podium.title}
        subtitle={subtitle}
        author={podium.author?.name || undefined}
      />
    ),
    { ...size }
  )
}
