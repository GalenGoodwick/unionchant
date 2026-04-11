import { ImageResponse } from 'next/og'
import { OGCard, ogSize } from '@/lib/og-helpers'

export const runtime = 'edge'
export const alt = 'Unity Chant — Humanity'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <OGCard
        badge="HUMANITY"
        badgeColor="#f472b6"
        borderColor="#f472b6"
        title="Technology built for consensus, not conflict"
        subtitle="What happens when we give communities the tools to actually agree?"
      />
    ),
    { ...size }
  )
}
