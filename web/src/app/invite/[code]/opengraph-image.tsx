import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/prisma'
import { OGCard, ogSize, brandedFallback } from '@/lib/og-helpers'

export const runtime = 'nodejs'
export const alt = 'Join Unity Chant'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const deliberation = await prisma.deliberation.findUnique({
    where: { inviteCode: code },
    select: {
      question: true,
      _count: { select: { members: true, ideas: true } },
    },
  })

  if (!deliberation) {
    return brandedFallback('Invite')
  }

  return new ImageResponse(
    (
      <OGCard
        badge="JOIN"
        badgeColor="#22d3ee"
        borderColor="#22d3ee"
        title={`Join: ${deliberation.question}`}
        stats={[
          { label: 'participants', value: deliberation._count.members },
          { label: 'ideas', value: deliberation._count.ideas },
        ]}
      />
    ),
    { ...size }
  )
}
