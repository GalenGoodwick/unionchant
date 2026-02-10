'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

export interface ChasePoint {
  x: number  // 0-100 (% of container)
  y: number  // 0-100
  t: number  // ms since chase start
}

export interface ChallengeData {
  pointerEvents: number
  chaseDurationMs: number
  evadeCount: number
  surrendered: boolean
  chasePath: ChasePoint[]
}

interface RunawayButtonProps {
  onCaught: (data: ChallengeData) => void
  onBotDetected?: (data: ChallengeData) => void
}

// ── Synthesized sound effects via Web Audio API ──

let audioCtx: AudioContext | null = null
function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function playVroomUp() {
  try {
    const ctx = getAudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(150, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.35)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch { /* silent fallback */ }
}

function playDing() {
  try {
    const ctx = getAudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08)
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch { /* silent fallback */ }
}

function playVroomDown() {
  try {
    const ctx = getAudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(500, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.4)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.45)
  } catch { /* silent fallback */ }
}

let drumRollOsc: OscillatorNode | null = null
let drumRollGain: GainNode | null = null

function startDrumRoll() {
  try {
    const ctx = getAudioCtx()
    // Noise-like rapid tapping via low-frequency square wave
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(80, ctx.currentTime)
    gain.gain.setValueAtTime(0.04, ctx.currentTime)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    drumRollOsc = osc
    drumRollGain = gain
  } catch { /* silent fallback */ }
}

function updateDrumRoll(progress: number) {
  // Speed up and get louder as progress increases (0-1)
  try {
    if (!drumRollOsc || !drumRollGain) return
    const ctx = getAudioCtx()
    drumRollOsc.frequency.setTargetAtTime(80 + progress * 120, ctx.currentTime, 0.05)
    drumRollGain.gain.setTargetAtTime(0.04 + progress * 0.08, ctx.currentTime, 0.05)
  } catch { /* silent fallback */ }
}

function stopDrumRoll() {
  try {
    if (drumRollOsc) {
      drumRollOsc.stop()
      drumRollOsc = null
    }
    drumRollGain = null
  } catch { /* silent fallback */ }
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
  const chasePathRef = useRef<ChasePoint[]>([])
  const lastSampleRef = useRef<number>(0)
  const completedRef = useRef(false) // guard against double-fire
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
    chasePath: chasePathRef.current,
  }), [surrendered])

  // Timer tick — accumulates while active, decays while idle, freezes on surrender
  useEffect(() => {
    if (!chasing || passed || surrendered) return
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
      updateDrumRoll(Math.min(1, elapsed / 3))

      if (elapsed >= 3) {
        if (completedRef.current) return
        completedRef.current = true
        stopDrumRoll()
        setPassed(true)
        playVroomDown()
        clearInterval(id)
        setTimeout(() => onCaught(getBehavioralData()), 400)
      }
    }, 50)
    return () => clearInterval(id)
  }, [chasing, passed, surrendered, onCaught, getBehavioralData])

  const processPointer = useCallback((clientX: number, clientY: number) => {
    if (surrendered || passed || !started) return
    const container = containerRef.current
    const btn = btnRef.current
    if (!container || !btn) return

    pointerCountRef.current++
    const now = Date.now()
    lastPointerMoveRef.current = now

    const rect = container.getBoundingClientRect()

    // Sample chase path every ~50ms (capped at ~200 points for a 10s chase)
    if (chaseStartRef.current && now - lastSampleRef.current >= 50) {
      lastSampleRef.current = now
      const pxPct = ((clientX - rect.left) / rect.width) * 100
      const pyPct = ((clientY - rect.top) / rect.height) * 100
      chasePathRef.current.push({
        x: Math.round(pxPct * 10) / 10,
        y: Math.round(pyPct * 10) / 10,
        t: now - chaseStartRef.current,
      })
    }
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
      playVroomUp()
      startDrumRoll()
    }

    // Evade when pointer gets close
    if (dist < 80) {
      evadeCountRef.current++

      const elapsed = accumulatedMsRef.current / 1000
      if (elapsed > 1.5 && Math.random() < 0.15) {
        stopDrumRoll()
        setSurrendered(true)
        playDing()
        return
      }

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
    // Unlock AudioContext on user gesture (required for mobile browsers)
    getAudioCtx()
    setStarted(true)
    lastPointerMoveRef.current = Date.now()
  }

  const handleClick = () => {
    // Guard OFF — button surrendered, legitimate human click
    if (surrendered && !passed) {
      if (completedRef.current) return
      completedRef.current = true
      setPassed(true)
      playVroomDown()
      setTimeout(() => onCaught(getBehavioralData()), 200)
      return
    }
    // Guard ON — clicking a moving button = hacking
    // Also catches pre-chase insta-clicks
    if (!surrendered) {
      onBotDetected?.(getBehavioralData())
      return
    }
  }

  const progressPct = Math.min(100, (chaseTime / 3) * 100)

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        onTouchStart={() => getAudioCtx()}
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
          <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs text-success font-semibold" role="status" aria-live="assertive">
            It stopped! Tap it!
          </div>
        )}
        {passed && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs text-success font-semibold" role="status" aria-live="assertive">
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
            onTouchEnd={surrendered && !passed ? (e) => { e.preventDefault(); handleClick() } : undefined}
            className={`absolute px-5 py-2.5 rounded-lg font-semibold text-sm transition-all duration-100 -translate-x-1/2 -translate-y-1/2 touch-auto ${
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
        <span className="text-subtle">Screen reader: a rising sound starts the chase with a drum roll. A ding means the button stopped — tap anywhere in the box to catch it. A falling sound means you passed.</span>
      </p>
    </div>
  )
}
