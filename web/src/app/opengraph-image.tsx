import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = 'Unity Chant - Scalable Direct Democracy'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default async function Image() {
  // Logo constellation: gold → blue → pink branching pattern
  const gold = { x: 160, y: 315, r: 28 }
  const blues = [
    { x: 340, y: 200, r: 20 },
    { x: 360, y: 315, r: 20 },
    { x: 340, y: 430, r: 20 },
  ]
  const pinkGroups = [
    // from blue 0
    [
      { x: 480, y: 150, r: 14 },
      { x: 490, y: 195, r: 14 },
      { x: 480, y: 240, r: 14 },
    ],
    // from blue 1
    [
      { x: 500, y: 270, r: 14 },
      { x: 510, y: 315, r: 14 },
      { x: 500, y: 360, r: 14 },
    ],
    // from blue 2
    [
      { x: 480, y: 390, r: 14 },
      { x: 490, y: 435, r: 14 },
      { x: 480, y: 480, r: 14 },
    ],
  ]

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          backgroundColor: '#0f172a',
          backgroundImage: 'radial-gradient(circle at 25% 50%, #1a1a3e 0%, transparent 50%), radial-gradient(circle at 75% 40%, #1e293b 0%, transparent 45%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Gold → Blue connection lines */}
        {blues.map((b, i) => (
          <div
            key={`gb-${i}`}
            style={{
              position: 'absolute',
              left: gold.x,
              top: gold.y,
              width: Math.sqrt((b.x - gold.x) ** 2 + (b.y - gold.y) ** 2),
              height: 3,
              background: 'linear-gradient(to right, #e8b84b, #3b82f6)',
              transformOrigin: '0 50%',
              transform: `rotate(${Math.atan2(b.y - gold.y, b.x - gold.x) * (180 / Math.PI)}deg)`,
              opacity: 0.6,
            }}
          />
        ))}

        {/* Blue → Pink connection lines */}
        {blues.map((b, bi) =>
          pinkGroups[bi].map((p, pi) => (
            <div
              key={`bp-${bi}-${pi}`}
              style={{
                position: 'absolute',
                left: b.x,
                top: b.y,
                width: Math.sqrt((p.x - b.x) ** 2 + (p.y - b.y) ** 2),
                height: 2,
                background: 'linear-gradient(to right, #3b82f6, #ec4899)',
                transformOrigin: '0 50%',
                transform: `rotate(${Math.atan2(p.y - b.y, p.x - b.x) * (180 / Math.PI)}deg)`,
                opacity: 0.5,
              }}
            />
          ))
        )}

        {/* Gold glow */}
        <div
          style={{
            position: 'absolute',
            left: gold.x - 50,
            top: gold.y - 50,
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(232, 184, 75, 0.35) 0%, transparent 70%)',
          }}
        />

        {/* Gold dot */}
        <div
          style={{
            position: 'absolute',
            left: gold.x - gold.r,
            top: gold.y - gold.r,
            width: gold.r * 2,
            height: gold.r * 2,
            borderRadius: '50%',
            backgroundColor: '#e8b84b',
            boxShadow: '0 0 30px rgba(232, 184, 75, 0.5)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: gold.x - 18,
            top: gold.y - 18,
            width: 36,
            height: 36,
            borderRadius: '50%',
            backgroundColor: '#f0c95c',
            opacity: 0.6,
          }}
        />

        {/* Blue dots */}
        {blues.map((b, i) => (
          <div key={`blue-${i}`}>
            <div
              style={{
                position: 'absolute',
                left: b.x - 35,
                top: b.y - 35,
                width: 70,
                height: 70,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: b.x - b.r,
                top: b.y - b.r,
                width: b.r * 2,
                height: b.r * 2,
                borderRadius: '50%',
                backgroundColor: ['#3b82f6', '#2563eb', '#1d4ed8'][i],
                boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)',
              }}
            />
          </div>
        ))}

        {/* Pink dots */}
        {pinkGroups.flat().map((p, i) => (
          <div key={`pink-${i}`}>
            <div
              style={{
                position: 'absolute',
                left: p.x - 22,
                top: p.y - 22,
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(236, 72, 153, 0.25) 0%, transparent 70%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: p.x - p.r,
                top: p.y - p.r,
                width: p.r * 2,
                height: p.r * 2,
                borderRadius: '50%',
                backgroundColor: ['#f472b6', '#ec4899', '#db2777'][i % 3],
                boxShadow: '0 0 14px rgba(236, 72, 153, 0.3)',
              }}
            />
          </div>
        ))}

        {/* Text - right side */}
        <div
          style={{
            position: 'absolute',
            right: 80,
            top: 0,
            bottom: 0,
            width: '50%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'flex-end',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 72,
              fontWeight: 700,
              fontFamily: 'serif',
              marginBottom: 16,
            }}
          >
            <span style={{ color: '#e8b84b' }}>Unity</span>
            <span style={{ color: '#ffffff', marginLeft: 18 }}> </span>
            <span style={{ color: '#3b82f6' }}>Chant</span>
          </div>
          <div
            style={{
              fontSize: 28,
              color: '#94a3b8',
              fontWeight: 400,
              fontStyle: 'italic',
              letterSpacing: '0.04em',
            }}
          >
            Scalable Direct Democracy
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
