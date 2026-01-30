import { useEffect, useRef, useCallback, useState } from 'react'

type Options = {
  /** Base interval when idle (default: 15000ms) */
  slowInterval?: number
  /** Fast interval during activity (default: 3000ms) */
  fastInterval?: number
  /** How long to stay in fast mode after activity (default: 30000ms) */
  fastModeDuration?: number
  /** Whether to pause when tab is not visible (default: true) */
  pauseOnHidden?: boolean
}

/**
 * Adaptive polling hook that speeds up during activity and slows down when idle.
 * Pauses when the browser tab is hidden.
 */
export function useAdaptivePolling(
  callback: () => void | Promise<void>,
  options: Options = {}
) {
  const {
    slowInterval = 15000,
    fastInterval = 3000,
    fastModeDuration = 30000,
    pauseOnHidden = true,
  } = options

  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const lastActivityRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [currentInterval, setCurrentInterval] = useState(slowInterval)

  // Signal activity to switch to fast polling
  const signalActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    setCurrentInterval(fastInterval)
  }, [fastInterval])

  useEffect(() => {
    const tick = async () => {
      // Check if we should be paused
      if (pauseOnHidden && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }

      await callbackRef.current()

      // Check if we should slow down
      const timeSinceActivity = Date.now() - lastActivityRef.current
      if (timeSinceActivity > fastModeDuration && currentInterval !== slowInterval) {
        setCurrentInterval(slowInterval)
      }
    }

    // Initial call
    tick()

    // Set up interval
    intervalRef.current = setInterval(tick, currentInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [currentInterval, slowInterval, fastModeDuration, pauseOnHidden])

  // Listen for visibility changes
  useEffect(() => {
    if (!pauseOnHidden || typeof document === 'undefined') return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Immediately fetch when tab becomes visible
        callbackRef.current()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [pauseOnHidden])

  return { signalActivity, currentInterval }
}
