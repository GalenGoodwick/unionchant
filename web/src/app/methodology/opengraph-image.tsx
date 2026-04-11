import { ImageResponse } from 'next/og'
import { OGCard, ogSize } from '@/lib/og-helpers'

export const runtime = 'edge'
export const alt = 'Unity Chant — Methodology'
export const size = ogSize
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <OGCard
        badge="METHODOLOGY"
        badgeColor="#34d399"
        borderColor="#34d399"
        title="The math and process behind fractal deliberation"
        subtitle="Tiered elimination, random cell assignment, and why an idea must survive real scrutiny to win."
      />
    ),
    { ...size }
  )
}
