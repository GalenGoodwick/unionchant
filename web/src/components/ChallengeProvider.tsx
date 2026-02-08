'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import RunawayButton, { type ChallengeData } from './RunawayButton'

/**
 * Server-authoritative challenge system.
 *
 * Checks /api/challenge/status:
 * - On mount (2s delay)
 * - On every page navigation
 * - Every 30s via interval
 *
 * When server says needsChallenge, modal pops over everything.
 * Can't be bypassed by navigating — re-checks on every route.
 */
export default function ChallengeProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [showChallenge, setShowChallenge] = useState(false)
  const showRef = useRef(false)
  const checkingRef = useRef(false)

  // Keep ref in sync so interval closure reads fresh value
  useEffect(() => { showRef.current = showChallenge }, [showChallenge])

  useEffect(() => {
    if (!session?.user) return

    let mounted = true

    const check = async () => {
      if (checkingRef.current || showRef.current) return
      checkingRef.current = true
      try {
        const res = await fetch(`/api/challenge/status?t=${Date.now()}`, { cache: 'no-store' })
        const data = await res.json()
        if (mounted && data.needsChallenge) {
          setShowChallenge(true)
          showRef.current = true
        }
      } catch { /* silent */ }
      checkingRef.current = false
    }

    // Check after short delay on mount / navigation
    const timeoutId = setTimeout(check, 1500)

    // Also poll every 30s for admin triggers while user sits on one page
    const intervalId = setInterval(check, 30_000)

    return () => {
      mounted = false
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [session?.user?.email, pathname]) // re-runs on every navigation

  const handleCaught = async (data: ChallengeData) => {
    try {
      const res = await fetch('/api/challenge/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: 'passed',
          pointerEvents: data.pointerEvents,
          chaseDurationMs: data.chaseDurationMs,
          evadeCount: data.evadeCount,
        }),
      })
      const json = await res.json()
      if (json.verified) {
        setShowChallenge(false)
        showRef.current = false
      }
    } catch { /* challenge stays up */ }
  }

  const handleBotDetected = async (data: ChallengeData) => {
    try {
      await fetch('/api/challenge/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: 'failed_insta_click',
          pointerEvents: data.pointerEvents,
          chaseDurationMs: data.chaseDurationMs,
          evadeCount: data.evadeCount,
        }),
      })
    } catch { /* silent */ }
  }

  return (
    <>
      {children}
      {showChallenge && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg p-6 max-w-md w-full border border-border shadow-2xl">
            <h2 className="text-lg font-bold text-foreground text-center mb-1">
              Still human?
            </h2>
            <p className="text-muted text-sm text-center mb-4">
              Quick check — catch the button to continue.
            </p>
            <RunawayButton onCaught={handleCaught} onBotDetected={handleBotDetected} />
          </div>
        </div>
      )}
    </>
  )
}
