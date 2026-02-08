import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Unity Chant Demo - See Consensus Emerge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

function pentPoints(cx: number, cy: number, r: number): [number, number][] {
  return Array.from({ length: 5 }, (_, i) => {
    const a = (2 * Math.PI * i) / 5 - Math.PI / 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number]
  })
}

function pointsStr(pts: [number, number][]) {
  return pts.map(([x, y]) => `${x},${y}`).join(' ')
}

export default async function Image() {
  const ocx = 320, ocy = 315, oR = 200
  const outerVerts = pentPoints(ocx, ocy, oR)

  // Inner pentagon centers (nudged 10% toward outer center)
  const innerCenters = outerVerts.map(([vx, vy]) => [
    vx + (ocx - vx) * 0.1,
    vy + (ocy - vy) * 0.1,
  ] as [number, number])

  const innerR = 55
  const dotR = 7

  // Status per inner pentagon: 2 complete, 2 active, 1 waiting
  const statuses = ['complete', 'complete', 'active', 'active', 'waiting']
  const strokeColors = ['#34d399', '#34d399', '#eab308', '#eab308', '#334155']

  // Voted pattern per inner pentagon
  const votedPatterns = [
    [1, 1, 1, 1, 1], // complete
    [1, 1, 1, 1, 1], // complete
    [1, 1, 1, 0, 0], // active
    [1, 1, 0, 0, 0], // active
    [0, 0, 0, 0, 0], // waiting
  ]

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          backgroundColor: '#0f172a',
          backgroundImage: 'radial-gradient(circle at 30% 50%, #1a1a3e 0%, transparent 50%), radial-gradient(circle at 80% 30%, #1e293b 0%, transparent 40%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* SVG constellation */}
        <svg
          width="640"
          height="630"
          viewBox="0 0 640 630"
          style={{ position: 'absolute', left: 0, top: 0 }}
        >
          {/* Outer pentagon */}
          <polygon
            points={pointsStr(outerVerts)}
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2"
            opacity="0.4"
          />

          {/* Inner pentagons */}
          {innerCenters.map(([icx, icy], idx) => {
            const pts = pentPoints(icx, icy, innerR)
            const status = statuses[idx]
            const stroke = strokeColors[idx]
            const voted = votedPatterns[idx]

            return (
              <g key={idx}>
                {/* Pentagon fill */}
                {status === 'complete' && (
                  <polygon
                    points={pointsStr(pts)}
                    fill="#34d399"
                    opacity="0.08"
                    stroke="none"
                  />
                )}
                {/* Pentagon border */}
                <polygon
                  points={pointsStr(pts)}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={status === 'waiting' ? '0.8' : '1.5'}
                  opacity={status === 'waiting' ? '0.4' : status === 'active' ? '0.8' : '1'}
                  strokeLinejoin="round"
                />
                {/* Dots at vertices */}
                {pts.map(([dx, dy], di) => (
                  <circle
                    key={di}
                    cx={dx}
                    cy={dy}
                    r={dotR}
                    fill={voted[di] ? '#eab308' : '#22d3ee'}
                    opacity={status === 'waiting' ? '0.3' : '1'}
                  />
                ))}
              </g>
            )
          })}

          {/* Particles (decorative arcs between pentagons) */}
          <circle cx={380} cy={280} r={3} fill="#a78bfa" opacity="0.7" />
          <circle cx={360} cy={350} r={2.5} fill="#a78bfa" opacity="0.5" />
          <circle cx={250} cy={400} r={2} fill="#a78bfa" opacity="0.6" />

          {/* Scattered background dots */}
          {[
            [50, 80], [580, 50], [600, 580], [30, 550], [520, 300],
            [100, 200], [550, 450], [70, 400], [500, 120], [150, 560],
            [580, 200], [200, 100], [450, 550], [120, 320], [540, 380],
          ].map(([x, y], i) => (
            <circle
              key={`bg-${i}`}
              cx={x}
              cy={y}
              r={i % 3 === 0 ? 3 : 2}
              fill={i % 5 === 0 ? '#eab308' : '#22d3ee'}
              opacity={0.15 + (i % 3) * 0.1}
            />
          ))}
        </svg>

        {/* Text side */}
        <div
          style={{
            position: 'absolute',
            right: 60,
            top: 0,
            bottom: 0,
            width: '45%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              fontWeight: 600,
              color: '#22d3ee',
              letterSpacing: '0.15em',
              textTransform: 'uppercase' as const,
              marginBottom: 16,
            }}
          >
            Interactive Demo
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 52,
              fontWeight: 700,
              fontFamily: 'serif',
              color: '#ffffff',
              lineHeight: 1.15,
              marginBottom: 20,
            }}
          >
            See Consensus Emerge
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#94a3b8',
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}
          >
            Watch a million conversations arrive at the same answer.
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 32,
              gap: 8,
            }}
          >
            {/* Step dots preview */}
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
              <div
                key={i}
                style={{
                  width: i === 3 ? 14 : 10,
                  height: i === 3 ? 14 : 10,
                  borderRadius: '50%',
                  backgroundColor: i < 3 ? '#34d399' : i === 3 ? '#22d3ee' : 'rgba(255,255,255,0.2)',
                }}
              />
            ))}
            <div style={{ display: 'flex', fontSize: 14, color: '#64748b', marginLeft: 8 }}>
              7 steps
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
