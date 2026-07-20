import { ImageResponse } from 'next/og'
import { OGCard, ogSize } from '@/lib/og-helpers'

export const runtime = 'edge'
export const alt = 'Unity Chant, Pricing'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <OGCard
        badge="PRICING"
        badgeColor="#22d3ee"
        borderColor="#22d3ee"
        title="Free to start. Scale when you need to."
        subtitle="Run deliberations, gather consensus, and make better collective decisions."
      />
    ),
    { ...size }
  )
}
