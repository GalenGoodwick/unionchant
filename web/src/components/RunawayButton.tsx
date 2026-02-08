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
 * - Chase the button for 3 seconds of active pursuit to auto-pass
 * - Timer decays if you stop moving — can't pause and resume
 * - Sometimes it surrenders — click it to pass early
 * - Insta-click with no chase = bot = flagged
 * - Mobile: tap a start circle first, then chase with finger
 * - Desktop: move cursor toward button to start
 */
export default function RunawayButton({ onCaught, onBotDetected }: RunawayButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const lastPointerMoveRef = useRef<number>(0)
  const accumulatedMsRef = useRef<number>(0)
  const pointerCountRef = useRef<number>(0)
  const evadeCountRef = useRef<number>(0)
  const chaseStartRef = useRef<number>(0)
  const [pos, setPos] = useState({ x: 50, y: 50 })
  const [surrendered, setSurrendered] = useState(false)
  const [started, setStarted] = useState(false)
  const [chasing, setChasing] = useState(false)
  const [chaseTime, setChaseTime] = useState(0)
  const [passed, setPassed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile on mount — desktop auto-starts
  useEffect(() => {
    const mobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    setIsMobile(mobile)
    if (!mobile) setStarted(true)
  }, [])

  const getBehavioralData = useCallback((): ChallengeData => ({
    pointerEvents: pointerCountRef.current,
    chaseDurationMs: accumulatedMsRef.current,
    evadeCount: evadeCountRef.current,
    surrendered,
  }), [surrendered])

  // Timer tick — accumulates while active, decays while idle
  useEffect(() => {
    if (!chasing || passed) return
    const id = setInterval(() => {
      const now = Date.now()
      const timeSinceMove = now - lastPointerMoveRef.current

      if (timeSinceMove < 600) {
        // Active — accumulate
        accumulatedMsRef.current += 50
      } else {
        // Idle — decay at same rate
        accumulatedMsRef.current = Math.max(0, accumulatedMsRef.current - 50)
      }

      const elapsed = accumulatedMsRef.current / 1000
      setChaseTime(elapsed)

      if (elapsed >= 3) {
        setPassed(true)
        clearInterval(id)
        setTimeout(() => onCaught(getBehavioralData()), 400)
      }
    }, 50)
    return () => clearInterval(id)
  }, [chasing, passed, onCaught, getBehavioralData])

  const processPointer = useCallback((clientX: number, clientY: number) => {
    if (surrendered || passed || !started) return
    const container = containerRef.current
    const btn = btnRef.current
    if (!container || !btn) return

    pointerCountRef.current++
    lastPointerMoveRef.current = Date.now()

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
      lastPointerMoveRef.current = Date.now()
      setChasing(true)
    }

    // Evade when pointer gets close
    if (dist < 80) {
      const elapsed = accumulatedMsRef.current / 1000
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

      if ((nx <= 14 || nx >= 86) && (ny <= 14 || ny >= 86)) {
        nx = 50 + (Math.random() - 0.5) * 40
        ny = 50 + (Math.random() - 0.5) * 40
      }

      setPos({ x: nx, y: ny })
    }
  }, [surrendered, passed, started, pos])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    processPointer(e.clientX, e.clientY)
  }, [processPointer])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      processPointer(e.touches[0].clientX, e.touches[0].clientY)
    }
  }, [processPointer])

  const handleStart = () => {
    setStarted(true)
    lastPointerMoveRef.current = Date.now()
  }

  const handleClick = () => {
    if (!chasing || (chaseStartRef.current && (Date.now() - chaseStartRef.current) < 300)) {
      onBotDetected?.(getBehavioralData())
      return
    }
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

        {/* Mobile start circle — tap to begin */}
        {!started && isMobile && (
          <button
            onClick={handleStart}
            onTouchEnd={(e) => { e.preventDefault(); handleStart() }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full border-4 border-dashed border-accent/60 bg-accent/10 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform touch-auto"
          >
            <span className="text-accent text-2xl">👆</span>
            <span className="text-accent text-xs font-semibold">Tap to start</span>
          </button>
        )}

        {/* Runaway button — hidden until started on mobile, always visible on desktop */}
        {(started || !isMobile) && (
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
        )}

        {/* Desktop: prompt to approach */}
        {!started && !isMobile && !chasing && (
          <p className="absolute bottom-3 w-full text-center text-xs text-muted">
            Move your cursor toward the button to start
          </p>
        )}

        {/* Mobile: post-start instructions */}
        {started && !chasing && isMobile && (
          <p className="absolute bottom-3 w-full text-center text-xs text-muted">
            Drag your finger toward the button
          </p>
        )}
      </div>
      <p className="text-xs text-muted text-center">
        Chase the button for 3 seconds to pass, or catch it if it stops.
        {!chasing && <><br /><span className="text-subtle">Timer decays if you stop — keep chasing!</span></>}
        <br />
        <span className="text-subtle">Accessibility: drag your finger across the box. The timer counts all movement.</span>
      </p>
    </div>
  )
}
