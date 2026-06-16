'use client'

import { useRef, useEffect } from 'react'
import { PX, getFairyOffset, getPlayerRatio } from './pixel-animation'
import type { PlayerTransition } from './usePresence'

interface TransitionOverlayProps {
  transitions: PlayerTransition[]
  /** Map of instanceId -> DOM element (canvas containers) for position lookup */
  instanceRefs: React.MutableRefObject<Map<string, HTMLElement>>
}

const DURATION = 400 // ms

// Quadratic Bezier with upward arc
function bezierArc(
  t: number,
  x0: number, y0: number,
  x1: number, y1: number,
): { x: number; y: number } {
  // Control point: midpoint shifted up
  const cx = (x0 + x1) / 2
  const cy = Math.min(y0, y1) - 40

  const mt = 1 - t
  return {
    x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
    y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
  }
}

// Ease-out cubic
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export default function TransitionOverlay({ transitions, instanceRefs }: TransitionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const frameRef = useRef(0)

  useEffect(() => {
    if (transitions.length === 0) {
      cancelAnimationFrame(animRef.current)
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth * 2
    canvas.height = window.innerHeight * 2

    const draw = () => {
      animRef.current = requestAnimationFrame(draw)
      frameRef.current++

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = false
      ctx.save()
      ctx.scale(2, 2)

      const now = Date.now()

      for (const tr of transitions) {
        const elapsed = now - tr.timestamp
        if (elapsed >= DURATION) continue

        const fromEl = instanceRefs.current.get(tr.from)
        const toEl = instanceRefs.current.get(tr.to)
        if (!fromEl || !toEl) continue

        const fromRect = fromEl.getBoundingClientRect()
        const toRect = toEl.getBoundingClientRect()

        // Use the player's ratio position within each canvas
        const { rx, ry } = getPlayerRatio(tr.playerId)
        const x0 = fromRect.left + fromRect.width * rx
        const y0 = fromRect.top + fromRect.height * ry
        const x1 = toRect.left + toRect.width * rx
        const y1 = toRect.top + toRect.height * ry

        const t = easeOut(elapsed / DURATION)
        const pos = bezierArc(t, x0, y0, x1, y1)
        const offset = getFairyOffset(frameRef.current, 0)

        ctx.fillStyle = tr.playerColor
        ctx.fillRect(
          Math.floor(pos.x + offset.dx),
          Math.floor(pos.y + offset.dy),
          PX, PX
        )
      }

      ctx.restore()
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [transitions, instanceRefs])

  if (transitions.length === 0) return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[9995] pointer-events-none"
      style={{
        width: '100vw',
        height: '100vh',
        imageRendering: 'pixelated',
      }}
    />
  )
}
