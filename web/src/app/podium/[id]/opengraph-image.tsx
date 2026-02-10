import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export const alt = 'Unity Chant Podium'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const podium = await prisma.podium.findUnique({
    where: { id },
    select: {
      title: true,
      body: true,
      author: { select: { name: true } },
    },
  })

  // Generic branded image for missing podium
  if (!podium) {
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a',
          }}
        >
          <div style={{ fontSize: 72, fontWeight: 700, color: '#ffffff' }}>
            Unity Chant
          </div>
          <div style={{ fontSize: 28, color: '#94a3b8', marginTop: 16 }}>
            Podium
          </div>
        </div>
      ),
      { ...size }
    )
  }

  const excerpt = podium.body
    .replace(/\n/g, ' ')
    .slice(0, 200)
    .trim()

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0f172a',
          padding: 60,
        }}
      >
        {/* Top: badge + author */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: '#ffffff',
                backgroundColor: '#d97706',
                padding: '6px 16px',
                borderRadius: 8,
              }}
            >
              PODIUM
            </div>
          </div>
          {podium.author?.name && (
            <div style={{ fontSize: 22, color: '#94a3b8' }}>
              {podium.author.name}
            </div>
          )}
        </div>

        {/* Center: title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: podium.title.length > 60 ? 42 : 56,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.3,
              maxWidth: 1000,
            }}
          >
            {podium.title.length > 100
              ? podium.title.slice(0, 97) + '...'
              : podium.title}
          </div>
          <div
            style={{
              fontSize: 22,
              color: '#94a3b8',
              lineHeight: 1.5,
              marginTop: 20,
              maxWidth: 900,
            }}
          >
            {excerpt.length >= 200 ? excerpt + '...' : excerpt}
          </div>
        </div>

        {/* Bottom: branding */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 28, fontWeight: 600, color: '#475569' }}>
            Unity Chant
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
