'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
 * Challenge token ties each attempt to a server-issued nonce.
 */
export default function ChallengeProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [showChallenge, setShowChallenge] = useState(false)
  const [challengeToken, setChallengeToken] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
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
          setChallengeToken(data.challengeToken || null)
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

  const handleCaught = useCallback(async (data: ChallengeData) => {
    try {
      const res = await fetch('/api/challenge/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: 'passed',
          challengeToken,
          pointerEvents: data.pointerEvents,
          chaseDurationMs: data.chaseDurationMs,
          evadeCount: data.evadeCount,
          surrendered: data.surrendered,
          chasePath: data.chasePath,
        }),
      })
      const json = await res.json()
      if (json.verified) {
        setShowChallenge(false)
        showRef.current = false
        setChallengeToken(null)
      } else {
        // Server rejected — fetch fresh token and reset the RunawayButton
        try {
          const statusRes = await fetch(`/api/challenge/status?t=${Date.now()}`, { cache: 'no-store' })
          const statusData = await statusRes.json()
          if (statusData.needsChallenge) {
            setChallengeToken(statusData.challengeToken || null)
          }
        } catch { /* use existing token */ }
        setRetryKey(k => k + 1)
      }
    } catch {
      // Network error — reset button so user can retry
      setRetryKey(k => k + 1)
    }
  }, [challengeToken])

  const handleBotDetected = useCallback(async (data: ChallengeData) => {
    try {
      await fetch('/api/challenge/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: 'failed_insta_click',
          challengeToken,
          pointerEvents: data.pointerEvents,
          chaseDurationMs: data.chaseDurationMs,
          evadeCount: data.evadeCount,
          surrendered: data.surrendered,
          chasePath: data.chasePath,
        }),
      })
    } catch { /* silent */ }
  }, [challengeToken])

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
            <div className="sr-only" role="note">
              Audio cues: A rising vroom sound with a drum roll means the chase has started.
              A ding means the button has stopped moving — tap anywhere in the box to catch it.
              A falling vroom sound means you passed the challenge.
            </div>
            <RunawayButton key={retryKey} onCaught={handleCaught} onBotDetected={handleBotDetected} />
          </div>
        </div>
      )}
    </>
  )
}
