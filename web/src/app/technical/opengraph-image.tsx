import { ImageResponse } from 'next/og'
import { OGCard, ogSize } from '@/lib/og-helpers'

export const runtime = 'edge'
export const alt = 'Unity Chant, Technical Whitepaper'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <OGCard
        badge="TECHNICAL WHITEPAPER"
        badgeColor="#a78bfa"
        borderColor="#a78bfa"
        title="How adversarial deliberation produces consensus at scale"
        subtitle="The math, tiers, and security properties behind structured small-group decision making."
      />
    ),
    { ...size }
  )
}
