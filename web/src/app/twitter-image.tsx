import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = 'Union Chant - Collective Decision Making'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image() {
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
          backgroundImage: 'radial-gradient(circle at 25% 25%, #1e3a5f 0%, transparent 50%), radial-gradient(circle at 75% 75%, #1e3a5f 0%, transparent 50%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: '#ffffff',
              marginBottom: 20,
              fontFamily: 'serif',
            }}
          >
            Union Chant
          </div>
          <div
            style={{
              fontSize: 32,
              color: '#94a3b8',
              textAlign: 'center',
              maxWidth: 800,
              lineHeight: 1.4,
            }}
          >
            Small group deliberation at any scale
          </div>
          <div
            style={{
              display: 'flex',
              gap: 40,
              marginTop: 60,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backgroundColor: '#1e293b',
                padding: '24px 32px',
                borderRadius: 12,
                border: '1px solid #334155',
              }}
            >
              <div style={{ fontSize: 48, fontWeight: 700, color: '#0891b2' }}>5</div>
              <div style={{ fontSize: 16, color: '#94a3b8' }}>People per cell</div>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backgroundColor: '#1e293b',
                padding: '24px 32px',
                borderRadius: 12,
                border: '1px solid #334155',
              }}
            >
              <div style={{ fontSize: 48, fontWeight: 700, color: '#0891b2' }}>5:1</div>
              <div style={{ fontSize: 16, color: '#94a3b8' }}>Reduction ratio</div>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backgroundColor: '#1e293b',
                padding: '24px 32px',
                borderRadius: 12,
                border: '1px solid #334155',
              }}
            >
              <div style={{ fontSize: 48, fontWeight: 700, color: '#0891b2' }}>9</div>
              <div style={{ fontSize: 16, color: '#94a3b8' }}>Tiers for 1M people</div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
