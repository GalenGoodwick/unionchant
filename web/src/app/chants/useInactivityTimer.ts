'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const INACTIVITY_TIMEOUT = 10 * 60 * 1000 // 10 minutes
const WARNING_THRESHOLD = 9 * 60 * 1000   // Warning at 9 minutes (1 min before boot)

interface UseInactivityTimerOptions {
  /** Whether the timer is active (only when docked/in a cell) */
  enabled: boolean
  /** Called when the user is booted for inactivity */
  onBoot: () => void
}

interface UseInactivityTimerReturn {
  /** Whether the 1-minute warning is showing */
  warning: boolean
  /** Seconds remaining until boot (only meaningful when warning=true) */
  secondsLeft: number
  /** Dismiss the warning and reset the timer */
  dismissWarning: () => void
}

export function useInactivityTimer({ enabled, onBoot }: UseInactivityTimerOptions): UseInactivityTimerReturn {
  const [warning, setWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(60)
  const lastActivityRef = useRef(Date.now())
  const warningRef = useRef(false)
  const bootTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const resetTimers = useCallback(() => {
    lastActivityRef.current = Date.now()
    warningRef.current = false
    setWarning(false)
    setSecondsLeft(60)

    if (bootTimeoutRef.current) clearTimeout(bootTimeoutRef.current)
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
  }, [])

  const startTimers = useCallback(() => {
    resetTimers()

    // Warning at 9 minutes
    warningTimeoutRef.current = setTimeout(() => {
      warningRef.current = true
      setWarning(true)
      setSecondsLeft(60)

      // Countdown every second
      countdownRef.current = setInterval(() => {
        const elapsed = Date.now() - lastActivityRef.current
        const remaining = Math.max(0, Math.ceil((INACTIVITY_TIMEOUT - elapsed) / 1000))
        setSecondsLeft(remaining)
      }, 1000)
    }, WARNING_THRESHOLD)

    // Boot at 10 minutes
    bootTimeoutRef.current = setTimeout(() => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      setWarning(false)
      onBoot()
    }, INACTIVITY_TIMEOUT)
  }, [resetTimers, onBoot])

  const handleActivity = useCallback(() => {
    if (!warningRef.current) {
      // Only reset if not in warning state — during warning, only explicit dismiss resets
      lastActivityRef.current = Date.now()
      // Restart the timeout chain
      if (bootTimeoutRef.current) clearTimeout(bootTimeoutRef.current)
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current)

      warningTimeoutRef.current = setTimeout(() => {
        warningRef.current = true
        setWarning(true)
        setSecondsLeft(60)
        countdownRef.current = setInterval(() => {
          const elapsed = Date.now() - lastActivityRef.current
          const remaining = Math.max(0, Math.ceil((INACTIVITY_TIMEOUT - elapsed) / 1000))
          setSecondsLeft(remaining)
        }, 1000)
      }, WARNING_THRESHOLD)

      bootTimeoutRef.current = setTimeout(() => {
        if (countdownRef.current) clearInterval(countdownRef.current)
        setWarning(false)
        onBoot()
      }, INACTIVITY_TIMEOUT)
    }
  }, [onBoot])

  const dismissWarning = useCallback(() => {
    startTimers()
  }, [startTimers])

  useEffect(() => {
    if (!enabled) {
      resetTimers()
      return
    }

    startTimers()

    const events = ['scroll', 'click', 'keydown', 'mousemove', 'touchstart', 'input'] as const
    const handler = () => handleActivity()

    for (const event of events) {
      window.addEventListener(event, handler, { passive: true })
    }

    return () => {
      resetTimers()
      for (const event of events) {
        window.removeEventListener(event, handler)
      }
    }
  }, [enabled, startTimers, resetTimers, handleActivity])

  return { warning, secondsLeft, dismissWarning }
}
