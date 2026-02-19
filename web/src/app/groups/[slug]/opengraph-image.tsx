import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/prisma'
import { OGCard, ogSize, brandedFallback } from '@/lib/og-helpers'

export const runtime = 'nodejs'
export const alt = 'Unity Chant Community'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const community = await prisma.community.findUnique({
    where: { slug },
    select: {
      name: true,
      _count: { select: { members: true } },
    },
  })

  if (!community) {
    return brandedFallback('Community')
  }

  return new ImageResponse(
    (
      <OGCard
        badge="COMMUNITY"
        badgeColor="#a78bfa"
        borderColor="#a78bfa"
        title={community.name}
        stats={[
          { label: 'members', value: community._count.members },
        ]}
      />
    ),
    { ...size }
  )
}
