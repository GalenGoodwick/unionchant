import { ImageResponse } from 'next/og'
import { OGCard, ogSize } from '@/lib/og-helpers'

export const runtime = 'edge'
export const alt = 'Unity Chant — How It Works'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <OGCard
        badge="HOW IT WORKS"
        badgeColor="#22d3ee"
        borderColor="#22d3ee"
        title="Small groups. Real conversations. Best idea wins."
        subtitle="25 people need 2 rounds. A million need 9. Everyone gets heard."
      />
    ),
    { ...size }
  )
}
