import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = 'Union Chant - Query your crowd. Get a collective answer.'
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
          backgroundImage: 'radial-gradient(circle at 25% 25%, #1e3a5f 0%, transparent 50%), radial-gradient(circle at 75% 75%, #164e63 0%, transparent 50%)',
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
              marginBottom: 24,
              fontFamily: 'serif',
            }}
          >
            Union Chant
          </div>
          <div
            style={{
              fontSize: 36,
              color: '#0891b2',
              textAlign: 'center',
              maxWidth: 800,
              lineHeight: 1.3,
              fontWeight: 600,
            }}
          >
            Query your crowd. Get a collective answer.
          </div>
          <div
            style={{
              display: 'flex',
              gap: 48,
              marginTop: 60,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backgroundColor: '#1e293b',
                padding: '24px 36px',
                borderRadius: 12,
                border: '1px solid #334155',
              }}
            >
              <div style={{ fontSize: 28, fontWeight: 600, color: '#0891b2', marginBottom: 4 }}>Ask</div>
              <div style={{ fontSize: 15, color: '#94a3b8' }}>Post a question</div>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backgroundColor: '#1e293b',
                padding: '24px 36px',
                borderRadius: 12,
                border: '1px solid #334155',
              }}
            >
              <div style={{ fontSize: 28, fontWeight: 600, color: '#0891b2', marginBottom: 4 }}>Discuss</div>
              <div style={{ fontSize: 15, color: '#94a3b8' }}>Small groups deliberate</div>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                backgroundColor: '#1e293b',
                padding: '24px 36px',
                borderRadius: 12,
                border: '1px solid #334155',
              }}
            >
              <div style={{ fontSize: 28, fontWeight: 600, color: '#0891b2', marginBottom: 4 }}>Decide</div>
              <div style={{ fontSize: 15, color: '#94a3b8' }}>Get a collective answer</div>
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
