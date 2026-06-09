'use client'

import { useMemo, useState, useEffect } from 'react'
import type { WorldPosition } from './world-data'

interface TetherLineProps {
  sectionPosition: WorldPosition
  cameraPosition: { x: number; y: number }
}

export default function TetherLine({ sectionPosition, cameraPosition }: TetherLineProps) {
  const [screenSize, setScreenSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const update = () => setScreenSize({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const line = useMemo(() => {
    const dx = sectionPosition.x - cameraPosition.x
    const dy = sectionPosition.y - cameraPosition.y
    const dist = Math.hypot(dx, dy)

    if (dist < 10) return null

    const nx = dx / dist
    const ny = dy / dist
    const len = Math.min(dist * 0.3, 120)

    return { x1: 0, y1: 0, x2: nx * len, y2: ny * len }
  }, [sectionPosition, cameraPosition])

  if (!line || screenSize.w === 0) return null

  return (
    <svg className="fixed inset-0 z-[9990] pointer-events-none" style={{ width: '100%', height: '100%' }}>
      <g transform={`translate(${screenSize.w / 2}, ${screenSize.h / 2})`}>
        <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.35} />
        <circle cx={line.x2} cy={line.y2} r={3} fill="var(--color-accent)" opacity={0.4} />
      </g>
    </svg>
  )
}
