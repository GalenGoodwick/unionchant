'use client'

import { useRef, useEffect, useState } from 'react'
import { renderPlayers } from './pixel-animation'
import type { PixelPlayer } from './pixel-animation'

interface InstancePixelCanvasProps {
  players: PixelPlayer[]
  /** Fixed width — if omitted, fills container */
  width?: number
  /** Fixed height — if omitted, fills container */
  height?: number
  instanceId: string
  className?: string
  /** Register this canvas's DOM element for transition animations */
  registerRef?: (id: string, el: HTMLElement | null) => void
}

export default function InstancePixelCanvas({
  players,
  width: fixedWidth,
  height: fixedHeight,
  instanceId,
  className = '',
  registerRef,
}: InstancePixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef(0)
  const animRef = useRef<number>(0)
  const visibleRef = useRef(true)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: fixedWidth || 375, h: fixedHeight || 812 })

  // Register with parent for transition overlay positioning
  useEffect(() => {
    if (!registerRef) return
    const el = containerRef.current || canvasRef.current
    registerRef(instanceId, el)
    return () => registerRef(instanceId, null)
  }, [instanceId, registerRef])

  // Auto-size to container when no fixed dimensions
  useEffect(() => {
    if (fixedWidth && fixedHeight) {
      setSize({ w: fixedWidth, h: fixedHeight })
      return
    }
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      const rect = container.getBoundingClientRect()
      setSize({ w: Math.floor(rect.width), h: Math.floor(rect.height) })
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [fixedWidth, fixedHeight])

  // IntersectionObserver — pause animation when off-screen
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new IntersectionObserver(
      (entries) => { visibleRef.current = entries[0].isIntersecting },
      { threshold: 0 }
    )
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0 || size.h === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr

    let lastTime = 0
    const draw = (time: number) => {
      animRef.current = requestAnimationFrame(draw)

      // Skip if off-screen
      if (!visibleRef.current) return

      // Throttle to ~15fps
      if (time - lastTime < 66) return
      lastTime = time
      frameRef.current++

      ctx.save()
      ctx.scale(dpr, dpr)
      renderPlayers(ctx, players, frameRef.current, size.w, size.h)
      ctx.restore()
    }

    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [players, size])

  // Fixed-size mode: no container wrapper needed
  if (fixedWidth && fixedHeight) {
    return (
      <canvas
        ref={canvasRef}
        className={`pointer-events-none ${className}`}
        style={{
          width: fixedWidth,
          height: fixedHeight,
          imageRendering: 'pixelated',
        }}
      />
    )
  }

  // Auto-size mode: fills container
  return (
    <div ref={containerRef} className={`${className}`} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0"
        style={{
          width: size.w,
          height: size.h,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  )
}
