'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

export interface ChallengeData {
  pointerEvents: number
  chaseDurationMs: number
  evadeCount: number
  surrendered: boolean
}

interface RunawayButtonProps {
  onCaught: (data: ChallengeData) => void
  onBotDetected?: (data: ChallengeData) => void
}

/**
 * Runaway Button — a human verification challenge.
 *
 * How it works:
 * - A button runs away from your cursor/finger
 * - Chase it for 3 seconds and you automatically pass
 * - Sometimes it gets tired and lets you catch it early — click it then!
 * - If something clicks it instantly with no chasing = bot = flagged
 *
 * Collects behavioral data (pointer events, evasion count, chase duration)
 * for server-side validation. The server is the authority — client can't
 * fake a pass without realistic behavioral data.
 *
 * Works on desktop (mouse) and mobile (touch).
 */
export default function RunawayButton({ onCaught, onBotDetected }: RunawayButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const chaseStartRef = useRef<number>(0)
  const pointerCountRef = useRef<number>(0)
  const evadeCountRef = useRef<number>(0)
  const [pos, setPos] = useState({ x: 50, y: 50 })
  const [surrendered, setSurrendered] = useState(false)
  const [chasing, setChasing] = useState(false)
  const [chaseTime, setChaseTime] = useState(0)
  const [passed, setPassed] = useState(false)

  const getBehavioralData = useCallback((): ChallengeData => ({
    pointerEvents: pointerCountRef.current,
    chaseDurationMs: chaseStartRef.current ? Date.now() - chaseStartRef.current : 0,
    evadeCount: evadeCountRef.current,
    surrendered,
  }), [surrendered])

  // Timer tick — auto-pass at 3s
  useEffect(() => {
    if (!chasing || passed) return
    const id = setInterval(() => {
      const elapsed = (Date.now() - chaseStartRef.current) / 1000
      setChaseTime(elapsed)
      if (elapsed >= 3) {
        setPassed(true)
        clearInterval(id)
        // Auto-pass after 3s of chasing
        setTimeout(() => onCaught(getBehavioralData()), 400)
      }
    }, 50)
    return () => clearInterval(id)
  }, [chasing, passed, onCaught, getBehavioralData])

  const processPointer = useCallback((clientX: number, clientY: number) => {
    if (surrendered || passed) return
    const container = containerRef.current
    const btn = btnRef.current
    if (!container || !btn) return

    pointerCountRef.current++

    const rect = container.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    const bx = btnRect.left - rect.left + btnRect.width / 2
    const by = btnRect.top - rect.top + btnRect.height / 2
    const dist = Math.sqrt((px - bx) ** 2 + (py - by) ** 2)

    // Start chase on first approach
    if (dist < 150 && !chaseStartRef.current) {
      chaseStartRef.current = Date.now()
      setChasing(true)
    }

    // Evade when pointer gets close
    if (dist < 80) {
      // Sometimes let them catch it after enough chasing (15% chance after 1.5s)
      const elapsed = chaseStartRef.current ? (Date.now() - chaseStartRef.current) / 1000 : 0
      if (elapsed > 1.5 && Math.random() < 0.15) {
        setSurrendered(true)
        return
      }

      evadeCountRef.current++

      const angle = Math.atan2(by - py, bx - px)
      const jump = 15 + Math.random() * 20
      let nx = pos.x + Math.cos(angle) * jump
      let ny = pos.y + Math.sin(angle) * jump

      nx = Math.max(12, Math.min(88, nx))
      ny = Math.max(12, Math.min(88, ny))

      // Escape corners
      if ((nx <= 14 || nx >= 86) && (ny <= 14 || ny >= 86)) {
        nx = 50 + (Math.random() - 0.5) * 40
        ny = 50 + (Math.random() - 0.5) * 40
      }

      setPos({ x: nx, y: ny })
    }
  }, [surrendered, passed, pos])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    processPointer(e.clientX, e.clientY)
  }, [processPointer])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      processPointer(e.touches[0].clientX, e.touches[0].clientY)
    }
  }, [processPointer])

  const handleClick = () => {
    // Insta-click with no chase = bot
    if (!chasing || (chaseStartRef.current && (Date.now() - chaseStartRef.current) < 300)) {
      onBotDetected?.(getBehavioralData())
      return
    }
    // Only clickable when surrendered
    if (surrendered) {
      setPassed(true)
      setTimeout(() => onCaught(getBehavioralData()), 200)
    }
  }

  const progressPct = Math.min(100, (chaseTime / 3) * 100)

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        className="relative w-full h-52 bg-surface border border-border rounded-lg overflow-hidden select-none touch-none"
      >
        {/* Progress bar */}
        {chasing && !passed && (
          <div className="absolute top-0 left-0 h-1 bg-accent transition-all duration-100" style={{ width: `${progressPct}%` }} />
        )}

        {chasing && !surrendered && !passed && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs text-muted font-mono">
            {chaseTime.toFixed(1)}s / 3.0s
          </div>
        )}
        {surrendered && !passed && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs text-success font-semibold">
            It stopped! Tap it!
          </div>
        )}
        {passed && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs text-success font-semibold">
            Verified!
          </div>
        )}

        <button
          ref={btnRef}
          onClick={handleClick}
          className={`absolute px-5 py-2.5 rounded-lg font-semibold text-sm transition-all duration-100 -translate-x-1/2 -translate-y-1/2 ${
            passed
              ? 'bg-success text-white scale-110'
              : surrendered
                ? 'bg-success text-white hover:bg-success-hover cursor-pointer animate-pulse'
                : 'bg-accent text-white cursor-default'
          }`}
          style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        >
          {passed ? '✓' : surrendered ? 'Click me!' : 'Catch me!'}
        </button>

        {!chasing && (
          <p className="absolute bottom-3 w-full text-center text-xs text-muted">
            Move toward the button to start
          </p>
        )}
      </div>
      <p className="text-xs text-muted text-center">
        Chase the button for 3 seconds to pass, or catch it if it stops.
        <br />
        <span className="text-subtle">Accessibility: on mobile, drag your finger across the box. Screen reader users can tap randomly — the timer still counts.</span>
      </p>
    </div>
  )
}
