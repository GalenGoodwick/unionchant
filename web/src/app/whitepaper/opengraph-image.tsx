import { ImageResponse } from 'next/og'
import { OGCard, ogSize } from '@/lib/og-helpers'

export const runtime = 'edge'
export const alt = 'Unity Chant — Whitepaper'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <OGCard
        badge="WHITEPAPER"
        badgeColor="#fbbf24"
        borderColor="#fbbf24"
        title="Collective decision-making for the modern age"
        subtitle="How small-group deliberation scales from 5 people to millions — and why it produces better outcomes than voting."
      />
    ),
    { ...size }
  )
}
