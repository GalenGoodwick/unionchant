import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = 'Unity Chant - Consensus at Scale'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const pv = (cx: number, cy: number, r: number) =>
    [0, 1, 2, 3, 4].map(i => {
      const a = (2 * Math.PI * i) / 5 - Math.PI / 2
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number]
    })

  const CYAN = '#22d3ee'
  const GOLD = '#fbbf24'
  const DIM = '#334155'

  // ── Constellation: 5 cells in pentagon, each = 5 dots ──
  const conX = 300, conY = 315
  const outerR = 148, cellR = 40

  const cellCenters = pv(conX, conY, outerR)
  const cellStatus = ['done', 'done', 'done', 'active', 'active']

  type Dot = { x: number; y: number; color: string; sz: number; glow: string | null; op: number }
  const dots: Dot[] = []

  // Cell dots
  cellCenters.forEach((cc, ci) => {
    const verts = pv(cc[0], cc[1], cellR)
    const done = cellStatus[ci] === 'done'

    verts.forEach((v, vi) => {
      if (done) {
        if (vi === 0) {
          dots.push({ x: v[0], y: v[1], color: GOLD, sz: 14, glow: GOLD, op: 1 })
        } else {
          dots.push({ x: v[0], y: v[1], color: CYAN, sz: 11, glow: null, op: 0.85 })
        }
      } else {
        if (vi < 3) {
          dots.push({ x: v[0], y: v[1], color: CYAN, sz: 11, glow: null, op: 0.7 })
        } else {
          dots.push({ x: v[0], y: v[1], color: DIM, sz: 9, glow: null, op: 0.5 })
        }
      }
    })
  })

  // Center consensus dot
  dots.push({ x: conX, y: conY, color: GOLD, sz: 30, glow: GOLD, op: 1 })

  // Ambient scatter dots
  const scatter = [
    [55, 80], [85, 520], [540, 75], [525, 545], [130, 45],
    [70, 290], [545, 285], [170, 570], [445, 565], [40, 430],
    [540, 155], [95, 155], [475, 485], [160, 485], [35, 345],
    [520, 380], [110, 380], [490, 210], [115, 210], [60, 180],
  ]

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          backgroundColor: '#0f172a',
          backgroundImage:
            'radial-gradient(circle at 25% 50%, rgba(34,211,238,0.06) 0%, transparent 50%), radial-gradient(circle at 75% 45%, rgba(251,191,36,0.03) 0%, transparent 40%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Ambient scatter */}
        {scatter.map(([x, y], i) => (
          <div
            key={`s-${i}`}
            style={{
              position: 'absolute',
              left: x - 2,
              top: y - 2,
              width: 4,
              height: 4,
              borderRadius: '50%',
              backgroundColor: i % 3 === 0 ? GOLD : CYAN,
              opacity: 0.08 + (i % 4) * 0.03,
            }}
          />
        ))}

        {/* Cell-center soft glows — shows pentagon structure */}
        {cellCenters.map(([x, y], i) => (
          <div
            key={`cg-${i}`}
            style={{
              position: 'absolute',
              left: x - 50,
              top: y - 50,
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: cellStatus[i] === 'done'
                ? 'radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 70%)',
            }}
          />
        ))}

        {/* Center consensus glow */}
        <div
          style={{
            position: 'absolute',
            left: conX - 80,
            top: conY - 80,
            width: 160,
            height: 160,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(251,191,36,0.3) 0%, rgba(251,191,36,0.08) 40%, transparent 70%)',
          }}
        />

        {/* All dots */}
        {dots.map((d, i) => (
          <div
            key={`d-${i}`}
            style={{
              position: 'absolute',
              left: d.x - d.sz / 2,
              top: d.y - d.sz / 2,
              width: d.sz,
              height: d.sz,
              borderRadius: '50%',
              backgroundColor: d.color,
              opacity: d.op,
              boxShadow: d.glow
                ? `0 0 ${d.sz}px ${d.glow}, 0 0 ${d.sz * 2.5}px ${d.glow}50`
                : `0 0 8px ${d.color}30`,
            }}
          />
        ))}

        {/* Text */}
        <div
          style={{
            position: 'absolute',
            right: 60,
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
              color: '#ffffff',
              marginBottom: 20,
              letterSpacing: '-0.01em',
            }}
          >
            Unity Chant
          </div>
          <div
            style={{
              fontSize: 26,
              color: CYAN,
              fontWeight: 400,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            Consensus at Scale
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
