import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/prisma'
import { OGCard, ogSize, brandedFallback } from '@/lib/og-helpers'

export const runtime = 'nodejs'
export const alt = 'Join Unity Chant Community'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const community = await prisma.community.findUnique({
    where: { inviteCode: code },
    select: {
      name: true,
      _count: { select: { members: true } },
    },
  })

  if (!community) {
    return brandedFallback('Community Invite')
  }

  return new ImageResponse(
    (
      <OGCard
        badge="JOIN"
        badgeColor="#a78bfa"
        borderColor="#a78bfa"
        title={`Join ${community.name}`}
        stats={[
          { label: 'members', value: community._count.members },
        ]}
      />
    ),
    { ...size }
  )
}
