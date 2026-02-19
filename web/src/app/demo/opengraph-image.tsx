import { ImageResponse } from 'next/og'
import { OGCard, ogSize } from '@/lib/og-helpers'

export const runtime = 'edge'
export const alt = 'Unity Chant Demo - See Consensus Emerge'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <OGCard
        badge="DEMO"
        badgeColor="#34d399"
        borderColor="#34d399"
        title="See Consensus Emerge"
        subtitle="Watch a million conversations arrive at the same answer."
      />
    ),
    { ...size }
  )
}
