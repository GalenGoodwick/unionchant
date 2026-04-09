import { ImageResponse } from 'next/og'
import { OGCard, ogSize } from '@/lib/og-helpers'

export const runtime = 'edge'
export const alt = 'Unity Chant - Consensus at Scale'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <OGCard
        badge="UNITY CHANT"
        badgeColor="#fbbf24"
        borderColor="#fbbf24"
        title="Small groups. Real conversations. Best idea wins."
        subtitle="Civic deliberation at any scale"
      />
    ),
    { ...size }
  )
}
