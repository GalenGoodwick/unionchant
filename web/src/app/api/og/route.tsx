import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// GET /api/og - Dynamic OG image generator (PNG via ImageResponse)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title') || ''
  const members = searchParams.get('members') || '0'
  const ideas = searchParams.get('ideas') || '0'
  const phase = searchParams.get('phase') || ''
  const org = searchParams.get('org') || ''
  const type = searchParams.get('type') || 'deliberation'

  // Homepage branding
  if (!title || title === 'Unity Chant') {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          }}
        >
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, letterSpacing: 2 }}>
            <span style={{ color: '#e8b84b' }}>Unity</span>
            <span style={{ color: '#ffffff', marginLeft: 16 }}> </span>
            <span style={{ color: '#3b82f6', marginLeft: 16 }}>Chant</span>
          </div>
          <div style={{ fontSize: 22, color: '#94a3b8', marginTop: 16, letterSpacing: 1 }}>
            Consensus at Scale
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              marginTop: 80,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 250,
                height: 140,
                borderRadius: 12,
                background: '#1a1a1e',
                border: '2px solid #e8b84b',
                fontSize: 36,
                fontWeight: 700,
                color: '#e8b84b',
              }}
            >
              Fracture
            </div>
            <div style={{ fontSize: 32, color: '#0891b2' }}>→</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 250,
                height: 140,
                borderRadius: 12,
                background: '#1a1a1e',
                border: '2px solid #0891b2',
                fontSize: 32,
                fontWeight: 700,
                color: '#0891b2',
              }}
            >
              Deliberation
            </div>
            <div style={{ fontSize: 32, color: '#3b82f6' }}>→</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 250,
                height: 140,
                borderRadius: 12,
                background: '#1a1a1e',
                border: '2px solid #3b82f6',
                fontSize: 32,
                fontWeight: 700,
                color: '#3b82f6',
              }}
            >
              Convergence
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 40, fontSize: 18, color: '#475569' }}>
            unitychant.com
          </div>
        </div>
      ),
      { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } }
    )
  }

  // Content page (chant or community)
  const displayTitle = title.length > 80 ? title.substring(0, 77) + '...' : title
  const subtitle =
    type === 'community'
      ? `${members} members`
      : `${members} participants · ${ideas} ideas${phase ? ` · ${phase}` : ''}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #ecfeff, #f0f9ff)',
          padding: 40,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            background: 'white',
            borderRadius: 24,
            border: '2px solid #e4e4e7',
            padding: '40px 60px',
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 600, color: '#0891b2', letterSpacing: 1, marginBottom: 8 }}>
            UNITY CHANT
          </div>
          <div
            style={{
              width: 200,
              height: 2,
              background: '#0891b2',
              opacity: 0.3,
              marginBottom: 40,
            }}
          />
          <div
            style={{
              fontSize: 38,
              fontWeight: 700,
              color: '#18181b',
              textAlign: 'center',
              lineHeight: 1.3,
              maxWidth: 900,
              marginBottom: 16,
            }}
          >
            {displayTitle}
          </div>
          {org && (
            <div style={{ fontSize: 20, color: '#71717a', marginBottom: 8 }}>{org}</div>
          )}
          <div style={{ fontSize: 22, fontWeight: 500, color: '#0891b2', marginTop: 8 }}>
            {subtitle}
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 60,
              left: 40,
              right: 40,
              height: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(8, 145, 178, 0.1)',
              borderRadius: 0,
              fontSize: 16,
              color: '#0891b2',
            }}
          >
            Consensus at Scale · unitychant.com
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } }
  )
}
