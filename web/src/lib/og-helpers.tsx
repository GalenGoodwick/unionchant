import { ImageResponse } from 'next/og'

export const ogSize = { width: 1200, height: 630 }

type OGCardProps = {
  badge: string
  badgeColor: string
  borderColor: string
  title: string
  subtitle?: string
  stats?: { label: string; value: string | number }[]
  author?: string
}

export function OGCard({ badge, badgeColor, borderColor, title, subtitle, stats, author }: OGCardProps) {
  const displayTitle = title.length > 120 ? title.slice(0, 117) + '...' : title
  const fontSize = displayTitle.length > 80 ? 40 : 52

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        position: 'relative',
        backgroundColor: '#0f172a',
        padding: '60px 60px 60px 64px',
      }}
    >
      {/* Left accent border */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          backgroundColor: borderColor,
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
        }}
      >
        {/* Top: badge + author */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 16,
              fontWeight: 700,
              color: '#0f172a',
              backgroundColor: badgeColor,
              padding: '6px 16px',
              borderRadius: 6,
              letterSpacing: '0.05em',
            }}
          >
            {badge}
          </div>
          {author && (
            <div style={{ fontSize: 20, color: '#94a3b8' }}>
              {author}
            </div>
          )}
        </div>

        {/* Center: title + subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, marginTop: 24, marginBottom: 24 }}>
          <div
            style={{
              fontSize,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.3,
              maxWidth: 1000,
            }}
          >
            {displayTitle}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 22,
                color: '#94a3b8',
                lineHeight: 1.5,
                marginTop: 16,
                maxWidth: 900,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {/* Bottom: stats + branding */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {stats && stats.length > 0 ? (
            <div style={{ display: 'flex', gap: 32 }}>
              {stats.map((stat) => (
                <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: badgeColor }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 14, color: '#94a3b8' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <div />
          )}
          <div style={{ fontSize: 24, fontWeight: 600, color: '#475569' }}>
            Unity Chant
          </div>
        </div>
      </div>
    </div>
  )
}

export function brandedFallback(subtitle?: string) {
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
        <div style={{ fontSize: 64, fontWeight: 700, color: '#ffffff' }}>
          Unity Chant
        </div>
        <div style={{ fontSize: 24, color: '#94a3b8', marginTop: 16 }}>
          {subtitle || 'Consensus at Scale'}
        </div>
      </div>
    ),
    { ...ogSize }
  )
}
