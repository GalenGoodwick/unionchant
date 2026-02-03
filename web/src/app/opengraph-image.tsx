import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = 'Union Chant - Query your crowd. Get a collective answer.'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image() {
  // Fibonacci sunflower spiral — represents ideas converging through tiers
  // Outer dots = many participants, inner dots = winners advancing, center = collective answer
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)) // ~137.508 degrees
  const spiralCx = 880
  const spiralCy = 315
  const numDots = 100

  const dots: { x: number; y: number; size: number; r: number; g: number; b: number; opacity: number }[] = []

  for (let i = 1; i <= numDots; i++) {
    const radius = 11 * Math.sqrt(i)
    const theta = i * goldenAngle
    const x = spiralCx + radius * Math.cos(theta)
    const y = spiralCy + radius * Math.sin(theta)

    const t = i / numDots // 0 = near center, 1 = outer edge

    // Inner dots are larger and brighter (winners), outer are smaller and dimmer (many participants)
    const dotSize = Math.max(2.5, 9 - t * 7)
    const opacity = Math.max(0.12, 1 - t * 0.88)

    // Color: inner = bright cyan (#0891b2), outer = slate (#475569)
    const r = Math.round(71 * t + 8 * (1 - t))
    const g = Math.round(85 * t + 145 * (1 - t))
    const b = Math.round(105 * t + 178 * (1 - t))

    dots.push({ x, y, size: dotSize, r, g, b, opacity })
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          backgroundColor: '#0f172a',
          backgroundImage: 'radial-gradient(circle at 73% 50%, #164e63 0%, transparent 40%), radial-gradient(circle at 20% 30%, #1e3a5f 0%, transparent 45%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Text - left side */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingLeft: 80,
            paddingRight: 40,
            width: '55%',
          }}
        >
          <div
            style={{
              fontSize: 64,
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
              display: 'flex',
              flexDirection: 'column',
              fontSize: 28,
              color: '#0891b2',
              lineHeight: 1.4,
              fontWeight: 600,
              marginBottom: 32,
            }}
          >
            <span>Query your crowd.</span>
            <span>Get a collective answer.</span>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#0891b2' }} />
              <span style={{ fontSize: 14, color: '#94a3b8' }}>Ask</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#0891b2', opacity: 0.7 }} />
              <span style={{ fontSize: 14, color: '#94a3b8' }}>Discuss</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#0891b2', opacity: 0.4 }} />
              <span style={{ fontSize: 14, color: '#94a3b8' }}>Decide</span>
            </div>
          </div>
        </div>

        {/* Spiral fractal - right side */}
        {/* Center glow */}
        <div
          style={{
            position: 'absolute',
            left: spiralCx - 40,
            top: spiralCy - 40,
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(8, 145, 178, 0.3) 0%, transparent 70%)',
          }}
        />
        {/* Center dot */}
        <div
          style={{
            position: 'absolute',
            left: spiralCx - 7,
            top: spiralCy - 7,
            width: 14,
            height: 14,
            borderRadius: '50%',
            backgroundColor: '#0891b2',
            boxShadow: '0 0 20px rgba(8, 145, 178, 0.6)',
          }}
        />

        {/* Spiral dots */}
        {dots.map((dot, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: dot.x - dot.size / 2,
              top: dot.y - dot.size / 2,
              width: dot.size,
              height: dot.size,
              borderRadius: '50%',
              backgroundColor: `rgba(${dot.r}, ${dot.g}, ${dot.b}, ${dot.opacity})`,
            }}
          />
        ))}
      </div>
    ),
    {
      ...size,
    }
  )
}
