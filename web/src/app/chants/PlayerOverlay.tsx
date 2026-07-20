'use client'

import { useRef, useEffect, useState } from 'react'

interface PlayerPixel {
  id: string
  name: string
  color: string
  x: number // screen x position
  y: number // position relative to page scroll (scrollY + screenY)
  instance?: string // 'list' or a post id, which space this player is in
  dockedTo?: string // which dock point they're at (chant id or 'idea:${id}')
}

interface PlayerOverlayProps {
  players: PlayerPixel[]
  scrollY: number
}

const PX = 4 // pixel size, each pixel block is 4x4
const SELF_PX = 8 // self pixel is 2x larger (8x8 frame, 4x4 moving block)

// Fairy animation: 4x4 block jitters within an 8x8 frame
// Base position is bottom-left of frame, block visits all 4 quadrants
const FAIRY_OFFSETS = [
  { dx: 0, dy: 0 },     // bottom-left (home)
  { dx: PX, dy: 0 },    // bottom-right
  { dx: PX, dy: -PX },  // top-right
  { dx: 0, dy: -PX },   // top-left
]

export default function PlayerOverlay({ players, scrollY }: PlayerOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const frameRef = useRef(0)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Animation loop — redraws at ~15fps for fairy jitter
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = size.w
    canvas.height = size.h

    let lastTime = 0
    const draw = (time: number) => {
      // Throttle to ~15fps for subtle jitter
      if (time - lastTime < 66) {
        animRef.current = requestAnimationFrame(draw)
        return
      }
      lastTime = time
      frameRef.current++

      ctx.clearRect(0, 0, size.w, size.h)

      for (let i = 0; i < players.length; i++) {
        const p = players[i]
        const isSelf = p.id === 'self'
        const px = isSelf ? SELF_PX : PX
        const screenY = p.y - scrollY
        if (screenY < -px * 2 || screenY > size.h + px * 2) continue
        if (p.x < -px * 2 || p.x > size.w + px * 2) continue

        // Each player has a different phase offset so they don't sync
        const phase = (frameRef.current + i * 7) % FAIRY_OFFSETS.length
        const offset = FAIRY_OFFSETS[phase]

        ctx.fillStyle = p.color
        ctx.fillRect(
          Math.floor(p.x + offset.dx),
          Math.floor(screenY + offset.dy),
          px, px
        )
      }

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [players, scrollY, size])

  if (size.w === 0) return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[9990] pointer-events-none"
      style={{ width: size.w, height: size.h }}
    />
  )
}

export type { PlayerPixel }
